/**
 * E2B code execution provider
 * Executes commands in E2B cloud sandbox
 */

import { Sandbox } from '@e2b/code-interpreter';
import { CodeExecToolProvider, type CommandResult } from './base.js';
import { DEFAULT_E2B_TIMEOUT } from '../../constants.js';

/**
 * E2B code execution provider configuration
 */
export interface E2BCodeExecConfig {
  /** E2B API key */
  apiKey?: string;

  /** Timeout in milliseconds */
  timeout?: number;

  /** E2B template name (optional) */
  template?: string;

  /** Allowed commands (regex patterns) */
  allowedCommands?: string[];

  /** Custom description */
  description?: string;
}

/**
 * E2B code execution provider
 * Executes commands in E2B cloud sandbox environment
 */
export class E2BCodeExecToolProvider extends CodeExecToolProvider {
  private sandbox?: Sandbox;
  private apiKey: string;
  private timeout: number;
  private template?: string;

  constructor(config: E2BCodeExecConfig = {}) {
    super(config.allowedCommands, config.description);

    this.apiKey = config.apiKey ?? process.env.E2B_API_KEY ?? '';
    this.timeout = config.timeout ?? DEFAULT_E2B_TIMEOUT;
    this.template = config.template;

    if (!this.apiKey) {
      throw new Error('E2B_API_KEY environment variable is required');
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // Close sandbox
    if (this.sandbox) {
      try {
        await this.sandbox.kill();
      } catch (error) {
        console.warn('Failed to close E2B sandbox:', error);
      }
    }
  }

  override async getTools() {
    // Create sandbox
    this.sandbox = await Sandbox.create({
      apiKey: this.apiKey,
      template: this.template,
      timeoutMs: this.timeout,
    } as any);

    return super.getTools();
  }

  async runCommand(cmd: string, _timeout?: number): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('Sandbox not initialized');
    }

    try {
      // Execute command
      const execution = await this.sandbox.runCode(cmd, {
        onStdout: () => {}, // We collect output from result
        onStderr: () => {},
      });

      // Check for errors
      if (execution.error) {
        const err = execution.error as any;
        // Build comprehensive error message with name, value, and traceback
        const parts: string[] = [];
        if (err.name) parts.push(err.name);
        if (err.value) parts.push(err.value);
        if (err.message && err.message !== err.value) parts.push(err.message);
        if (err.traceback) parts.push(err.traceback);
        const errorMessage = parts.length > 0 ? parts.join(': ') : JSON.stringify(err);
        return {
          exitCode: 1,
          stdout: '',
          stderr: errorMessage,
          errorKind: 'execution_error',
        };
      }

      return {
        exitCode: 0,
        stdout: execution.logs.stdout.join('\n'),
        stderr: execution.logs.stderr.join('\n'),
      };
    } catch (error: any) {
      // Handle timeout
      if (error.message?.includes('timeout')) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Command timed out',
          errorKind: 'timeout',
          advice: `Command exceeded ${this.timeout}ms timeout`,
        };
      }

      // Handle invalid arguments (NUL bytes, etc.)
      if (error.message?.includes('invalid')) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: error.message,
          errorKind: 'invalid_argument',
          advice: 'Check command for invalid characters (NUL bytes, control characters)',
        };
      }

      return {
        exitCode: -1,
        stdout: '',
        stderr: error.message || String(error),
        errorKind: 'execution_error',
      };
    }
  }

  async readFileBytes(path: string): Promise<Buffer> {
    if (!this.sandbox) {
      throw new Error('Sandbox not initialized');
    }

    try {
      const content = await this.sandbox.files.read(path);
      return Buffer.from(content);
    } catch (error) {
      throw new Error(`Failed to read file ${path}: ${error}`);
    }
  }

  async writeFileBytes(path: string, content: Buffer): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Sandbox not initialized');
    }

    try {
      await this.sandbox.files.write(path, content.toString());
    } catch (error) {
      throw new Error(`Failed to write file ${path}: ${error}`);
    }
  }

  /**
   * Get the sandbox ID (for debugging)
   */
  getSandboxId(): string | undefined {
    return this.sandbox?.sandboxId;
  }
}
