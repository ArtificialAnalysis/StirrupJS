/**
 * Default agent logger with rich terminal output
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import ora, { type Ora } from 'ora';
import boxen from 'boxen';
import type { AgentLoggerBase } from './base.js';
import type { AssistantMessage, UserMessage, ToolMessage } from '../../core/models.js';
import { SUBAGENT_INDENT_SPACES } from '../../constants.js';

/**
 * Agent logger with rich terminal output
 * Uses chalk for colors, cli-table3 for tables, ora for spinners, boxen for panels
 */
export class AgentLogger implements AgentLoggerBase {
  name: string;
  model: string;
  maxTurns: number;
  depth: number;
  outputDir?: string;
  finishParams?: unknown;
  runMetadata?: Record<string, unknown>;

  private spinner?: Ora;
  private currentToolCalls = 0;
  private currentInputTokens = 0;
  private currentOutputTokens = 0;

  constructor(name: string, model: string, maxTurns: number, depth: number = 0) {
    this.name = name;
    this.model = model;
    this.maxTurns = maxTurns;
    this.depth = depth;
  }

  onEnter(): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);

    console.log(
      indent +
        boxen(chalk.bold.cyan(`Agent: ${this.name}`) + '\n' + chalk.gray(`Model: ${this.model}`), {
          padding: 1,
          margin: { top: 1, bottom: 0, left: 0, right: 0 },
          borderStyle: 'round',
          borderColor: 'cyan',
        })
    );
  }

  onExit(): void {
    // Stop spinner if running
    if (this.spinner) {
      this.spinner.stop();
    }

    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);

    // Display finish status
    const isSuccess = this.finishParams !== undefined;
    const statusSymbol = isSuccess ? chalk.green('✓') : chalk.red('✗');
    const statusText = isSuccess ? chalk.green('Complete') : chalk.red('Incomplete');

    console.log();
    console.log(indent + chalk.bold(`${statusSymbol} ${statusText}`));

    // Display finish reason if available
    if (isSuccess && this.finishParams && typeof this.finishParams === 'object' && 'reason' in this.finishParams) {
      const reason = (this.finishParams as any).reason;
      console.log(
        indent +
          boxen(chalk.white(reason), {
            padding: 1,
            margin: { top: 1, bottom: 1, left: 0, right: 0 },
            borderStyle: 'single',
            borderColor: 'green',
            title: 'Reason',
          })
      );
    }

    // Display token usage table
    if (this.runMetadata && 'token_usage' in this.runMetadata) {
      this.displayTokenUsage(this.runMetadata.token_usage as any);
    }

    console.log();
  }

  onTaskMessage(content: string): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);
    const truncated = this.truncate(content, 500);

    console.log(
      indent +
        boxen(chalk.white(truncated), {
          padding: 1,
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderStyle: 'double',
          borderColor: 'blue',
          title: 'Task',
        })
    );
  }

  onAssistantMessage(message: AssistantMessage, turn: number): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);
    const truncated = this.truncate(message.content, 500);

    console.log();
    console.log(indent + chalk.cyan.bold(`┌─ Turn ${turn + 1}/${this.maxTurns} ─ Assistant`));

    if (truncated) {
      console.log(indent + chalk.white(truncated));
    }

    // Display tool calls
    if (message.toolCalls && message.toolCalls.length > 0) {
      console.log(indent + chalk.gray('Tool calls:'));
      for (const tc of message.toolCalls) {
        console.log(indent + chalk.yellow(`  • ${tc.name}`));
        try {
          const args = JSON.parse(tc.arguments);
          const formattedArgs = JSON.stringify(args, null, 2)
            .split('\n')
            .map((line) => indent + '    ' + chalk.gray(line))
            .join('\n');
          console.log(formattedArgs);
        } catch {
          console.log(indent + chalk.gray(`    ${tc.arguments}`));
        }
      }
    }

    console.log(indent + chalk.cyan('└─────────────'));
  }

  onUserMessage(message: UserMessage): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);
    const truncated = this.truncate(message.content, 500);

    console.log();
    console.log(indent + chalk.blue.bold('User:'));
    console.log(indent + chalk.white(truncated));
  }

  onToolResult(message: ToolMessage): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);
    const statusSymbol = message.argsWasValid ? chalk.green('✓') : chalk.red('✗');
    const truncated = this.truncate(message.content, 1000);

    console.log();
    console.log(indent + chalk.yellow(`${statusSymbol} Tool: ${message.name}`));
    console.log(indent + chalk.gray(truncated));
  }

  onSummarizationStart(percentUsed: number, threshold: number): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);

    console.log();
    console.log(
      indent +
        chalk.magenta.bold('⚡ Context Summarization') +
        ' ' +
        chalk.gray(`(${(percentUsed * 100).toFixed(1)}% used, threshold: ${(threshold * 100).toFixed(0)}%)`)
    );
  }

  onSummarizationComplete(summary: string): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);
    const truncated = this.truncate(summary, 500);

    console.log(indent + chalk.gray(truncated));
    console.log();
  }

  onStep(turn: number, toolCallCount: number, inputTokens: number, outputTokens: number): void {
    // Update accumulated stats
    this.currentToolCalls += toolCallCount;
    this.currentInputTokens += inputTokens;
    this.currentOutputTokens += outputTokens;

    // Only show spinner for depth 0 (root agent)
    if (this.depth === 0) {
      if (!this.spinner) {
        this.spinner = ora();
      }

      const statsText = [
        chalk.gray(`Turn: ${turn + 1}/${this.maxTurns}`),
        chalk.gray(`Tools: ${this.currentToolCalls}`),
        chalk.gray(`Tokens: ${this.currentInputTokens}in/${this.currentOutputTokens}out`),
      ].join(' | ');

      this.spinner.text = statsText;

      if (!this.spinner.isSpinning) {
        this.spinner.start();
      }
    }
  }

  /**
   * Display token usage table
   */
  private displayTokenUsage(tokenUsage: any): void {
    const indent = ' '.repeat(this.depth * SUBAGENT_INDENT_SPACES);

    if (!tokenUsage || typeof tokenUsage !== 'object') {
      return;
    }

    const table = new Table({
      head: [chalk.cyan('Type'), chalk.cyan('Tokens')],
      colWidths: [20, 15],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    if ('input' in tokenUsage) {
      table.push(['Input', tokenUsage.input?.toString() || '0']);
    }
    if ('output' in tokenUsage) {
      table.push(['Output', tokenUsage.output?.toString() || '0']);
    }
    if ('reasoning' in tokenUsage && tokenUsage.reasoning > 0) {
      table.push(['Reasoning', tokenUsage.reasoning.toString()]);
    }
    if ('total' in tokenUsage) {
      table.push([chalk.bold('Total'), chalk.bold(tokenUsage.total.toString())]);
    }

    const tableStr = table.toString();
    tableStr.split('\n').forEach((line) => {
      console.log(indent + line);
    });
  }

  /**
   * Truncate content with ellipsis
   */
  private truncate(content: unknown, maxLength: number): string {
    const str = typeof content === 'string' ? content : JSON.stringify(content);

    if (str.length <= maxLength) {
      return str;
    }

    return str.substring(0, maxLength) + chalk.gray('...[truncated]');
  }
}
