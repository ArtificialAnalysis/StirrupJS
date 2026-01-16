/**
 * Base class for code execution tool providers
 */

import { z } from 'zod';
import type { Tool, BaseTool, ToolProvider, ToolResult } from '../../core/models.js';
import { ToolUseCountMetadata } from '../../core/models.js';

/**
 * Parameters for code execution
 */
export const CodeExecutionParamsSchema = z.object({
  cmd: z.string().describe('Shell command to execute'),
});

export type CodeExecutionParams = z.infer<typeof CodeExecutionParamsSchema>;

/**
 * Result of command execution
 */
export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  errorKind?: string;
  advice?: string;
}

/**
 * Information about a saved file
 */
export interface SavedFile {
  sourcePath: string;
  outputPath: string;
  size: number;
}

/**
 * Result of save_output_files operation
 */
export interface SaveOutputFilesResult {
  saved: SavedFile[];
  failed: Record<string, string>;
}

/**
 * Abstract base class for code execution providers
 * Provides consistent interface for Local, Docker, and E2B backends
 */
export abstract class CodeExecToolProvider implements ToolProvider {
  protected allowedCommands?: RegExp[];
  protected description?: string;

  constructor(allowedCommands?: string[], description?: string) {
    this.allowedCommands = allowedCommands?.map((pattern) => new RegExp(pattern));
    this.description = description;
  }

  abstract [Symbol.asyncDispose](): Promise<void>;

  async getTools(): Promise<BaseTool[]> {
    return [this.getCodeExecTool()];
  }

  /**
   * Create the code_exec tool
   */
  protected getCodeExecTool(): Tool<typeof CodeExecutionParamsSchema, ToolUseCountMetadata> {
    return {
      name: 'code_exec',
      description:
        this.description ?? 'Execute shell commands in a sandboxed environment. Returns stdout, stderr, and exit code.',
      parameters: CodeExecutionParamsSchema,
      executor: async (params): Promise<ToolResult<ToolUseCountMetadata>> => {
        try {
          if (this.allowedCommands) {
            const isAllowed = this.allowedCommands.some((regex) => regex.test(params.cmd));
            if (!isAllowed) {
              return {
                content: this.formatError({
                  exitCode: -1,
                  stdout: '',
                  stderr: 'Command not allowed by security policy',
                  errorKind: 'security',
                  advice: 'Only specific commands are permitted. Check the allowed command patterns.',
                }),
                metadata: new ToolUseCountMetadata(1),
              };
            }
          }

          const result = await this.runCommand(params.cmd);

          const content = this.formatResult(result);

          return {
            content,
            metadata: new ToolUseCountMetadata(1),
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: this.formatError({
              exitCode: -1,
              stdout: '',
              stderr: errorMsg,
              errorKind: 'execution_error',
            }),
            metadata: new ToolUseCountMetadata(1),
          };
        }
      },
    };
  }

  /**
   * Execute a command in the environment
   * Must be implemented by subclasses
   */
  abstract runCommand(cmd: string, timeout?: number): Promise<CommandResult>;

  /**
   * Read file contents as bytes
   * Must be implemented by subclasses
   */
  abstract readFileBytes(path: string): Promise<Buffer>;

  /**
   * Write file contents from bytes
   * Must be implemented by subclasses
   */
  abstract writeFileBytes(path: string, content: Buffer): Promise<void>;

  /**
   * Upload files to the execution environment
   * Default implementation for subclasses to override if needed
   */
  async uploadFiles(
    paths: string[],
    sourceEnv?: CodeExecToolProvider,
    options?: { destDir?: string }
  ): Promise<{ uploaded: string[] }> {
    const uploaded: string[] = [];

    for (const path of paths) {
      try {
        if (sourceEnv) {
          // Cross-environment upload only supports explicit file paths.
          // (We don't currently have primitives for listing directories in sourceEnv.)
          const content = await sourceEnv.readFileBytes(path);
          await this.writeFileBytes(this.assertSafeDestPath(path), content);
          uploaded.push(this.assertSafeDestPath(path));
          continue;
        }

        const fs = await import('fs/promises');
        const nodePath = await import('path');
        const { resolve, relative, basename } = nodePath;

        const sourcePath = path;
        const st = await fs.stat(sourcePath);

        if (st.isDirectory()) {
          // Upload directory recursively.
          const entries: string[] = [];
          for await (const file of this.walkDir(sourcePath)) {
            entries.push(file);
          }

          const baseName = basename(resolve(sourcePath));
          for (const filePath of entries) {
            const rel = relative(sourcePath, filePath);
            const destBase = options?.destDir ? options.destDir : baseName;
            const dest = this.assertSafeDestPath(`${destBase}/${this.toPosix(rel)}`);
            const content = await fs.readFile(filePath);
            await this.writeFileBytes(dest, content);
            uploaded.push(dest);
          }
        } else if (st.isFile()) {
          // Upload a single file.
          const content = await fs.readFile(sourcePath);

          // If absolute, try to make it relative to cwd; otherwise fall back to basename.
          const abs = resolve(sourcePath);
          const cwd = process.cwd();
          const relToCwd = relative(cwd, abs);
          const isSafeRel = relToCwd && !relToCwd.startsWith('..') && !nodePath.isAbsolute(relToCwd);
          const destRel = this.assertSafeDestPath(this.toPosix(isSafeRel ? relToCwd : basename(abs)));
          await this.writeFileBytes(destRel, content);
          uploaded.push(destRel);
        } else {
          console.warn(`Skipping non-file, non-directory path: ${sourcePath}`);
        }
      } catch (error) {
        console.warn(`Failed to upload file ${path}:`, error);
      }
    }

    return { uploaded };
  }

  private toPosix(p: string): string {
    return p.replaceAll('\\', '/').replace(/^\.\/+/, '');
  }

  private assertSafeDestPath(dest: string): string {
    const normalized = this.toPosix(dest);
    if (normalized.startsWith('/')) {
      throw new Error(`Invalid destination path (must be relative): ${dest}`);
    }
    if (normalized.split('/').some((seg) => seg === '..')) {
      throw new Error(`Invalid destination path (must not contain '..'): ${dest}`);
    }
    return normalized;
  }

  private async *walkDir(root: string): AsyncGenerator<string> {
    const fs = await import('fs/promises');
    const nodePath = await import('path');
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const full = nodePath.join(root, entry.name);
      if (entry.isDirectory()) {
        yield* this.walkDir(full);
      } else if (entry.isFile()) {
        yield full;
      }
    }
  }

  /**
   * Save output files from the execution environment to a destination
   *
   * Base implementation uses read/write primitives for cross-environment transfers.
   * Subclasses can override for optimized local filesystem operations.
   *
   * @param paths - List of file paths in this execution environment to save
   * @param outputDir - Directory path to save files to
   * @param destEnv - If provided, outputDir is interpreted as a path within destEnv
   *                  (cross-environment transfer). If null, outputDir is a local
   *                  filesystem path.
   * @returns SaveOutputFilesResult containing lists of saved files and any failures
   */
  async saveOutputFiles(
    paths: string[],
    outputDir: string,
    destEnv?: CodeExecToolProvider
  ): Promise<SaveOutputFilesResult> {
    const result: SaveOutputFilesResult = {
      saved: [],
      failed: {},
    };

    const { writeFile, mkdir } = await import('fs/promises');
    const { join, dirname, basename } = await import('path');

    for (const sourcePath of paths) {
      try {
        // Read file content from this environment
        const content = await this.readFileBytes(sourcePath);
        const filename = basename(sourcePath);
        const destPath = join(outputDir, filename);

        if (destEnv) {
          // Transfer to another execution environment (cross-environment)
          await destEnv.writeFileBytes(destPath, content);
          result.saved.push({
            sourcePath,
            outputPath: destPath,
            size: content.length,
          });
        } else {
          // Save to local filesystem
          await mkdir(dirname(destPath), { recursive: true });
          await writeFile(destPath, content);
          result.saved.push({
            sourcePath,
            outputPath: destPath,
            size: content.length,
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.failed[sourcePath] = errorMsg;
      }
    }

    return result;
  }

  /**
   * Format command result as XML
   */
  protected formatResult(result: CommandResult): string {
    let output = '<command_result>\n';
    output += `  <exit_code>${result.exitCode}</exit_code>\n`;

    if (result.stdout) {
      output += `  <stdout>${this.truncate(result.stdout, 10000)}</stdout>\n`;
    }

    if (result.stderr) {
      output += `  <stderr>${this.truncate(result.stderr, 10000)}</stderr>\n`;
    }

    if (result.errorKind) {
      output += `  <error_kind>${result.errorKind}</error_kind>\n`;
    }

    if (result.advice) {
      output += `  <advice>${result.advice}</advice>\n`;
    }

    output += '</command_result>';
    return output;
  }

  /**
   * Format error as XML
   */
  protected formatError(result: CommandResult): string {
    return this.formatResult(result);
  }

  /**
   * Truncate content if too long
   */
  protected truncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '\n\n[Output truncated]';
  }
}
