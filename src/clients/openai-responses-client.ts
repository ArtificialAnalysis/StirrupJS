/**
 * OpenAI Responses API client implementation
 * Uses the newer POST /v1/responses endpoint instead of Chat Completions
 */

import OpenAI from 'openai';
import retry from 'async-retry';
import type { LLMClient, ChatMessage, AssistantMessage, Tool, ToolCall, TokenUsage } from '../core/models.js';
import { ContextOverflowError } from '../core/models.js';
import { toOpenAITools } from './utils.js';
import { MAX_RETRY_ATTEMPTS, RETRY_MIN_TIMEOUT, RETRY_MAX_TIMEOUT } from '../constants.js';

export interface OpenResponsesClientConfig {
  /** Model identifier (e.g., 'gpt-4o', 'o3-mini') */
  model: string;

  /** Maximum tokens in context window */
  maxTokens?: number;

  /** API key for authentication */
  apiKey?: string;

  /** Base URL for OpenAI-compatible endpoints */
  baseURL?: string;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Temperature for sampling */
  temperature?: number;

  /** Reasoning effort for o-series models */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/**
 * OpenAI Responses API client
 * Uses the Responses API (POST /v1/responses) for generation
 */
export class OpenResponsesClient implements LLMClient {
  private client: OpenAI;
  private config: {
    model: string;
    maxTokens: number;
    maxRetries: number;
    temperature: number;
    reasoningEffort?: 'low' | 'medium' | 'high';
  };

  constructor(config: OpenResponsesClientConfig) {
    const {
      model,
      maxTokens = 128_000,
      apiKey = process.env.OPENAI_API_KEY,
      baseURL,
      maxRetries = MAX_RETRY_ATTEMPTS,
      temperature = 1.0,
      reasoningEffort,
    } = config;

    if (!apiKey) {
      throw new Error('API key is required. Set OPENAI_API_KEY environment variable.');
    }

    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 0 });
    this.config = { model, maxTokens, maxRetries, temperature, reasoningEffort };
  }

  get modelSlug(): string {
    return this.config.model;
  }

  get maxTokens(): number {
    return this.config.maxTokens;
  }

  async generate(messages: ChatMessage[], tools: Map<string, Tool>): Promise<AssistantMessage> {
    const input = this.toResponsesInput(messages);
    const responsesTools = tools.size > 0 ? this.toResponsesTools(tools) : undefined;

    // Extract system message for the instructions parameter
    const systemMessage = messages.find((m) => m.role === 'system');
    const instructions = systemMessage
      ? typeof systemMessage.content === 'string'
        ? systemMessage.content
        : JSON.stringify(systemMessage.content)
      : undefined;

    const params: Record<string, unknown> = {
      model: this.config.model,
      input,
      temperature: this.config.temperature,
    };

    if (instructions) {
      params.instructions = instructions;
    }

    if (responsesTools && responsesTools.length > 0) {
      params.tools = responsesTools;
    }

    if (this.config.reasoningEffort) {
      params.reasoning = { effort: this.config.reasoningEffort };
    }

    try {
      const response = await retry(
        async () => {
          return await (this.client as any).responses.create(params);
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
      if (error instanceof Error && error.message.includes('context_length_exceeded')) {
        throw new ContextOverflowError('Context window exceeded');
      }
      throw error;
    }
  }

  /**
   * Convert Stirrup messages to Responses API input format
   */
  private toResponsesInput(messages: ChatMessage[]): unknown[] {
    const input: unknown[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // System messages are handled via the instructions parameter
        continue;
      }

      if (message.role === 'user') {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        input.push({
          type: 'message',
          role: 'user',
          content,
        });
      } else if (message.role === 'assistant') {
        // Map assistant content to output message
        if (message.content) {
          const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
          if (content) {
            input.push({
              type: 'message',
              role: 'assistant',
              content,
            });
          }
        }

        // Map tool calls to function_call items
        if (message.toolCalls) {
          for (const tc of message.toolCalls) {
            const callId = tc.toolCallId ?? `call_${Math.random().toString(36).slice(2, 11)}`;
            input.push({
              type: 'function_call',
              id: callId,
              call_id: callId,
              name: tc.name,
              arguments: tc.arguments,
            });
          }
        }
      } else if (message.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        });
      }
    }

    return input;
  }

  /**
   * Convert tools to Responses API function tool format
   */
  private toResponsesTools(tools: Map<string, Tool>): unknown[] {
    // The Responses API uses the same function tool format as Chat Completions
    const openaiTools = toOpenAITools(tools);
    return openaiTools;
  }

  /**
   * Parse Responses API response into AssistantMessage
   */
  private parseResponse(response: any): AssistantMessage {
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    const output = response.output ?? [];
    for (const item of output) {
      if (item.type === 'message') {
        // Extract text from content array
        for (const part of item.content ?? []) {
          if (part.type === 'output_text') {
            textContent += part.text;
          }
        }
      } else if (item.type === 'function_call') {
        toolCalls.push({
          name: item.name,
          arguments: item.arguments,
          toolCallId: item.call_id ?? item.id,
        });
      }
    }

    let tokenUsage: TokenUsage | undefined;
    if (response.usage) {
      tokenUsage = {
        input: response.usage.input_tokens ?? 0,
        output: response.usage.output_tokens ?? 0,
        reasoning: response.usage.output_tokens_details?.reasoning_tokens ?? 0,
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
