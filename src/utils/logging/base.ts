/**
 * Base logger interface for agents
 */

import type { AssistantMessage, UserMessage, ToolMessage } from '../../core/models.js';

/**
 * Agent logger base interface
 * All logger implementations must satisfy this interface
 */
export interface AgentLoggerBase {
  /** Agent name */
  name: string;

  /** Model identifier */
  model: string;

  /** Maximum number of turns */
  maxTurns: number;

  /** Nesting depth (for sub-agents) */
  depth: number;

  /** Output directory (if any) */
  outputDir?: string;

  /** Finish parameters (set before exit) */
  finishParams?: unknown;

  /** Run metadata (set before exit) */
  runMetadata?: Record<string, unknown>;

  /**
   * Called when entering the agent session
   */
  onEnter(): Promise<void> | void;

  /**
   * Called when exiting the agent session
   */
  onExit(): Promise<void> | void;

  /**
   * Called when the agent sends a task message
   */
  onTaskMessage(content: string): Promise<void> | void;

  /**
   * Called when the assistant generates a message
   */
  onAssistantMessage(message: AssistantMessage, turn: number): Promise<void> | void;

  /**
   * Called when a user message is sent
   */
  onUserMessage(message: UserMessage): Promise<void> | void;

  /**
   * Called when a tool returns a result
   */
  onToolResult(message: ToolMessage): Promise<void> | void;

  /**
   * Called when context summarization starts
   */
  onSummarizationStart(percentUsed: number, threshold: number): Promise<void> | void;

  /**
   * Called when context summarization completes
   */
  onSummarizationComplete(summary: string): Promise<void> | void;

  /**
   * Called after each step (for progress updates)
   */
  onStep(turn: number, toolCallCount: number, inputTokens: number, outputTokens: number): Promise<void> | void;
}
