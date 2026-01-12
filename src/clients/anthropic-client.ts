/**
 * Anthropic Claude native client implementation
 */

import Anthropic from '@anthropic-ai/sdk';
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
import { toAnthropicMessages, toAnthropicTools } from './utils.js';
import { MAX_RETRY_ATTEMPTS, RETRY_MIN_TIMEOUT, RETRY_MAX_TIMEOUT } from '../constants.js';

export interface AnthropicClientConfig {
  /** Model identifier (e.g., 'claude-sonnet-4-5') */
  model: string;

  /** Maximum tokens in context window */
  maxTokens?: number;

  /** API key for authentication */
  apiKey?: string;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Temperature for sampling (0-1 for Claude) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokensToGenerate?: number;
}

/**
 * Anthropic Claude native client
 * Uses official Anthropic SDK
 */
export class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private config: Required<Omit<AnthropicClientConfig, 'apiKey'>>;

  constructor(config: AnthropicClientConfig) {
    const {
      model,
      maxTokens = 200_000,
      apiKey = process.env.ANTHROPIC_API_KEY,
      maxRetries = MAX_RETRY_ATTEMPTS,
      temperature = 1.0,
      maxTokensToGenerate = 8192,
    } = config;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.client = new Anthropic({
      apiKey,
      maxRetries: 0, // We handle retries ourselves
    });

    this.config = {
      model,
      maxTokens,
      maxRetries,
      temperature,
      maxTokensToGenerate,
    };
  }

  get modelSlug(): string {
    return this.config.model;
  }

  get maxTokens(): number {
    return this.config.maxTokens;
  }

  async generate(messages: ChatMessage[], tools: Map<string, Tool>): Promise<AssistantMessage> {
    const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
    const anthropicTools = tools.size > 0 ? toAnthropicTools(tools) : undefined;

    const params: Anthropic.MessageCreateParams = {
      model: this.config.model,
      max_tokens: this.config.maxTokensToGenerate,
      messages: anthropicMessages as Anthropic.MessageParam[],
      temperature: this.config.temperature,
    };

    if (system) {
      params.system = system;
    }

    if (anthropicTools && anthropicTools.length > 0) {
      params.tools = anthropicTools as Anthropic.Tool[];
    }

    try {
      const response = await retry(
        async () => {
          return await this.client.messages.create(params);
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
      if (
        error instanceof Anthropic.APIError &&
        (error.message.includes('prompt is too long') || error.message.includes('maximum context length'))
      ) {
        throw new ContextOverflowError('Context window exceeded');
      }
      throw error;
    }
  }

  private parseResponse(response: Anthropic.Message): AssistantMessage {
    let textContent = '';
    const toolCalls: ToolCall[] = [];
    let reasoningTokens = 0;

    for (const block of response.content) {
      const blockWithType = block as any;
      if (blockWithType.type === 'text') {
        textContent += blockWithType.text;
      } else if (blockWithType.type === 'tool_use') {
        toolCalls.push({
          name: blockWithType.name,
          arguments: JSON.stringify(blockWithType.input),
          toolCallId: blockWithType.id,
        });
      } else if (blockWithType.type === 'thinking') {
        // Extended thinking blocks (Claude can include thinking)
        // Count as reasoning tokens (approximate)
        const thinkingText = blockWithType.thinking;
        if (thinkingText) {
          reasoningTokens += Math.ceil(thinkingText.length / 4); // Rough token estimate
        }
      }
    }

    let tokenUsage: TokenUsage | undefined;
    if (response.usage) {
      tokenUsage = {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        reasoning: reasoningTokens,
      };
    }

    return {
      role: 'assistant',
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      tokenUsage,
    };
  }
}
