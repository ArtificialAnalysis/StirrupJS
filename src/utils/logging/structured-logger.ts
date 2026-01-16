/**
 * Structured logger with clean console output
 * Provides beautiful, readable logging for agent runs
 */
const MAX_MESSAGE_LENGTH = 10_000;
const getTerminalWidth = () => process.stdout.columns || 80;
import boxen from 'boxen';
import chalk from 'chalk';
import pino from 'pino';
import type { Agent, AgentEvents } from '../../core/agent.js';

export interface StructuredLoggerOptions {
  /** Logging level (default: 'info') */
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';

  /** Enable pretty printing for development (default: true) */
  pretty?: boolean;

  /** Use clean console format instead of JSON (default: true) */
  useConsoleFormat?: boolean;

  /** Custom pino options (only used when useConsoleFormat is false) */
  pinoOptions?: pino.LoggerOptions;
}

/**
 * Create a console logger with clean, readable output
 * @internal
 */
function createConsoleLogger<FP = unknown>(agent: Agent<any, any>, level: string): () => void {
  const runData: {
    startTime?: number;
    agentName?: string;
    depth?: number;
    currentTurn?: number;
    maxTurns?: number;
  } = {};

  // Start handler
  const onRunStart: AgentEvents<FP>['run:start'] = (data) => {
    runData.startTime = Date.now();
    runData.agentName = agent.getName();
    runData.depth = data.depth;

    const prefix = data.depth > 0 ? `  ${'  '.repeat(data.depth - 1)}└─ ` : '';
    let taskStr: string;
    if (typeof data.task === 'string') {
      const trimmed = data.task.substring(0, MAX_MESSAGE_LENGTH);
      taskStr = data.task.length > MAX_MESSAGE_LENGTH ? `${trimmed}...` : trimmed;
    } else {
      taskStr = '[task]';
    }
    console.log(
      `${prefix}🚀 Starting ${data.depth > 0 ? 'sub-' : ''}agent${data.depth > 0 ? ` [${runData.agentName}]` : ''}...`
    );
    if (level === 'debug' || level === 'trace') {
      console.log(`${prefix}   Task: ${taskStr}`);
    }
    console.log();
  };

  // Turn start handler
  const onTurnStart: AgentEvents<FP>['turn:start'] = (data) => {
    runData.currentTurn = data.turn + 1;
    runData.maxTurns = data.maxTurns;
  };

  // Assistant message handler
  const onMessageAssistant: AgentEvents<FP>['message:assistant'] = (data) => {
    const indent = runData.depth && runData.depth > 0 ? '  '.repeat(runData.depth) : '';

    // Build content for the box
    const contentParts: string[] = [];

    // Add message content
    if (data.content && data.content.length > 0) {
      const truncated =
        data.content.length > MAX_MESSAGE_LENGTH ? data.content.substring(0, MAX_MESSAGE_LENGTH) + '...' : data.content;
      contentParts.push(truncated);
    }

    // Add tool calls section
    if (data.toolCalls && data.toolCalls.length > 0) {
      if (contentParts.length > 0) contentParts.push('');
      contentParts.push(chalk.gray('Tool Calls:'));
      for (const tc of data.toolCalls) {
        contentParts.push(`  🔧 ${chalk.yellow(tc.name)}`);
        // Format arguments nicely
        try {
          const args = JSON.parse(tc.arguments) as Record<string, unknown>;
          for (const [key, value] of Object.entries(args)) {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
            const truncated = strValue.length > 1000 ? strValue.substring(0, 1000) + '...' : strValue;
            const displayValue = truncated.replace(/\n/g, '\\n');
            contentParts.push(chalk.gray(`     ${key}=${displayValue}`));
          }
        } catch {
          contentParts.push(chalk.gray(`     ${tc.arguments}`));
        }
      }
    }

    // Only show box if there's content
    if (contentParts.length > 0) {
      const title = `AssistantMessage │ ${runData.agentName} │ Turn ${runData.currentTurn || '?'}/${runData.maxTurns || '?'}`;
      const termWidth = getTerminalWidth();
      const boxWidth = indent ? termWidth - indent.length : termWidth;
      const box = boxen(contentParts.join('\n'), {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'cyan',
        title,
        titleAlignment: 'left',
        width: boxWidth,
      });
      // Add indent for sub-agents
      if (indent) {
        console.log(
          box
            .split('\n')
            .map((line) => indent + line)
            .join('\n')
        );
      } else {
        console.log(box);
      }
    }
  };

  // Tool complete handler
  const onToolComplete: AgentEvents<FP>['tool:complete'] = (data) => {
    const indent = runData.depth && runData.depth > 0 ? '  '.repeat(runData.depth) : '';

    // Truncate result if too long
    let truncatedResult: string;
    if (data.result.length > 1000) {
      truncatedResult = data.result.substring(0, 500) + '\n...\n' + data.result.substring(data.result.length - 500);
    } else {
      truncatedResult = data.result;
    }

    const statusIcon = data.success ? chalk.green('✓') : chalk.red('✗');
    const turnInfo = runData.currentTurn ? ` │ Turn ${runData.currentTurn}/${runData.maxTurns}` : '';
    const title = `${statusIcon} ToolResult │ ${data.name}${turnInfo}`;
    const borderColor = data.success ? 'green' : 'red';

    const termWidth = getTerminalWidth();
    const boxWidth = indent ? termWidth - indent.length : termWidth;
    const box = boxen(truncatedResult, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor,
      title,
      titleAlignment: 'left',
      width: boxWidth,
    });

    // Add indent for sub-agents
    if (indent) {
      console.log(
        box
          .split('\n')
          .map((line) => indent + line)
          .join('\n')
      );
    } else {
      console.log(box);
    }
  };

  // Turn complete handler
  const onTurnComplete: AgentEvents<FP>['turn:complete'] = (data) => {
    if (data.tokenUsage && (level === 'debug' || level === 'trace')) {
      const prefix = runData.depth && runData.depth > 0 ? `  ${'  '.repeat(runData.depth - 1)}   ` : '';
      const { input, output } = data.tokenUsage;
      const total = input + output;
      console.log(`${prefix}  📊 Tokens: ${input} in, ${output} out, ${total} total\n`);
    }
  };

  // Tool error handler
  const onToolError: AgentEvents<FP>['tool:error'] = (data) => {
    const prefix = runData.depth && runData.depth > 0 ? `  ${'  '.repeat(runData.depth - 1)}   ` : '';
    console.log(`${prefix}  ❌ ${data.name}: ${data.error.message}`);
  };

  // Summarization handlers
  const onSummarizationStart: AgentEvents<FP>['summarization:start'] = (data) => {
    if (level === 'debug' || level === 'trace') {
      const prefix = runData.depth && runData.depth > 0 ? `  ${'  '.repeat(runData.depth - 1)}   ` : '';
      console.log(`${prefix}📝 Summarizing context (${Math.round(data.percentUsed * 100)}% used)...`);
    }
  };

  const onSummarizationComplete: AgentEvents<FP>['summarization:complete'] = (data) => {
    if (level === 'debug' || level === 'trace') {
      const prefix = runData.depth && runData.depth > 0 ? `  ${'  '.repeat(runData.depth - 1)}   ` : '';
      console.log(`${prefix}   Reduced ${data.originalCount} → ${data.summaryLength} messages\n`);
    }
  };

  // Complete handler
  const onRunComplete: AgentEvents<FP>['run:complete'] = (data) => {
    const duration = Date.now() - (runData.startTime || 0);
    const prefix = runData.depth && runData.depth > 0 ? `  ${'  '.repeat(runData.depth - 1)}   ` : '';

    // For sub-agents, show compact completion
    if (runData.depth && runData.depth > 0) {
      console.log(`${prefix}✅ Sub-agent [${runData.agentName}] complete (${duration}ms)\n`);
      return;
    }

    const termWidth = getTerminalWidth();

    // For main agent, show full summary
    console.log('═'.repeat(termWidth));
    console.log('✅ Agent Complete');
    console.log('═'.repeat(termWidth));

    if (data.result.finishParams) {
      console.log('\n📝 Result:', (data.result.finishParams as any).reason || JSON.stringify(data.result.finishParams));
    }

    console.log('\n' + '─'.repeat(termWidth));

    // Tool Usage section
    const tools = Object.entries(data.result.runMetadata)
      .filter(([key]) => key !== 'token_usage')
      .map(([name, toolData]: [string, any]) => ({ name, uses: toolData.numUses || 0 }))
      .filter((t) => t.uses > 0);

    const toolContent =
      tools.length > 0
        ? tools.map(({ name, uses }) => `${name} ${uses} call${uses === 1 ? '' : 's'}`).join('\n')
        : 'No tools used';

    console.log(
      boxen(toolContent, {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'gray',
        title: 'Tool Usage',
        titleAlignment: 'left',
        width: termWidth,
      })
    );

    // Paths section - normalize with outputDir if available
    const rawPaths = (data.result.finishParams as any)?.paths || [];
    const outputDir = data.outputDir;
    const paths = rawPaths.map((p: string) => {
      // If outputDir is set and path doesn't already start with it, prepend it
      if (outputDir && !p.startsWith(outputDir) && !p.startsWith('/')) {
        return `${outputDir}/${p}`;
      }
      return p;
    });
    const pathContent =
      paths.length > 0
        ? paths
            .map((path: string) => (path.length > termWidth - 6 ? '...' + path.slice(-(termWidth - 9)) : path))
            .join('\n')
        : 'No output paths';

    console.log(
      boxen(pathContent, {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'gray',
        title: 'Paths',
        titleAlignment: 'left',
        width: termWidth,
      })
    );

    // Token Usage section
    const tokenUsage = data.result.runMetadata.token_usage as any;
    const tokenContent = tokenUsage
      ? `Input   ${tokenUsage.input.toLocaleString().padStart(10)}\nOutput  ${tokenUsage.output.toLocaleString().padStart(10)}\nTotal   ${tokenUsage.total.toLocaleString().padStart(10)}`
      : 'No token usage data';

    console.log(
      boxen(tokenContent, {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'gray',
        title: 'Token Usage',
        titleAlignment: 'left',
        width: termWidth,
      })
    );

    console.log();
  };

  // Error handler
  const onRunError: AgentEvents<FP>['run:error'] = (data) => {
    const prefix = runData.depth && runData.depth > 0 ? `  ${'  '.repeat(runData.depth - 1)}   ` : '';
    console.log(`${prefix}❌ Agent error: ${data.error.message}`);
    if (level === 'debug' || level === 'trace') {
      console.log(data.error.stack);
    }
  };

  // Register handlers
  agent.on('run:start', onRunStart);
  agent.on('turn:start', onTurnStart);
  agent.on('message:assistant', onMessageAssistant);
  agent.on('tool:complete', onToolComplete);
  agent.on('turn:complete', onTurnComplete);
  agent.on('tool:error', onToolError);
  agent.on('summarization:start', onSummarizationStart);
  agent.on('summarization:complete', onSummarizationComplete);
  agent.on('run:complete', onRunComplete);
  agent.on('run:error', onRunError);

  // Return cleanup function
  return () => {
    agent.off('run:start', onRunStart);
    agent.off('turn:start', onTurnStart);
    agent.off('message:assistant', onMessageAssistant);
    agent.off('tool:complete', onToolComplete);
    agent.off('turn:complete', onTurnComplete);
    agent.off('tool:error', onToolError);
    agent.off('summarization:start', onSummarizationStart);
    agent.off('summarization:complete', onSummarizationComplete);
    agent.off('run:complete', onRunComplete);
    agent.off('run:error', onRunError);
  };
}

/**
 * Create a structured logger that listens to agent events
 * @param agent - The agent to monitor
 * @param options - Logger configuration
 * @returns Cleanup function to remove event listeners
 */
export function createStructuredLogger<FP = unknown>(
  agent: Agent<any, any>,
  options: StructuredLoggerOptions = {}
): () => void {
  const { level = 'debug', pretty = true, useConsoleFormat = true, pinoOptions = {} } = options;

  // Use clean console format by default
  if (useConsoleFormat) {
    return createConsoleLogger(agent, level);
  }

  // Fallback to Pino for JSON logging
  const logger = pino({
    level,
    ...pinoOptions,
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    }),
  });

  // Event handlers
  const handlers: {
    [K in keyof AgentEvents<FP>]: AgentEvents<FP>[K];
  } = {
    'run:start': (data) => {
      logger.info(
        {
          event: 'run:start',
          task: typeof data.task === 'string' ? data.task.substring(0, MAX_MESSAGE_LENGTH) : '[complex]',
          depth: data.depth,
        },
        'Agent run started'
      );
    },

    'run:complete': (data) => {
      logger.info(
        {
          event: 'run:complete',
          duration: data.duration,
          messageGroups: data.result.messageHistory.length,
          tokenUsage: data.result.runMetadata.token_usage,
          finishParams: data.result.finishParams,
        },
        `Agent run completed in ${data.duration}ms`
      );
    },

    'run:error': (data) => {
      logger.error(
        {
          event: 'run:error',
          error: {
            message: data.error.message,
            stack: data.error.stack,
            name: data.error.name,
          },
          duration: data.duration,
        },
        `Agent run failed: ${data.error.message}`
      );
    },

    'turn:start': (data) => {
      logger.debug(
        {
          event: 'turn:start',
          turn: data.turn + 1,
          maxTurns: data.maxTurns,
          progress: `${data.turn + 1}/${data.maxTurns}`,
        },
        `Turn ${data.turn + 1}/${data.maxTurns} started`
      );
    },

    'turn:complete': (data) => {
      logger.debug(
        {
          event: 'turn:complete',
          turn: data.turn + 1,
          tokenUsage: data.tokenUsage,
        },
        `Turn ${data.turn + 1} completed`
      );
    },

    'message:assistant': (data) => {
      logger.trace(
        {
          event: 'message:assistant',
          content: data.content.substring(0, MAX_MESSAGE_LENGTH),
          toolCalls: data.toolCalls?.map((tc) => tc.name) || [],
        },
        'Assistant message'
      );
    },

    'message:tool': (data) => {
      logger.trace(
        {
          event: 'message:tool',
          toolName: data.name,
          success: data.success,
          content: data.content.substring(0, MAX_MESSAGE_LENGTH),
        },
        `Tool message: ${data.name}`
      );
    },

    'tool:start': (data) => {
      logger.debug(
        {
          event: 'tool:start',
          toolName: data.name,
          arguments: data.arguments,
        },
        `Executing tool: ${data.name}`
      );
    },

    'tool:complete': (data) => {
      logger.debug(
        {
          event: 'tool:complete',
          toolName: data.name,
          success: data.success,
          resultLength: data.result.length,
        },
        `Tool ${data.success ? 'succeeded' : 'failed'}: ${data.name}`
      );
    },

    'tool:error': (data) => {
      logger.warn(
        {
          event: 'tool:error',
          toolName: data.name,
          error: {
            message: data.error.message,
            name: data.error.name,
          },
        },
        `Tool error: ${data.name} - ${data.error.message}`
      );
    },

    'summarization:start': (data) => {
      logger.info(
        {
          event: 'summarization:start',
          percentUsed: Math.round(data.percentUsed * 100),
          messageCount: data.messageCount,
        },
        `Context summarization started (${Math.round(data.percentUsed * 100)}% used)`
      );
    },

    'summarization:complete': (data) => {
      logger.info(
        {
          event: 'summarization:complete',
          summaryLength: data.summaryLength,
          originalCount: data.originalCount,
          reduction: `${data.originalCount} → ${data.summaryLength}`,
        },
        `Context summarized: ${data.originalCount} → ${data.summaryLength} messages`
      );
    },
  };

  // Register all event handlers
  for (const [event, handler] of Object.entries(handlers)) {
    agent.on(event as keyof AgentEvents<FP>, handler as any);
  }

  // Return cleanup function
  return () => {
    for (const [event, handler] of Object.entries(handlers)) {
      agent.off(event as keyof AgentEvents<FP>, handler as any);
    }
  };
}
