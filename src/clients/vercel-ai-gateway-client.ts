/**
 * Vercel AI SDK client for multi-provider support
 * Supports OpenAI, Anthropic, Google, and other providers via unified interface
 */

import type { LanguageModel, ModelMessage, ToolSet } from 'ai';
import { generateText } from 'ai';
import retry from 'async-retry';
import { MAX_RETRY_ATTEMPTS, RETRY_MAX_TIMEOUT, RETRY_MIN_TIMEOUT } from '../constants.js';
import type { AssistantMessage, ChatMessage, LLMClient, TokenUsage, Tool, ToolCall } from '../core/models.js';
import { ContextOverflowError } from '../core/models.js';

export interface VercelAIClientConfig {
  /** Vercel AI SDK model instance */
  model: LanguageModel;

  /** Model identifier for display */
  modelSlug: string;

  /** Maximum tokens in context window */
  maxTokens: number;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Temperature for sampling */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokensToGenerate?: number;
}

/**
 * Vercel AI SDK client for multi-provider support
 * Provides unified interface to OpenAI, Anthropic, Google, and other providers
 */
export class VercelAIClient implements LLMClient {
  private model: LanguageModel;
  private config: Required<Omit<VercelAIClientConfig, 'model'>>;

  constructor(config: VercelAIClientConfig) {
    const {
      model,
      modelSlug,
      maxTokens,
      maxRetries = MAX_RETRY_ATTEMPTS,
      temperature = 1.0,
      maxTokensToGenerate = 4096,
    } = config;

    this.model = model;
    this.config = {
      modelSlug,
      maxTokens,
      maxRetries,
      temperature,
      maxTokensToGenerate,
    };
  }

  get modelSlug(): string {
    return this.config.modelSlug;
  }

  get maxTokens(): number {
    return this.config.maxTokens;
  }

  async generate(messages: ChatMessage[], tools: Map<string, Tool>): Promise<AssistantMessage> {
    const coreMessages = this.toCoreMessages(messages);

    const coreTools = tools.size > 0 ? this.toCoreTools(tools) : undefined;

    try {
      const response = await retry(
        async () => {
          return await generateText({
            model: this.model,
            messages: coreMessages,
            tools: coreTools,
            temperature: this.config.temperature,
            maxOutputTokens: this.config.maxTokensToGenerate,
          });
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
      if (error instanceof Error && error.message.includes('context')) {
        throw new ContextOverflowError('Context window exceeded');
      }
      throw error;
    }
  }

  private toCoreMessages(messages: ChatMessage[]): ModelMessage[] {
    const coreMessages: ModelMessage[] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          coreMessages.push({
            role: 'system',
            content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
          });
          break;

        case 'user':
          coreMessages.push({
            role: 'user',
            content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
          });
          break;

        case 'assistant': {
          // Build content parts for assistant message
          const contentText = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

          if (message.toolCalls && message.toolCalls.length > 0) {
            // Assistant message with tool calls
            coreMessages.push({
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: contentText,
                },
                ...message.toolCalls.map((tc) => ({
                  type: 'tool-call' as const,
                  toolCallId: tc.toolCallId ?? `call_${Math.random().toString(36).slice(2, 11)}`,
                  toolName: tc.name,
                  input: JSON.parse(tc.arguments) as unknown,
                })),
              ],
            });
          } else {
            // Simple text assistant message
            coreMessages.push({
              role: 'assistant',
              content: contentText,
            });
          }
          break;
        }

        case 'tool':
          coreMessages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: message.toolCallId,
                toolName: message.name,
                output: {
                  type: 'text',
                  value: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                },
              },
            ],
          });
          break;
      }
    }

    return coreMessages;
  }

  private toCoreTools(tools: Map<string, Tool>): ToolSet {
    const coreTools: ToolSet = {};

    for (const [name, tool] of tools) {
      coreTools[name] = {
        description: tool.description,
        inputSchema: tool.parameters ?? undefined,
      } as unknown as ToolSet[string];
    }

    return coreTools;
  }

  private parseResponse(response: Awaited<ReturnType<typeof generateText>>): AssistantMessage {
    const content = response.text;

    const toolCalls: ToolCall[] = [];
    if (response.toolCalls) {
      for (const tc of response.toolCalls) {
        toolCalls.push({
          name: tc.toolName,
          arguments: JSON.stringify(tc.input),
          toolCallId: tc.toolCallId,
        });
      }
    }

    let tokenUsage: TokenUsage | undefined;
    if (response.usage) {
      tokenUsage = {
        input: response.usage.inputTokens ?? 0,
        output: response.usage.outputTokens ?? 0,
        reasoning: response.usage.outputTokenDetails?.reasoningTokens ?? 0,
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
