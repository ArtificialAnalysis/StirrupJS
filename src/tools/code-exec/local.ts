/**
 * Local code execution provider
 * Executes commands in an isolated temporary directory
 */

import { execa } from 'execa';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { CodeExecToolProvider, type CommandResult, type SaveOutputFilesResult } from './base.js';
import { DEFAULT_COMMAND_TIMEOUT } from '../../constants.js';

/**
 * Local code execution provider
 * Executes commands in an isolated temporary directory on the local filesystem
 */
export class LocalCodeExecToolProvider extends CodeExecToolProvider {
  private tempDir?: string;

  constructor(allowedCommands?: string[], _tempBaseDir?: string, description?: string) {
    super(
      allowedCommands,
      description ?? 'Execute a shell command in the execution environment. Returns exit code, stdout, and stderr as XML. Use `uv` to manage packages.'
    );
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // Cleanup temp directory
    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to cleanup temp directory:', error);
      }
    }
  }

  override async getTools() {
    // Create temp directory
    this.tempDir = await mkdtemp(join(tmpdir(), 'stirrup-local-'));
    return super.getTools();
  }

  async runCommand(cmd: string, timeout: number = DEFAULT_COMMAND_TIMEOUT): Promise<CommandResult> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    try {
      // Execute command with execa
      const result = await execa('bash', ['-c', cmd], {
        cwd: this.tempDir,
        timeout,
        reject: false, // Don't throw on non-zero exit
        all: true,
      });

      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error: any) {
      // Handle timeout
      if (error.killed && error.signal === 'SIGTERM') {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Command timed out',
          errorKind: 'timeout',
          advice: `Command exceeded ${timeout}ms timeout`,
        };
      }

      // Other errors
      return {
        exitCode: -1,
        stdout: '',
        stderr: error.message || String(error),
        errorKind: 'execution_error',
      };
    }
  }

  async readFileBytes(path: string): Promise<Buffer> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    // Security: ensure path is relative and within temp directory
    if (path.startsWith('/') || path.includes('..')) {
      throw new Error('Invalid file path: must be relative and within execution directory');
    }

    const fullPath = join(this.tempDir, path);
    return await readFile(fullPath);
  }

  async writeFileBytes(path: string, content: Buffer): Promise<void> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    // Security: ensure path is relative and within temp directory
    if (path.startsWith('/') || path.includes('..')) {
      throw new Error('Invalid file path: must be relative and within execution directory');
    }

    const fullPath = join(this.tempDir, path);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    await writeFile(fullPath, content);
  }

  /**
   * Get the temp directory path (for debugging)
   */
  getTempDir(): string | undefined {
    return this.tempDir;
  }

  /**
   * Save output files from the temp directory to a destination
   *
   * When destEnv is null (local filesystem), files are MOVED (not copied) -
   * originals are deleted from the execution environment.
   * Existing files in outputDir are silently overwritten.
   *
   * When destEnv is provided (cross-environment transfer), files are copied
   * using the base class implementation via read/write primitives.
   *
   * @param paths - List of file paths in the execution environment (relative or absolute)
   * @param outputDir - Directory path to save files to
   * @param destEnv - If provided, outputDir is interpreted as a path within destEnv
   * @returns SaveOutputFilesResult containing lists of saved files and any failures
   */
  override async saveOutputFiles(
    paths: string[],
    outputDir: string,
    destEnv?: CodeExecToolProvider
  ): Promise<SaveOutputFilesResult> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    // If dest_env is provided, use the base class implementation (cross-env transfer)
    if (destEnv) {
      return await super.saveOutputFiles(paths, outputDir, destEnv);
    }

    // Local filesystem - use optimized move operation
    const result: SaveOutputFilesResult = {
      saved: [],
      failed: {},
    };

    const { rename, stat, mkdir } = await import('fs/promises');
    const { join, resolve, relative, basename, dirname, isAbsolute } = await import('path');

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    for (const sourcePathStr of paths) {
      try {
        let sourcePath = sourcePathStr;

        // Convert to absolute path if relative
        if (!isAbsolute(sourcePath)) {
          sourcePath = join(this.tempDir, sourcePath);
        }

        // Security: ensure path is within temp directory
        const resolvedSource = resolve(sourcePath);
        const resolvedTempDir = resolve(this.tempDir);
        const relativePath = relative(resolvedTempDir, resolvedSource);

        if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
          result.failed[sourcePathStr] = 'Path is outside execution environment directory';
          continue;
        }

        // Check if file exists
        const stats = await stat(sourcePath);
        if (!stats.isFile()) {
          result.failed[sourcePathStr] = 'Path is not a file';
          continue;
        }

        // Move file to output directory
        const filename = basename(sourcePath);
        const destPath = join(outputDir, filename);

        // Ensure destination directory exists
        await mkdir(dirname(destPath), { recursive: true });

        // Move file (atomic rename if same filesystem, copy+delete otherwise)
        await rename(sourcePath, destPath);

        result.saved.push({
          sourcePath: sourcePathStr,
          outputPath: destPath,
          size: stats.size,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.failed[sourcePathStr] = errorMsg;
      }
    }

    return result;
  }
}
