/**
 * Stirrup - The lightweight foundation for building agents in TypeScript
 *
 * @packageDocumentation
 */

// Core types and models
export type {
  // Content blocks
  Content,
  ContentBlock,
  ImageContentBlock,
  VideoContentBlock,
  AudioContentBlock,

  // Messages
  ChatMessage,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,

  // Tool system
  Tool,
  BaseTool,
  ToolProvider,
  ToolResult,
  ToolCall,

  // Token usage and metadata
  TokenUsage,
  Addable,

  // LLM client
  LLMClient,
} from './core/models.js';

// Core classes and utilities
export {
  TokenUsageMetadata,
  ToolUseCountMetadata,
  aggregateMetadata,
  ContextOverflowError,
  ToolExecutionError,
  AgentValidationError,
} from './core/models.js';

// Zod schemas for validation
export {
  ImageContentBlockSchema,
  VideoContentBlockSchema,
  AudioContentBlockSchema,
  ContentBlockSchema,
  ContentSchema,
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
  ChatMessageSchema,
  ToolCallSchema,
  TokenUsageSchema,
} from './core/models.js';

// Content processing
export { ImageContent, VideoContent, AudioContent } from './content/index.js';
export {
  calculateDownscaledDimensions,
  detectMimeType,
  validateFileType,
  bufferToDataURL,
  parseDataURL,
} from './content/processors.js';

// Async utilities
export {
  AsyncContext,
  AsyncContextWithReset,
  type ContextToken,
} from './utils/context.js';

export {
  AsyncDisposableStack,
  withAsyncStack,
  makeAsyncDisposable,
  type AsyncDisposable,
  type AsyncDisposeFn,
} from './utils/async-stack.js';

// Constants
export {
  AGENT_MAX_TURNS,
  CONTEXT_SUMMARIZATION_CUTOFF,
  FINISH_TOOL_NAME,
  RESOLUTION_1MP,
  RESOLUTION_480P,
  AUDIO_BITRATE,
  MAX_WEB_CONTENT_LENGTH,
  SUBAGENT_INDENT_SPACES,
  DEFAULT_COMMAND_TIMEOUT,
  DEFAULT_E2B_TIMEOUT,
  MAX_RETRY_ATTEMPTS,
  RETRY_MIN_TIMEOUT,
  RETRY_MAX_TIMEOUT,
} from './constants.js';

// Agent
export {
  Agent,
  type AgentConfig,
  type SessionConfig,
  type AgentRunResult,
  type AgentEvents,
  type AgentRunOptions,
  type AgentStreamEvent,
} from './core/agent.js';
export { SubAgentMetadata, SubAgentParamsSchema, type SubAgentParams } from './core/sub-agent.js';

// Session management
export { sessionContext, parentDepthContext, createSessionState, getCurrentSession, getParentDepth, type SessionState } from './core/session.js';

// Tools
export { DEFAULT_TOOLS, SIMPLE_FINISH_TOOL, CALCULATOR_TOOL, USER_INPUT_TOOL, type FinishParams, type UserInputParams } from './tools/index.js';
export { WebToolProvider, WebFetchMetadata, WebSearchMetadata } from './tools/web/provider.js';
export {
  CodeExecToolProvider,
  LocalCodeExecToolProvider,
  DockerCodeExecToolProvider,
  E2BCodeExecToolProvider,
  CodeExecutionParamsSchema,
  type CodeExecutionParams,
  type CommandResult,
  type DockerCodeExecConfig,
  type E2BCodeExecConfig,
} from './tools/code-exec/index.js';
export { MCPToolProvider, type McpConfig, McpConfigSchema } from './tools/mcp/index.js';

// Logging
export { type AgentLoggerBase, AgentLogger, createStructuredLogger, type StructuredLoggerOptions } from './utils/logging/index.js';

// Prompts
export { BASE_SYSTEM_PROMPT, MESSAGE_SUMMARIZER_PROMPT, MESSAGE_SUMMARIZER_BRIDGE_TEMPLATE } from './prompts/index.js';

// Skills
export { formatSkillsSection, loadSkillsMetadata, parseFrontmatter, type SkillMetadata } from './skills/index.js';
