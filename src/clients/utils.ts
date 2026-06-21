/**
 * Utility functions for converting between Stirrup and LLM provider formats
 */

import type { ChatMessage, Content, Tool } from '../core/models.js';

// ============================================================================
// Zod Schema Helpers (minimal, avoids depending on Zod runtime types)
// ============================================================================

// Normalized view of a Zod schema's internal definition. Zod 4 exposes the
// definition at `schema._zod.def` keyed by a string `type` discriminator (e.g.
// 'string', 'object', 'optional'), and the human description via the
// `schema.description` getter rather than on the def itself.
type ZodDefLike = {
  type: string;
  description?: string;
  innerType?: unknown;
  element?: unknown;
  shape?: Record<string, unknown>;
  entries?: Record<string, unknown>;
  values?: unknown[];
};

function getZodDef(schema: unknown): ZodDefLike | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const def = (schema as { _zod?: { def?: unknown } })._zod?.def;
  if (typeof def !== 'object' || def === null) return null;
  const type = (def as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  const d = def as Record<string, unknown>;
  const description = (schema as { description?: unknown }).description;
  return {
    type,
    description: typeof description === 'string' && description ? description : undefined,
    innerType: d.innerType,
    element: d.element,
    shape: typeof d.shape === 'object' && d.shape !== null ? (d.shape as Record<string, unknown>) : undefined,
    entries: typeof d.entries === 'object' && d.entries !== null ? (d.entries as Record<string, unknown>) : undefined,
    values: Array.isArray(d.values) ? d.values : undefined,
  };
}

function unwrapZodSchema(schema: unknown): unknown {
  let current: unknown = schema;
  // Unwrap common Zod wrappers to get at the underlying schema definition.
  let keepUnwrapping = true;
  while (keepUnwrapping) {
    const def = getZodDef(current);
    if (!def) break;
    switch (def.type) {
      case 'optional':
      case 'nullable':
      case 'default':
      case 'prefault':
      case 'nonoptional':
      case 'catch':
      case 'readonly':
        current = def.innerType;
        break;
      default:
        keepUnwrapping = false;
    }
  }
  return current;
}

// Returns true when a schema accepts `undefined` (optional / defaulted), which
// excludes it from a JSON Schema `required` list.
function isZodOptional(value: unknown): boolean {
  const fn = (value as { isOptional?: unknown }).isOptional;
  if (typeof fn !== 'function') return false;
  try {
    return (fn as () => boolean).call(value) === true;
  } catch {
    return false;
  }
}

// Convert a Zod object schema into JSON Schema `properties` + `required`,
// shared by the OpenAI and Anthropic tool builders.
function zodObjectToProperties(schema: unknown): {
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  const def = getZodDef(schema);
  if (def && def.type === 'object' && def.shape) {
    for (const [key, value] of Object.entries(def.shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!isZodOptional(value)) required.push(key);
    }
  }

  return { properties, required };
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
    // Build properties from Zod schema
    const { properties, required } = tool.parameters
      ? zodObjectToProperties(unwrapZodSchema(tool.parameters))
      : { properties: {}, required: [] };

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
    // Build properties from Zod schema
    const { properties, required } = tool.parameters
      ? zodObjectToProperties(unwrapZodSchema(tool.parameters))
      : { properties: {}, required: [] };

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
export function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  const unwrapped = unwrapZodSchema(schema);
  const def = getZodDef(unwrapped);
  if (!def) {
    return { type: 'string' };
  }

  const result: Record<string, unknown> = {};

  // Description is exposed via the `schema.description` getter (captured in def).
  if (def.description) {
    result.description = def.description;
  }

  switch (def.type) {
    case 'string':
      result.type = 'string';
      break;
    case 'number':
      result.type = 'number';
      break;
    case 'boolean':
      result.type = 'boolean';
      break;
    case 'array':
      result.type = 'array';
      result.items = zodToJsonSchema(def.element);
      break;
    case 'object': {
      result.type = 'object';
      const properties: Record<string, unknown> = {};
      if (def.shape) {
        for (const [key, value] of Object.entries(def.shape)) {
          properties[key] = zodToJsonSchema(value);
        }
      }
      result.properties = properties;
      break;
    }
    case 'optional':
    case 'default':
      // Represent as the underlying schema; optionality is handled in `required`.
      return zodToJsonSchema(def.innerType);
    case 'nullable': {
      const innerSchema = zodToJsonSchema(def.innerType);
      innerSchema.nullable = true;
      return innerSchema;
    }
    case 'enum':
      result.type = 'string';
      result.enum = def.entries ? Object.values(def.entries) : [];
      break;
    case 'literal': {
      const value = def.values?.[0];
      result.type = typeof value;
      result.const = value;
      break;
    }
    default:
      result.type = 'string';
  }

  return result;
}
