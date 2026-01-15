/**
 * Core type definitions and Zod schemas for the Stirrup framework
 */

import { z } from 'zod';

// ============================================================================
// Content Blocks
// ============================================================================

/** Base64-encoded image content block */
export const ImageContentBlockSchema = z.object({
  type: z.literal('image'),
  data: z.string().describe('Base64-encoded image data URL'),
});
export type ImageContentBlock = z.infer<typeof ImageContentBlockSchema>;

/** Base64-encoded video content block */
export const VideoContentBlockSchema = z.object({
  type: z.literal('video'),
  data: z.string().describe('Base64-encoded video data URL'),
});
export type VideoContentBlock = z.infer<typeof VideoContentBlockSchema>;

/** Base64-encoded audio content block */
export const AudioContentBlockSchema = z.object({
  type: z.literal('audio'),
  data: z.string().describe('Base64-encoded audio data URL'),
});
export type AudioContentBlock = z.infer<typeof AudioContentBlockSchema>;

/** Text content block (string) */
export type TextContentBlock = string;

/** Union of all content block types */
export const ContentBlockSchema = z.union([
  z.string(),
  ImageContentBlockSchema,
  VideoContentBlockSchema,
  AudioContentBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

/** Content can be a string or array of content blocks */
export const ContentSchema = z.union([z.string(), z.array(ContentBlockSchema)]);
export type Content = z.infer<typeof ContentSchema>;

// ============================================================================
// Messages
// ============================================================================

/** System message providing instructions to the model */
export const SystemMessageSchema = z.object({
  role: z.literal('system'),
  content: ContentSchema,
});
export type SystemMessage = z.infer<typeof SystemMessageSchema>;

/** User message with input from the user */
export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: ContentSchema,
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

/** Tool call requested by the assistant */
export const ToolCallSchema = z.object({
  name: z.string().describe('Name of the tool to call'),
  arguments: z.string().describe('JSON string of tool arguments'),
  toolCallId: z.string().optional().describe('Unique identifier for this tool call'),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** Token usage statistics */
export const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative().default(0),
  output: z.number().int().nonnegative().default(0),
  reasoning: z.number().int().nonnegative().default(0).optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/** Assistant message with model response and optional tool calls */
export const AssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: ContentSchema,
  toolCalls: z.array(ToolCallSchema).optional(),
  tokenUsage: TokenUsageSchema.optional(),
});
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

/** Tool execution result message */
export const ToolMessageSchema = z.object({
  role: z.literal('tool'),
  content: ContentSchema,
  toolCallId: z.string().describe('ID of the tool call this is responding to'),
  name: z.string().describe('Name of the tool that was executed'),
  argsWasValid: z.boolean().default(true).describe('Whether the tool arguments were valid'),
});
export type ToolMessage = z.infer<typeof ToolMessageSchema>;

/** Union of all message types */
export const ChatMessageSchema = z.discriminatedUnion('role', [
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ============================================================================
// Tool System
// ============================================================================

/** Result returned by a tool executor */
export interface ToolResult<M = unknown> {
  content: Content;
  metadata?: M;
}

/**
 * Base tool interface for runtime storage and execution
 * Uses any for parameters to allow different tool types in collections
 */
export interface BaseTool {
  name: string;
  description: string;
  parameters: z.ZodType | null;
  executor: (params: any) => Promise<ToolResult<any>> | ToolResult<any>;
}

/**
 * Tool definition with generic parameter type P and metadata type M
 * P must be a Zod schema type for parameter validation
 * Extends BaseTool for type-safe tool definitions
 */
export interface Tool<P extends z.ZodType = z.ZodTypeAny, M = unknown> extends BaseTool {
  parameters: P | null;
  executor: (params: z.infer<P>) => Promise<ToolResult<M>> | ToolResult<M>;
}

/**
 * Tool provider manages lifecycle of stateful tools
 * Implements Symbol.asyncDispose for automatic cleanup
 */
export interface ToolProvider {
  /** Initialize and return tool(s) */
  [Symbol.asyncDispose](): Promise<void>;
  /** Get tools from this provider */
  getTools(): Promise<Tool | Tool[]>;
}

// ============================================================================
// Metadata System
// ============================================================================

/**
 * Protocol for aggregatable metadata
 * Metadata types should implement this to support aggregation
 */
export interface Addable<T> {
  add(other: T): T;
}

/** Helper class for token usage with aggregation support */
export class TokenUsageMetadata implements Addable<TokenUsageMetadata> {
  constructor(
    public input: number = 0,
    public output: number = 0,
    public reasoning: number = 0
  ) {}

  get total(): number {
    return this.input + this.output + this.reasoning;
  }

  add(other: TokenUsageMetadata): TokenUsageMetadata {
    return new TokenUsageMetadata(
      this.input + other.input,
      this.output + other.output,
      this.reasoning + other.reasoning
    );
  }

  toJSON() {
    return {
      input: this.input,
      output: this.output,
      reasoning: this.reasoning,
      total: this.total,
    };
  }

  static fromTokenUsage(usage: TokenUsage): TokenUsageMetadata {
    return new TokenUsageMetadata(usage.input, usage.output, usage.reasoning ?? 0);
  }
}

/** Generic tool use counter metadata */
export class ToolUseCountMetadata implements Addable<ToolUseCountMetadata> {
  constructor(public numUses: number = 1) {}

  add(other: ToolUseCountMetadata): ToolUseCountMetadata {
    return new ToolUseCountMetadata(this.numUses + other.numUses);
  }

  toJSON() {
    return { num_uses: this.numUses };
  }
}

/**
 * Aggregate metadata from a dictionary of tool execution metadata
 * @param metadata Dictionary mapping tool names to arrays of metadata
 * @param prefix Prefix for nested metadata keys (used for sub-agents)
 * @returns Aggregated metadata dictionary
 */
export function aggregateMetadata(metadata: Record<string, unknown[]>, prefix: string = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, values] of Object.entries(metadata)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (values.length === 0) {
      continue;
    }

    // Check if values implement Addable interface
    const firstValue = values[0];
    if (firstValue && typeof firstValue === 'object' && 'add' in firstValue) {
      // Aggregate using add method
      let aggregated = firstValue;
      for (let i = 1; i < values.length; i++) {
        aggregated = (aggregated as Addable<typeof firstValue>).add(values[i] as typeof firstValue);
      }
      result[fullKey] = aggregated;
    } else {
      // Store as array if not addable
      result[fullKey] = values;
    }
  }

  return result;
}

// ============================================================================
// LLM Client Protocol
// ============================================================================

/**
 * Protocol interface for LLM clients
 * All LLM client implementations must satisfy this interface
 */
export interface LLMClient {
  /**
   * Generate a response from the model
   * @param messages Conversation history
   * @param tools Available tools the model can use
   * @returns Assistant message with response and optional tool calls
   */
  generate(messages: ChatMessage[], tools: Map<string, Tool>): Promise<AssistantMessage>;

  /** Model identifier/slug */
  readonly modelSlug: string;

  /** Maximum context window size in tokens */
  readonly maxTokens: number;
}

// ============================================================================
// Exceptions
// ============================================================================

/** Error thrown when context window is exceeded */
export class ContextOverflowError extends Error {
  constructor(message: string = 'Context window exceeded') {
    super(message);
    this.name = 'ContextOverflowError';
  }
}

/** Error thrown during tool execution */
export class ToolExecutionError extends Error {
  public toolName: string;
  public override cause?: Error;

  constructor(message: string, toolName: string, cause?: Error) {
    super(message);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
    this.cause = cause;
  }
}

/** Error thrown when agent validation fails */
export class AgentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentValidationError';
  }
}
