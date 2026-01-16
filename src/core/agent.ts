/**
 * Core Agent class - orchestrates LLM interactions and tool execution
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { AGENT_MAX_TURNS, CONTEXT_SUMMARIZATION_CUTOFF, FINISH_TOOL_NAME } from '../constants.js';
import { BASE_SYSTEM_PROMPT, MESSAGE_SUMMARIZER_BRIDGE_TEMPLATE, MESSAGE_SUMMARIZER_PROMPT } from '../prompts/index.js';
import { type CodeExecToolProvider } from '../tools/code-exec/base.js';
import { formatSkillsSection, loadSkillsMetadata } from '../skills/index.js';
import { createStructuredLogger, type StructuredLoggerOptions } from '../utils/logging/structured-logger.js';
import type {
  AssistantMessage,
  BaseTool,
  ChatMessage,
  LLMClient,
  SystemMessage,
  TokenUsage,
  Tool,
  ToolCall,
  ToolMessage,
  ToolProvider,
  ToolResult,
  UserMessage,
} from './models.js';
import { AgentValidationError, TokenUsageMetadata, aggregateMetadata } from './models.js';
import { createSessionState, getParentDepth, sessionContext, type SessionState } from './session.js';
import { SubAgentMetadata, SubAgentParamsSchema, type SubAgentParams } from './sub-agent.js';

/**
 * Typed events emitted by the Agent
 * Enables real-time monitoring and progress tracking
 */
export interface AgentEvents<FP = unknown> {
  'run:start': (data: { task: string | ChatMessage[]; depth: number }) => void;
  'run:complete': (data: { result: AgentRunResult<FP>; duration: number; outputDir?: string }) => void;
  'run:error': (data: { error: Error; duration: number }) => void;

  'turn:start': (data: { turn: number; maxTurns: number }) => void;
  'turn:complete': (data: { turn: number; tokenUsage?: TokenUsage }) => void;

  'message:assistant': (data: { content: string; toolCalls?: ToolCall[] }) => void;
  'message:tool': (data: { name: string; content: string; success: boolean }) => void;

  'tool:start': (data: { name: string; arguments: unknown }) => void;
  'tool:complete': (data: { name: string; result: string; success: boolean }) => void;
  'tool:error': (data: { name: string; error: Error }) => void;

  'summarization:start': (data: { percentUsed: number; messageCount: number }) => void;
  'summarization:complete': (data: { summaryLength: number; originalCount: number }) => void;
}

/**
 * Options for agent run method
 */
export interface AgentRunOptions {
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
}

/**
 * Streaming event types for runStream()
 */
export type AgentStreamEvent<FP = unknown> =
  | { type: 'start'; task: string | ChatMessage[]; depth: number; timestamp: number }
  | { type: 'turn:start'; turn: number; maxTurns: number; timestamp: number }
  | { type: 'message'; message: ChatMessage; turn: number; timestamp: number }
  | { type: 'tool:result'; toolName: string; result: string; success: boolean; timestamp: number }
  | { type: 'turn:complete'; turn: number; tokenUsage?: TokenUsage; timestamp: number }
  | { type: 'summarization'; summary: string; timestamp: number }
  | { type: 'complete'; result: AgentRunResult<FP>; timestamp: number }
  | { type: 'error'; error: Error; timestamp: number };

/**
 * Configuration for agent session
 */
export interface SessionConfig {
  /** Output directory for files */
  outputDir?: string;

  /** Input files to upload (paths, globs, or arrays) */
  inputFiles?: string | string[];

  /** Directory containing skill definitions (subdirectories with SKILL.md) */
  skillsDir?: string;

  /** Disable default structured logger */
  noLogger?: boolean;

  /** Options for the default structured logger */
  loggerOptions?: StructuredLoggerOptions;
}

/**
 * Configuration for agent construction
 */
export interface AgentConfig<FP extends z.ZodType, FM = unknown> {
  /** LLM client for generation */
  client: LLMClient;

  /** Agent name (alphanumeric, 1-128 chars) */
  name: string;

  /** Maximum number of turns */
  maxTurns?: number;

  /** Custom system prompt (appended to base prompt) */
  systemPrompt?: string;

  /** Tools available to the agent */
  tools?: Array<BaseTool | ToolProvider>;

  /** Finish tool (signals task completion) */
  finishTool?: Tool<FP, FM>;

  /** Context summarization threshold (0-1) */
  contextSummarizationCutoff?: number;

  /** Whether to run sync executors in thread pool */
  runSyncInThread?: boolean;

  /** Whether to convert tool responses to text-only */
  textOnlyToolResponses?: boolean;
}

/**
 * Result of agent run
 */
export interface AgentRunResult<FP> {
  /** Finish tool parameters (if completed successfully) */
  finishParams?: FP;

  /** Full message history (grouped by summarization) */
  messageHistory: ChatMessage[][];

  /** Aggregated metadata from all tool calls */
  runMetadata: Record<string, unknown>;
}

/**
 * Typed event interface for Agent class
 * Enables TypeScript to infer event types
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export declare interface Agent<FP extends z.ZodType = z.ZodTypeAny, FM = unknown> {
  on<E extends keyof AgentEvents<z.infer<FP>>>(event: E, listener: AgentEvents<z.infer<FP>>[E]): this;
  once<E extends keyof AgentEvents<z.infer<FP>>>(event: E, listener: AgentEvents<z.infer<FP>>[E]): this;
  emit<E extends keyof AgentEvents<z.infer<FP>>>(event: E, ...args: Parameters<AgentEvents<z.infer<FP>>[E]>): boolean;
  off<E extends keyof AgentEvents<z.infer<FP>>>(event: E, listener: AgentEvents<z.infer<FP>>[E]): this;
}

/**
 * Core Agent class
 * Orchestrates LLM interactions with tool execution
 * Extends EventEmitter for real-time progress monitoring
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Agent<FP extends z.ZodType = z.ZodTypeAny, FM = unknown> extends EventEmitter {
  /**
   * Tool call arguments arrive as a JSON string from the model.
   * Some providers/models occasionally emit an empty string for arguments; treat that as an empty object.
   */
  private parseToolCallArguments(raw: string): unknown {
    const trimmed = raw.trim();
    if (trimmed === '') return {};
    return JSON.parse(trimmed) as unknown;
  }

  private client: LLMClient;
  private name: string;
  private maxTurns: number;
  private systemPrompt?: string;
  private tools: Array<BaseTool | ToolProvider>;
  private finishTool?: Tool<FP, FM>;
  private contextSummarizationCutoff: number;
  // Session state
  private sessionState?: SessionState;
  private activeTools: Map<string, BaseTool> = new Map();
  private isInitialized = false;
  // Session configuration
  private pendingOutputDir?: string;
  private _pendingInputFiles?: string | string[]; // Unused for now, will be implemented
  private pendingSkillsDir?: string;
  // Last finish params for file saving on disposal
  private lastFinishParams?: z.infer<FP>;
  // Logger cleanup function
  private loggerCleanup?: () => void;

  constructor(config: AgentConfig<FP, FM>) {
    super(); // Initialize EventEmitter

    const {
      client,
      name,
      maxTurns = AGENT_MAX_TURNS,
      systemPrompt,
      tools = [],
      finishTool,
      contextSummarizationCutoff = CONTEXT_SUMMARIZATION_CUTOFF,
      runSyncInThread = true,
      textOnlyToolResponses = true,
    } = config;

    // Validate agent name
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name)) {
      throw new AgentValidationError('Agent name must be alphanumeric (with _ or -) and 1-128 characters long');
    }

    this.client = client;
    this.name = name;
    this.maxTurns = maxTurns;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.finishTool = finishTool;
    this.contextSummarizationCutoff = contextSummarizationCutoff;
    // Store for future use
    void runSyncInThread;
    void textOnlyToolResponses;
  }

  /**
   * Configure a session and return self for use as async context manager
   *
   * @param config - Session configuration
   * @param config.outputDir - Directory to save output files from finish_params.paths
   * @param config.inputFiles - Files to upload to the execution environment at session start
   * @returns Self, for use with `await using agent.session(...)`
   *
   * @example
   * ```typescript
   * await using session = agent.session({ outputDir: './output' });
   * await session.run('Create a chart...');
   * // Files from finish params automatically copied to ./output on disposal
   * ```
   */
  session(config: SessionConfig = {}): this {
    this.pendingOutputDir = config.outputDir ?? './output';
    this._pendingInputFiles = config.inputFiles;
    this.pendingSkillsDir = config.skillsDir;

    if (!config.noLogger && !this.loggerCleanup) {
      this.loggerCleanup = createStructuredLogger(this, config.loggerOptions);
    }

    return this;
  }

  /**
   * Run the agent with initial messages
   * @param initMessages - Initial messages or string task
   * @param depthOrOptions - Depth (for sub-agents) or options object
   * @returns Promise resolving to agent run result
   */
  async run(
    initMessages: ChatMessage[] | string,
    depthOrOptions: number | AgentRunOptions = 0
  ): Promise<AgentRunResult<z.infer<FP>>> {
    // Parse parameters for backward compatibility
    const depth = typeof depthOrOptions === 'number' ? depthOrOptions : 0;
    const options = typeof depthOrOptions === 'object' ? depthOrOptions : {};
    const signal = options.signal;

    // Track timing
    const startTime = Date.now();

    // Emit start event
    this.emit('run:start', { task: initMessages, depth });

    try {
      if (!this.isInitialized) {
        await this.initialize(depth);
      }

      signal?.throwIfAborted();

      const messages: ChatMessage[] =
        typeof initMessages === 'string' ? [{ role: 'user', content: initMessages } as UserMessage] : initMessages;

      const systemPrompt = this.buildSystemPrompt();
      const allMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt } as SystemMessage, ...messages];

      const messageHistory: ChatMessage[][] = [];
      let currentMessages = allMessages;
      let currentGroup: ChatMessage[] = [...currentMessages];

      const runMetadata: Record<string, unknown[]> = {
        token_usage: [],
      };

      for (const toolName of this.activeTools.keys()) {
        runMetadata[toolName] = [];
      }

      let finishParams: z.infer<FP> | undefined;
      for (let turn = 0; turn < this.maxTurns; turn++) {
        signal?.throwIfAborted();

        this.emit('turn:start', { turn, maxTurns: this.maxTurns });

        const { assistantMessage, toolMessages } = await this.step(currentMessages, runMetadata);

        for (const toolMsg of toolMessages) {
          this.emit('message:tool', {
            name: toolMsg.name || 'unknown',
            content: typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content),
            success: !toolMsg.content?.toString().includes('Error'),
          });
        }

        currentGroup.push(assistantMessage);
        currentGroup.push(...toolMessages);

        currentMessages = [...currentMessages, assistantMessage, ...toolMessages];

        const tokenUsageArray = runMetadata.token_usage as TokenUsage[] | undefined;
        const lastTokenUsage = tokenUsageArray?.[tokenUsageArray.length - 1];
        this.emit('turn:complete', { turn, tokenUsage: lastTokenUsage });

        if (assistantMessage.toolCalls) {
          for (const toolCall of assistantMessage.toolCalls) {
            if (toolCall.name === FINISH_TOOL_NAME && this.finishTool) {
              try {
                const params = this.finishTool.parameters
                  ? (this.finishTool.parameters.parse(this.parseToolCallArguments(toolCall.arguments)) as z.infer<FP>)
                  : undefined;
                finishParams = params;
                break;
              } catch {
                // Invalid finish params, continue
              }
            }
          }
        }

        if (finishParams !== undefined) {
          messageHistory.push(currentGroup);
          break;
        }

        if (assistantMessage.tokenUsage) {
          const totalTokens = assistantMessage.tokenUsage.input + assistantMessage.tokenUsage.output;
          const percentUsed = totalTokens / this.client.maxTokens;

          if (percentUsed >= this.contextSummarizationCutoff) {
            this.emit('summarization:start', {
              percentUsed,
              messageCount: currentMessages.length,
            });

            messageHistory.push(currentGroup);

            const summarized = await this.summarizeMessages(currentMessages);
            currentMessages = summarized;
            currentGroup = [...summarized];

            this.emit('summarization:complete', {
              summaryLength: summarized.length,
              originalCount: messageHistory.flat().length,
            });
          }
        }
      }

      if (finishParams === undefined && currentGroup.length > 0) {
        messageHistory.push(currentGroup);
      }

      const aggregated = aggregateMetadata(runMetadata);

      const result: AgentRunResult<z.infer<FP>> = {
        finishParams,
        messageHistory,
        runMetadata: aggregated,
      };

      this.lastFinishParams = finishParams;

      const duration = Date.now() - startTime;
      this.emit('run:complete', { result, duration, outputDir: this.sessionState?.outputDir });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.emit('run:error', {
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
      });
      throw error;
    }
  }

  /**
   * Run the agent with streaming events
   * Yields events as they occur for real-time monitoring
   * @param initMessages - Initial messages or string task
   * @param options - Run options including AbortSignal
   * @returns AsyncGenerator yielding agent events
   */
  async *runStream(
    initMessages: ChatMessage[] | string,
    options: AgentRunOptions = {}
  ): AsyncGenerator<AgentStreamEvent<z.infer<FP>>> {
    const signal = options.signal;
    const depth = 0;

    yield {
      type: 'start',
      task: initMessages,
      depth,
      timestamp: Date.now(),
    };

    try {
      if (!this.isInitialized) {
        await this.initialize(depth);
      }

      signal?.throwIfAborted();

      const messages: ChatMessage[] =
        typeof initMessages === 'string' ? [{ role: 'user', content: initMessages } as UserMessage] : initMessages;

      const systemPrompt = this.buildSystemPrompt();
      const allMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt } as SystemMessage, ...messages];

      const messageHistory: ChatMessage[][] = [];
      let currentMessages = allMessages;
      let currentGroup: ChatMessage[] = [...currentMessages];

      const runMetadata: Record<string, unknown[]> = {
        token_usage: [],
      };

      for (const toolName of this.activeTools.keys()) {
        runMetadata[toolName] = [];
      }

      let finishParams: z.infer<FP> | undefined;
      for (let turn = 0; turn < this.maxTurns; turn++) {
        signal?.throwIfAborted();

        yield {
          type: 'turn:start',
          turn,
          maxTurns: this.maxTurns,
          timestamp: Date.now(),
        };

        const { assistantMessage, toolMessages } = await this.step(currentMessages, runMetadata);

        yield {
          type: 'message',
          message: assistantMessage,
          turn,
          timestamp: Date.now(),
        };

        for (const toolMsg of toolMessages) {
          yield {
            type: 'tool:result',
            toolName: toolMsg.name || 'unknown',
            result: typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content),
            success: !toolMsg.content?.toString().includes('Error'),
            timestamp: Date.now(),
          };

          yield {
            type: 'message',
            message: toolMsg,
            turn,
            timestamp: Date.now(),
          };
        }

        currentGroup.push(assistantMessage);
        currentGroup.push(...toolMessages);

        currentMessages = [...currentMessages, assistantMessage, ...toolMessages];

        const tokenUsageArray = runMetadata.token_usage as TokenUsage[] | undefined;
        const lastTokenUsage = tokenUsageArray?.[tokenUsageArray.length - 1];
        yield {
          type: 'turn:complete',
          turn,
          tokenUsage: lastTokenUsage,
          timestamp: Date.now(),
        };

        if (assistantMessage.toolCalls) {
          for (const toolCall of assistantMessage.toolCalls) {
            if (toolCall.name === FINISH_TOOL_NAME && this.finishTool) {
              try {
                const params = this.finishTool.parameters
                  ? (this.finishTool.parameters.parse(this.parseToolCallArguments(toolCall.arguments)) as z.infer<FP>)
                  : undefined;
                finishParams = params;
                break;
              } catch {
                // Invalid finish params, continue
              }
            }
          }
        }

        if (finishParams !== undefined) {
          messageHistory.push(currentGroup);
          break;
        }

        if (assistantMessage.tokenUsage) {
          const totalTokens = assistantMessage.tokenUsage.input + assistantMessage.tokenUsage.output;
          const percentUsed = totalTokens / this.client.maxTokens;

          if (percentUsed >= this.contextSummarizationCutoff) {
            messageHistory.push(currentGroup);

            const summarized = await this.summarizeMessages(currentMessages);
            currentMessages = summarized;
            currentGroup = [...summarized];

            yield {
              type: 'summarization',
              summary: JSON.stringify(summarized),
              timestamp: Date.now(),
            };
          }
        }
      }

      if (finishParams === undefined && currentGroup.length > 0) {
        messageHistory.push(currentGroup);
      }

      const aggregated = aggregateMetadata(runMetadata);

      const result: AgentRunResult<z.infer<FP>> = {
        finishParams,
        messageHistory,
        runMetadata: aggregated,
      };

      yield {
        type: 'complete',
        result,
        timestamp: Date.now(),
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      };
      throw error;
    }
  }

  /**
   * Execute a single agent step
   */
  private async step(
    messages: ChatMessage[],
    runMetadata: Record<string, unknown[]>
  ): Promise<{ assistantMessage: AssistantMessage; toolMessages: ToolMessage[] }> {
    const assistantMessage = await this.client.generate(messages, this.activeTools);

    if (assistantMessage.tokenUsage) {
      runMetadata['token_usage']?.push(TokenUsageMetadata.fromTokenUsage(assistantMessage.tokenUsage));
    }

    // Emit assistant message BEFORE tool execution so logs appear in correct order
    if (assistantMessage.content || assistantMessage.toolCalls) {
      this.emit('message:assistant', {
        content:
          typeof assistantMessage.content === 'string'
            ? assistantMessage.content
            : JSON.stringify(assistantMessage.content),
        toolCalls: assistantMessage.toolCalls,
      });
    }

    const toolMessages: ToolMessage[] = [];
    if (assistantMessage.toolCalls) {
      for (const toolCall of assistantMessage.toolCalls) {
        const toolMessage = await this.runTool(toolCall, runMetadata);
        toolMessages.push(toolMessage);
      }
    }

    return { assistantMessage, toolMessages };
  }

  /**
   * Execute a single tool call
   */
  private async runTool(toolCall: ToolCall, runMetadata: Record<string, unknown[]>): Promise<ToolMessage> {
    const tool = this.activeTools.get(toolCall.name);

    if (!tool) {
      return {
        role: 'tool',
        content: `Error: '${toolCall.name}' is not a valid tool`,
        toolCallId: toolCall.toolCallId ?? '',
        name: toolCall.name,
        argsWasValid: false,
      };
    }

    if (!runMetadata[toolCall.name]) {
      runMetadata[toolCall.name] = [];
    }

    let params: unknown;
    try {
      if (tool.parameters) {
        params = tool.parameters.parse(this.parseToolCallArguments(toolCall.arguments));
      } else {
        params = undefined;
      }
    } catch (error) {
      const errorMsg = 'Tool arguments are not valid';
      this.emit('tool:error', {
        name: toolCall.name,
        error: error instanceof Error ? error : new Error(errorMsg),
      });
      return {
        role: 'tool',
        content: errorMsg,
        toolCallId: toolCall.toolCallId ?? '',
        name: toolCall.name,
        argsWasValid: false,
      };
    }

    this.emit('tool:start', { name: toolCall.name, arguments: params });

    let result: ToolResult;
    try {
      result = await tool.executor(params);

      const contentStr = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      this.emit('tool:complete', {
        name: toolCall.name,
        result: contentStr,
        success: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('tool:error', {
        name: toolCall.name,
        error: error instanceof Error ? error : new Error(errorMessage),
      });
      return {
        role: 'tool',
        content: `Error executing tool: ${errorMessage}`,
        toolCallId: toolCall.toolCallId ?? '',
        name: toolCall.name,
        argsWasValid: true,
      };
    }

    if (result.metadata) {
      runMetadata[toolCall.name]?.push(result.metadata);
    }

    return {
      role: 'tool',
      content: result.content,
      toolCallId: toolCall.toolCallId ?? '',
      name: toolCall.name,
      argsWasValid: true,
    };
  }

  /**
   * Summarize messages when approaching context limit
   */
  private async summarizeMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const taskContextEnd = messages.findIndex((m) => m.role === 'assistant');
    const taskContext = taskContextEnd > 0 ? messages.slice(0, taskContextEnd) : messages.slice(0, 1);
    const toSummarize = taskContextEnd > 0 ? messages.slice(taskContextEnd) : messages.slice(1);

    const summaryMessages: ChatMessage[] = [
      { role: 'system', content: MESSAGE_SUMMARIZER_PROMPT } as SystemMessage,
      ...toSummarize,
      { role: 'user', content: 'Please provide a concise summary.' } as UserMessage,
    ];

    const summaryResponse = await this.client.generate(summaryMessages, new Map());
    const summary = summaryResponse.content;

    const summaryText = typeof summary === 'string' ? summary : JSON.stringify(summary);
    const bridgeMessage = MESSAGE_SUMMARIZER_BRIDGE_TEMPLATE(summaryText);

    return [...taskContext, { role: 'user', content: bridgeMessage } as UserMessage];
  }

  /**
   * Build complete system prompt
   */
  private buildSystemPrompt(): string {
    let prompt = BASE_SYSTEM_PROMPT;

    // User interaction guidance based on whether user_input tool is available
    if (this.activeTools.has('user_input')) {
      prompt +=
        '\n\nYou have access to the user_input tool which allows you to ask the user questions when you need clarification or are uncertain about something.';
    } else {
      prompt += '\n\nYou are not able to interact with the user during the task.';
    }

    if (this.sessionState?.uploadedFilePaths.length) {
      prompt += '\n\nUploaded files:\n';
      for (const path of this.sessionState.uploadedFilePaths) {
        prompt += `- ${path}\n`;
      }
    }

    if (this.sessionState?.skillsMetadata?.length) {
      const section = formatSkillsSection(this.sessionState.skillsMetadata);
      if (section) {
        prompt += `\n\n${section}`;
      }
    }

    if (this.systemPrompt) {
      prompt += '\n\n' + this.systemPrompt;
    }

    return prompt;
  }

  /**
   * Initialize session
   */
  private async initialize(depth: number): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const state = createSessionState(depth);
    state.outputDir = this.pendingOutputDir;
    this.sessionState = state;

    await sessionContext.runAsync(state, async () => {
      // Two-pass tool initialization: CodeExecToolProvider first, then others
      const codeExecProviders = this.tools.filter((t): t is CodeExecToolProvider => this.isCodeExecProvider(t));

      if (codeExecProviders.length > 1) {
        throw new Error(`Agent can only have one CodeExecToolProvider, found ${codeExecProviders.length}`);
      }

      for (const tool of codeExecProviders) {
        await this.initializeTool(tool);
        if (this.isToolProvider(tool)) {
          state.execEnv = tool;
        }
      }

      // Upload input files (if configured)
      if (this._pendingInputFiles) {
        if (!state.execEnv) {
          throw new Error('inputFiles requires a CodeExecToolProvider to be configured');
        }
        const specs = await this.resolvePathSpecs(this._pendingInputFiles);
        if (specs.length > 0) {
          const res = await state.execEnv.uploadFiles(specs);
          state.uploadedFilePaths.push(...res.uploaded);
        }
        this._pendingInputFiles = undefined;
      }

      // Upload skills directory (if configured) and load metadata
      if (this.pendingSkillsDir) {
        if (!state.execEnv) {
          throw new Error('skillsDir requires a CodeExecToolProvider to be configured');
        }
        state.skillsMetadata = await loadSkillsMetadata(this.pendingSkillsDir);
        // Always upload skills folder contents into "skills/" in the exec environment
        await state.execEnv.uploadFiles([this.pendingSkillsDir], undefined, { destDir: 'skills' });
        this.pendingSkillsDir = undefined;
      }

      for (const tool of this.tools) {
        if (!this.isCodeExecProvider(tool)) {
          await this.initializeTool(tool);
        }
      }

      if (this.finishTool) {
        this.activeTools.set(FINISH_TOOL_NAME, this.finishTool);
      }
    });

    this.isInitialized = true;
  }

  private isGlobPattern(spec: string): boolean {
    // Simple detection: treat *, ?, [ as glob indicators.
    return /[*?[]/.test(spec);
  }

  private async resolvePathSpecs(specs: string | string[]): Promise<string[]> {
    const fs = await import('fs/promises');
    const all = Array.isArray(specs) ? specs : [specs];
    const resolved: string[] = [];

    for (const spec of all) {
      if (!spec) continue;
      if (this.isGlobPattern(spec)) {
        // Node.js 22+ supports fs.promises.glob
        const globFn = (
          fs as unknown as {
            glob?: (pattern: string, opts?: Record<string, unknown>) => Promise<string[]>;
          }
        ).glob;
        if (!globFn) {
          throw new Error('Glob patterns in inputFiles require Node.js 22+ (fs.promises.glob not available)');
        }
        const matches = await globFn(spec, { cwd: process.cwd() });
        if (matches.length === 0) {
          throw new Error(`Glob pattern matched no files: ${spec}`);
        }
        resolved.push(...matches);
      } else {
        resolved.push(spec);
      }
    }

    // De-dupe while preserving order
    const seen = new Set<string>();
    return resolved.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  }

  /**
   * Initialize a single tool or tool provider
   */
  private async initializeTool(_tool: Tool | ToolProvider): Promise<void> {
    if (this.isToolProvider(_tool)) {
      const tools = await _tool.getTools();
      const toolsArray = Array.isArray(tools) ? tools : [tools];

      for (const t of toolsArray) {
        this.activeTools.set(t.name, t);
      }

      this.sessionState?.exitStack.pushCallback(async () => {
        await _tool[Symbol.asyncDispose]();
      });
    } else {
      this.activeTools.set(_tool.name, _tool);
    }
  }

  /**
   * Check if an object is a ToolProvider
   */
  private isToolProvider(obj: unknown): obj is ToolProvider {
    return typeof obj === 'object' && obj !== null && Symbol.asyncDispose in obj && 'getTools' in obj;
  }

  /**
   * Check if a tool is a CodeExecToolProvider
   */
  private isCodeExecProvider(_tool: unknown): _tool is CodeExecToolProvider {
    // Check if the tool provider has runCommand and saveOutputFiles methods
    return (
      typeof _tool === 'object' &&
      _tool !== null &&
      'runCommand' in _tool &&
      'saveOutputFiles' in _tool &&
      typeof (_tool as Record<string, unknown>).runCommand === 'function' &&
      typeof (_tool as Record<string, unknown>).saveOutputFiles === 'function'
    );
  }

  /**
   * Cleanup resources and save output files if configured
   */
  async [Symbol.asyncDispose](): Promise<void> {
    try {
      if (this.sessionState?.outputDir && this.lastFinishParams && this.sessionState.execEnv) {
        // Safe access to potential paths property on finish params
        const finishParams = this.lastFinishParams;
        let paths: string[] = [];

        if (
          finishParams &&
          typeof finishParams === 'object' &&
          'paths' in finishParams &&
          Array.isArray((finishParams as Record<string, unknown>).paths)
        ) {
          paths = (finishParams as Record<string, unknown>).paths as string[];
        }

        if (paths.length > 0) {
          const depth = this.sessionState.depth;

          if (depth === 0) {
            const execEnv = this.sessionState.execEnv;
            if (execEnv) {
              const result = await execEnv.saveOutputFiles(
                paths,
                this.sessionState.outputDir,
                undefined // destEnv is undefined for local filesystem
              );

              if (result.saved.length > 0) {
                console.log(`Saved ${result.saved.length} file(s) to ${this.sessionState.outputDir}`);
              }

              if (Object.keys(result.failed).length > 0) {
                console.warn(`Failed to save ${Object.keys(result.failed).length} file(s)`, result.failed);
              }
            }
          } else {
            if (this.sessionState.parentExecEnv) {
              const execEnv = this.sessionState.execEnv;
              if (execEnv) {
                await execEnv.saveOutputFiles(paths, this.sessionState.outputDir, this.sessionState.parentExecEnv);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error saving output files during cleanup:', error);
    } finally {
      if (this.loggerCleanup) {
        this.loggerCleanup();
        this.loggerCleanup = undefined;
      }
      if (this.sessionState) {
        await this.sessionState.exitStack.dispose();
      }
    }
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get max turns
   */
  getMaxTurns(): number {
    return this.maxTurns;
  }

  /**
   * Convert this agent to a Tool for use as a sub-agent
   * Allows agents to delegate tasks to other agents
   */
  toTool(description?: string, customSystemPrompt?: string): Tool<typeof SubAgentParamsSchema, SubAgentMetadata> {
    return {
      name: this.name,
      description: description ?? `Delegate a task to the ${this.name} sub-agent`,
      parameters: SubAgentParamsSchema,
      executor: async (params: SubAgentParams): Promise<ToolResult<SubAgentMetadata>> => {
        try {
          const parentDepth = getParentDepth();
          const subAgentDepth = parentDepth + 1;

          const parentState = sessionContext.get();
          const parentExecEnv: CodeExecToolProvider | undefined = parentState?.execEnv;

          const subAgent = customSystemPrompt
            ? new Agent<FP, FM>({
                client: this.client,
                name: this.name,
                maxTurns: this.maxTurns,
                systemPrompt: customSystemPrompt,
                tools: this.tools,
                finishTool: this.finishTool,
                contextSummarizationCutoff: this.contextSummarizationCutoff,
              })
            : this;

          await subAgent.initialize(subAgentDepth);

          if (params.inputFiles.length > 0 && subAgent.sessionState?.execEnv && parentExecEnv) {
            await subAgent.sessionState.execEnv.uploadFiles(params.inputFiles, parentExecEnv);
          }

          const result = await subAgent.run(params.task, subAgentDepth);

          if (result.finishParams && typeof result.finishParams === 'object' && 'paths' in result.finishParams) {
            const finishWithPaths = result.finishParams as { paths: string[] };
            if (finishWithPaths.paths.length > 0 && subAgent.sessionState?.execEnv && parentExecEnv) {
              await subAgent.sessionState.execEnv.saveOutputFiles(finishWithPaths.paths, '', parentExecEnv);
            }
          }

          await subAgent[Symbol.asyncDispose]();

          const metadata = new SubAgentMetadata(result.messageHistory, result.runMetadata);

          let content = '<sub_agent_result>\n';
          if (result.finishParams && typeof result.finishParams === 'object' && 'reason' in result.finishParams) {
            const finishWithReason = result.finishParams as { reason: string };
            content += `  <reason>${finishWithReason.reason}</reason>\n`;
          }
          content += '</sub_agent_result>';

          return {
            content,
            metadata,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: `<sub_agent_error>${errorMsg}</sub_agent_error>`,
            metadata: new SubAgentMetadata([], {}),
          };
        }
      },
    };
  }
}
