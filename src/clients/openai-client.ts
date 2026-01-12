/**
 * OpenAI-compatible LLM client implementation
 * Supports OpenAI API and compatible endpoints (OpenRouter, Deepseek, etc.)
 */

import OpenAI from 'openai';
import retry from 'async-retry';
import type {
  LLMClient,
  ChatMessage,
  AssistantMessage,
  Tool,
  ToolCall,
  TokenUsage,
} from '../core/models.js';
import { ContextOverflowError } from '../core/models.js';
import { toOpenAIMessages, toOpenAITools } from './utils.js';
import { MAX_RETRY_ATTEMPTS, RETRY_MIN_TIMEOUT, RETRY_MAX_TIMEOUT } from '../constants.js';

export interface ChatCompletionsClientConfig {
  /** Model identifier (e.g., 'gpt-4o', 'deepseek-chat') */
  model: string;

  /** Maximum tokens in context window */
  maxTokens?: number;

  /** API key for authentication */
  apiKey?: string;

  /** Base URL for OpenAI-compatible endpoints */
  baseURL?: string;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Temperature for sampling (0-2) */
  temperature?: number;

  /** Whether to include reasoning tokens (for o1/o3 models) */
  includeReasoningTokens?: boolean;

  /** Reasoning effort level for extended thinking models */
  reasoningEffort?: 'low' | 'medium' | 'high';

  /** Whether the model supports audio input */
  supportsAudioInput?: boolean;
}

/**
 * OpenAI-compatible LLM client
 * Works with OpenAI API and compatible endpoints
 */
export class ChatCompletionsClient implements LLMClient {
  private client: OpenAI;
  private config: Required<Omit<ChatCompletionsClientConfig, 'baseURL' | 'reasoningEffort' | 'supportsAudioInput'>> & {
    reasoningEffort?: 'low' | 'medium' | 'high';
    supportsAudioInput: boolean;
  };

  constructor(config: ChatCompletionsClientConfig) {
    const {
      model,
      maxTokens = 128_000,
      apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY,
      baseURL,
      maxRetries = MAX_RETRY_ATTEMPTS,
      temperature = 1.0,
      includeReasoningTokens = false,
      reasoningEffort,
      supportsAudioInput = false,
    } = config;

    if (!apiKey) {
      throw new Error('API key is required. Set OPENAI_API_KEY or OPENROUTER_API_KEY environment variable.');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 0, // We handle retries ourselves
    });

    this.config = {
      model,
      maxTokens,
      apiKey,
      maxRetries,
      temperature,
      includeReasoningTokens,
      reasoningEffort,
      supportsAudioInput,
    };
  }

  get modelSlug(): string {
    return this.config.model;
  }

  get maxTokens(): number {
    return this.config.maxTokens;
  }

  async generate(messages: ChatMessage[], tools: Map<string, Tool>): Promise<AssistantMessage> {
    const openaiMessages = toOpenAIMessages(messages);
    const openaiTools = tools.size > 0 ? toOpenAITools(tools) : undefined;

    const params: OpenAI.ChatCompletionCreateParams = {
      model: this.config.model,
      messages: openaiMessages as OpenAI.ChatCompletionMessageParam[],
      temperature: this.config.temperature,
    };

    if (openaiTools && openaiTools.length > 0) {
      params.tools = openaiTools as OpenAI.ChatCompletionTool[];
      params.tool_choice = 'auto';
    }

    // Add reasoning effort for o1/o3 models (extended parameter not in official types)
    if (this.config.reasoningEffort) {
      Object.assign(params, { reasoning_effort: this.config.reasoningEffort });
    }

    try {
      const response = await retry(
        async () => {
          return await this.client.chat.completions.create(params);
        },
        {
          retries: this.config.maxRetries,
          minTimeout: RETRY_MIN_TIMEOUT,
          maxTimeout: RETRY_MAX_TIMEOUT,
          onRetry: (error: Error, attempt: number) => {
            console.warn(`Retry attempt ${attempt} after error:`, error.message);
          },
        }
      );

      return this.parseResponse(response);
    } catch (error) {
      // Check for context overflow errors
      if (error instanceof Error && error.message.includes('context_length_exceeded')) {
        throw new ContextOverflowError('Context window exceeded');
      }
      throw error;
    }
  }

  private parseResponse(response: OpenAI.ChatCompletion): AssistantMessage {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choices in response');
    }

    const message = choice.message;

    const content = message.content ?? '';

    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        toolCalls.push({
          name: tc.function.name,
          arguments: tc.function.arguments,
          toolCallId: tc.id,
        });
      }
    }

    let tokenUsage: TokenUsage | undefined;
    if (response.usage) {
      // Extended usage details with reasoning tokens (not in all API versions)
      const usageWithDetails = response.usage as typeof response.usage & {
        completion_tokens_details?: { reasoning_tokens?: number };
      };

      tokenUsage = {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        reasoning: this.config.includeReasoningTokens
          ? usageWithDetails.completion_tokens_details?.reasoning_tokens ?? 0
          : 0,
      };
    }

    return {
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      tokenUsage,
    };
  }
}
