/**
 * OpenAI SDK-based LLM client for the Responses API.
 *
 * Uses the official OpenAI SDK's responses.create() method,
 * supporting both OpenAI's API and any OpenAI-compatible endpoint that implements
 * the Responses API via the `baseURL` parameter (e.g. OpenRouter).
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

import OpenAI from 'openai';
import retry from 'async-retry';
import type { LLMClient, ChatMessage, AssistantMessage, Tool, ToolCall, TokenUsage, Content } from '../core/models.js';
import { ContextOverflowError } from '../core/models.js';
import { zodToJsonSchema } from './utils.js';
import { MAX_RETRY_ATTEMPTS, RETRY_MIN_TIMEOUT, RETRY_MAX_TIMEOUT } from '../constants.js';

export interface OpenResponsesClientConfig {
  /** Model identifier (e.g., 'gpt-4o', 'o3-mini') */
  model: string;

  /** Maximum tokens in context window */
  maxTokens?: number;

  /** API key for authentication */
  apiKey?: string;

  /** Base URL for OpenAI-compatible endpoints (e.g. OpenRouter) */
  baseURL?: string;

  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Temperature for sampling */
  temperature?: number;

  /** Reasoning effort for o-series models */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/**
 * OpenAI SDK-based client using the Responses API.
 *
 * Uses the official OpenAI SDK's responses.create() method.
 * Supports custom baseURL for OpenAI-compatible providers that implement
 * the Responses API (e.g. OpenRouter).
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
      apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY,
      baseURL,
      maxRetries = MAX_RETRY_ATTEMPTS,
      temperature = 1.0,
      reasoningEffort,
    } = config;

    if (!apiKey) {
      throw new Error('API key is required. Set OPENAI_API_KEY or OPENROUTER_API_KEY environment variable.');
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
    const { instructions, input } = toResponsesInput(messages);
    const responsesTools = tools.size > 0 ? toResponsesTools(tools) : undefined;

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
      params.tool_choice = 'auto';
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

      return parseResponseOutput(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes('context_length_exceeded')) {
        throw new ContextOverflowError('Context window exceeded');
      }
      throw error;
    }
  }
}

// ============================================================================
// Input conversion
// ============================================================================

/**
 * Convert Content blocks to Responses API input content format.
 * Uses input_text for text content (vs output_text for responses).
 */
function contentToInputParts(content: Content): unknown[] {
  if (typeof content === 'string') {
    return [{ type: 'input_text', text: content }];
  }

  const out: unknown[] = [];
  for (const block of content) {
    if (typeof block === 'string') {
      out.push({ type: 'input_text', text: block });
    } else if (block.type === 'image') {
      out.push({ type: 'input_image', image_url: block.data });
    } else if (block.type === 'audio') {
      out.push({
        type: 'input_audio',
        input_audio: {
          data: block.data.split(',')[1],
          format: 'mp3',
        },
      });
    } else if (block.type === 'video') {
      out.push({ type: 'input_file', file_data: block.data });
    }
  }
  return out;
}

/**
 * Convert ChatMessage list to Responses API (instructions, input) pair.
 *
 * SystemMessage content is extracted as the instructions parameter.
 * Other messages are converted to input items.
 */
function toResponsesInput(messages: ChatMessage[]): { instructions: string | undefined; input: unknown[] } {
  let instructions: string | undefined;
  const input: unknown[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      instructions = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      continue;
    }

    if (message.role === 'user') {
      input.push({
        role: 'user',
        content: contentToInputParts(message.content),
      });
    } else if (message.role === 'assistant') {
      // Add text content as a message with output_text
      const contentStr = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      if (contentStr) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: contentStr }],
        });
      }

      // Add tool calls as separate function_call items
      if (message.toolCalls) {
        for (const tc of message.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.toolCallId ?? `call_${Math.random().toString(36).slice(2, 11)}`,
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

  return { instructions, input };
}

// ============================================================================
// Tool conversion
// ============================================================================

/**
 * Convert tools to Responses API function tool format.
 *
 * The Responses API uses a flat format: { type, name, description, parameters }
 * unlike Chat Completions which nests under a `function` key.
 */
function toResponsesTools(tools: Map<string, Tool>): unknown[] {
  const result: unknown[] = [];

  for (const [name, tool] of tools) {
    const toolDef: Record<string, unknown> = {
      type: 'function',
      name,
      description: tool.description,
    };

    if (tool.parameters) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      const def = (tool.parameters as any)?._def;
      const shapeFn = def?.typeName === 'ZodObject' ? def.shape : undefined;
      if (typeof shapeFn === 'function') {
        const shape = shapeFn() as Record<string, unknown>;
        for (const [key, value] of Object.entries(shape)) {
          properties[key] = zodToJsonSchema(value);
          const isOptionalFn = (value as any)?.isOptional;
          const isOptional = typeof isOptionalFn === 'function' ? isOptionalFn() : false;
          if (!isOptional) required.push(key);
        }
      }

      toolDef.parameters = {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    result.push(toolDef);
  }

  return result;
}

// ============================================================================
// Response parsing
// ============================================================================

/** Safely get an attribute from an object or dict-like value. */
function getAttr(obj: any, name: string, defaultValue: any = undefined): any {
  if (obj == null) return defaultValue;
  if (typeof obj === 'object' && name in obj) return obj[name];
  return defaultValue;
}

/**
 * Parse Responses API response output into AssistantMessage.
 */
function parseResponseOutput(response: any): AssistantMessage {
  let textContent = '';
  const toolCalls: ToolCall[] = [];

  const output = response.output ?? [];
  for (const item of output) {
    const itemType = getAttr(item, 'type');

    if (itemType === 'message') {
      const msgContent = getAttr(item, 'content', []);
      for (const part of msgContent) {
        if (getAttr(part, 'type') === 'output_text') {
          textContent += getAttr(part, 'text', '');
        }
      }
    } else if (itemType === 'function_call') {
      toolCalls.push({
        name: getAttr(item, 'name'),
        arguments: getAttr(item, 'arguments', ''),
        toolCallId: getAttr(item, 'call_id') ?? getAttr(item, 'id'),
      });
    }
  }

  let tokenUsage: TokenUsage | undefined;
  const usage = response.usage;
  if (usage) {
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;

    tokenUsage = {
      input: inputTokens,
      output: outputTokens,
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
