/**
 * Utility functions for converting between Stirrup and LLM provider formats
 */

import type { ChatMessage, Content, Tool } from '../core/models.js';

// ============================================================================
// Zod Schema Helpers (minimal, avoids depending on Zod runtime types)
// ============================================================================

type ZodDefLike = {
  typeName: string;
  description?: string;
  schema?: unknown;
  innerType?: unknown;
  type?: unknown;
  values?: unknown[];
  value?: unknown;
  shape?: () => Record<string, unknown>;
};

function getZodDef(schema: unknown): ZodDefLike | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const def = (schema as { _def?: unknown })._def;
  if (typeof def !== 'object' || def === null) return null;
  const typeName = (def as { typeName?: unknown }).typeName;
  if (typeof typeName !== 'string') return null;
  return def as ZodDefLike;
}

function unwrapZodSchema(schema: unknown): unknown {
  let current: unknown = schema;
  // Unwrap common Zod wrappers to get at the underlying schema definition.
  // This is important for schemas using .refine/.superRefine (ZodEffects).
  let keepUnwrapping = true;
  while (keepUnwrapping) {
    const def = getZodDef(current);
    if (!def) break;
    switch (def.typeName) {
      case 'ZodEffects':
        current = def.schema;
        break;
      case 'ZodDefault':
      case 'ZodCatch':
      case 'ZodReadonly':
      case 'ZodBranded':
      case 'ZodPipeline':
        current = def.innerType;
        break;
      case 'ZodOptional':
      case 'ZodNullable':
        current = def.innerType;
        break;
      default:
        keepUnwrapping = false;
    }
  }
  return current;
}

// ============================================================================
// Content Conversion
// ============================================================================

/**
 * Convert Stirrup content to OpenAI message content format
 * @param content Stirrup content (string or array of content blocks)
 * @returns OpenAI-compatible message content
 */
export function contentToOpenAI(content: Content): unknown {
  if (typeof content === 'string') {
    return content;
  }

  const openaiContent: unknown[] = [];

  for (const block of content) {
    if (typeof block === 'string') {
      openaiContent.push({
        type: 'text',
        text: block,
      });
    } else if (block.type === 'image') {
      openaiContent.push({
        type: 'image_url',
        image_url: {
          url: block.data,
        },
      });
    } else if (block.type === 'audio') {
      // OpenAI audio input format
      openaiContent.push({
        type: 'input_audio',
        input_audio: {
          data: block.data.split(',')[1], // Remove data URL prefix
          format: 'mp3',
        },
      });
    } else if (block.type === 'video') {
      // OpenAI video format (if supported)
      openaiContent.push({
        type: 'file',
        file: {
          file_data: block.data,
        },
      });
    }
  }

  return openaiContent;
}

/**
 * Convert Stirrup content to Anthropic message content format
 * @param content Stirrup content (string or array of content blocks)
 * @returns Anthropic-compatible message content
 */
export function contentToAnthropic(content: Content): unknown {
  if (typeof content === 'string') {
    return [
      {
        type: 'text',
        text: content,
      },
    ];
  }

  const anthropicContent: unknown[] = [];

  for (const block of content) {
    if (typeof block === 'string') {
      anthropicContent.push({
        type: 'text',
        text: block,
      });
    } else if (block.type === 'image') {
      // Extract media type and base64 data from data URL
      const match = block.data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const [, mediaType, base64Data] = match;
        anthropicContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data,
          },
        });
      }
    } else if (block.type === 'video' || block.type === 'audio') {
      // Anthropic doesn't support video/audio directly in messages
      // We'll convert to text description
      anthropicContent.push({
        type: 'text',
        text: `[${block.type.toUpperCase()} CONTENT]`,
      });
    }
  }

  return anthropicContent;
}

// ============================================================================
// Message Conversion
// ============================================================================

/**
 * Convert Stirrup messages to OpenAI messages format
 * @param messages Array of Stirrup chat messages
 * @returns OpenAI-compatible messages
 */
export function toOpenAIMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'system':
        return {
          role: 'system',
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        };

      case 'user':
        return {
          role: 'user',
          content: contentToOpenAI(message.content),
        };

      case 'assistant': {
        const result: Record<string, unknown> = {
          role: 'assistant',
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        };

        if (message.toolCalls && message.toolCalls.length > 0) {
          result.tool_calls = message.toolCalls.map((tc) => ({
            id: tc.toolCallId ?? `call_${Math.random().toString(36).slice(2, 11)}`,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }

        return result;
      }

      case 'tool':
        return {
          role: 'tool',
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
          tool_call_id: message.toolCallId,
        };

      default:
        // Type guard - should never reach here
        throw new Error(`Unknown message role: ${JSON.stringify(message satisfies never)}`);
    }
  });
}

/**
 * Convert Stirrup messages to Anthropic messages format
 * @param messages Array of Stirrup chat messages
 * @returns Anthropic-compatible messages and system prompt
 */
export function toAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: unknown[];
} {
  let systemPrompt: string | undefined;
  const anthropicMessages: unknown[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'system':
        // Anthropic uses a separate system parameter
        systemPrompt = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        break;

      case 'user':
        anthropicMessages.push({
          role: 'user',
          content: contentToAnthropic(message.content),
        });
        break;

      case 'assistant': {
        const result: Record<string, unknown> = {
          role: 'assistant',
          content: [],
        };

        // Add text content
        if (message.content) {
          const textContent = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
          if (textContent) {
            (result.content as unknown[]).push({
              type: 'text',
              text: textContent,
            });
          }
        }

        // Add tool use blocks
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const tc of message.toolCalls) {
            (result.content as unknown[]).push({
              type: 'tool_use',
              id: tc.toolCallId ?? `call_${Math.random().toString(36).slice(2, 11)}`,
              name: tc.name,
              input: JSON.parse(tc.arguments) as unknown,
            });
          }
        }

        anthropicMessages.push(result);
        break;
      }

      case 'tool':
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            },
          ],
        });
        break;

      default:
        throw new Error(`Unknown message role: ${JSON.stringify(message satisfies never)}`);
    }
  }

  return { system: systemPrompt, messages: anthropicMessages };
}

// ============================================================================
// Tool Conversion
// ============================================================================

/**
 * Convert Stirrup tools to OpenAI tools format
 * @param tools Map of tool name to Tool object
 * @returns OpenAI-compatible tools array
 */
export function toOpenAITools(tools: Map<string, Tool>): unknown[] {
  const openaiTools: unknown[] = [];

  for (const [name, tool] of tools) {
    const required: string[] = [];
    const properties: Record<string, unknown> = {};

    // Build properties from Zod schema
    if (tool.parameters) {
      const schema = unwrapZodSchema(tool.parameters);
      const def = getZodDef(schema);
      const shapeFn = def && def.typeName === 'ZodObject' ? def.shape : undefined;
      if (typeof shapeFn === 'function') {
        const shape = shapeFn();
        for (const [key, value] of Object.entries(shape)) {
          properties[key] = zodToJsonSchema(value);
          const isOptionalFn = (value as { isOptional?: unknown }).isOptional;
          const isOptional = typeof isOptionalFn === 'function' ? (isOptionalFn as () => boolean)() : false;
          if (!isOptional) required.push(key);
        }
      }
    }

    openaiTools.push({
      type: 'function',
      function: {
        name: name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      },
    });
  }

  return openaiTools;
}

/**
 * Convert Stirrup tools to Anthropic tools format
 * @param tools Map of tool name to Tool object
 * @returns Anthropic-compatible tools array
 */
export function toAnthropicTools(tools: Map<string, Tool>): unknown[] {
  const anthropicTools: unknown[] = [];

  for (const [name, tool] of tools) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Build properties from Zod schema
    if (tool.parameters) {
      const schema = unwrapZodSchema(tool.parameters);
      const def = getZodDef(schema);
      const shapeFn = def && def.typeName === 'ZodObject' ? def.shape : undefined;
      if (typeof shapeFn === 'function') {
        const shape = shapeFn();
        for (const [key, value] of Object.entries(shape)) {
          properties[key] = zodToJsonSchema(value);
          const isOptionalFn = (value as { isOptional?: unknown }).isOptional;
          const isOptional = typeof isOptionalFn === 'function' ? (isOptionalFn as () => boolean)() : false;
          if (!isOptional) required.push(key);
        }
      }
    }

    anthropicTools.push({
      name: name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
    });
  }

  return anthropicTools;
}

/**
 * Convert a Zod schema to JSON Schema
 * @param schema Zod schema
 * @returns JSON Schema object
 */
function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  const unwrapped = unwrapZodSchema(schema);
  const def = getZodDef(unwrapped);
  if (!def) {
    return { type: 'string' };
  }

  const result: Record<string, unknown> = {};

  // Get description from _def.description
  if (typeof def.description === 'string' && def.description) {
    result.description = def.description;
  }

  switch (def.typeName) {
    case 'ZodString':
      result.type = 'string';
      break;
    case 'ZodNumber':
      result.type = 'number';
      break;
    case 'ZodBoolean':
      result.type = 'boolean';
      break;
    case 'ZodArray':
      result.type = 'array';
      result.items = zodToJsonSchema(def.type);
      break;
    case 'ZodObject': {
      result.type = 'object';
      const properties: Record<string, unknown> = {};
      const shapeFn = def.shape;
      if (typeof shapeFn === 'function') {
        const shape = shapeFn();
        for (const [key, value] of Object.entries(shape)) {
          properties[key] = zodToJsonSchema(value);
        }
      }
      result.properties = properties;
      break;
    }
    case 'ZodOptional':
      return zodToJsonSchema(def.innerType);
    case 'ZodNullable': {
      const innerSchema = zodToJsonSchema(def.innerType);
      innerSchema.nullable = true;
      return innerSchema;
    }
    case 'ZodDefault':
      // Represent as the underlying schema; default is optional for most tool-callers.
      return zodToJsonSchema(def.innerType);
    case 'ZodEffects':
      return zodToJsonSchema(def.schema);
    case 'ZodEnum':
      result.type = 'string';
      result.enum = def.values;
      break;
    case 'ZodLiteral':
      result.type = typeof def.value;
      result.const = def.value;
      break;
    default:
      result.type = 'string';
  }

  return result;
}
