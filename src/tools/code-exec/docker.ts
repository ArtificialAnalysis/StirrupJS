/**
 * Docker code execution provider
 * Executes commands in a Docker container with volume mount
 */

import type Docker from 'dockerode';
import { mkdtemp, rm, mkdir, readFile, writeFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname, resolve, relative, isAbsolute } from 'path';
import { CodeExecToolProvider, type CommandResult } from './base.js';
import { DEFAULT_COMMAND_TIMEOUT } from '../../constants.js';

let _Docker: typeof Docker | undefined;
async function getDocker(): Promise<typeof Docker> {
  if (!_Docker) {
    _Docker = (await import('dockerode')).default;
  }
  return _Docker;
}

/**
 * Docker code execution provider configuration
 */
export interface DockerCodeExecConfig {
  /** Docker image to use */
  image: string;

  /** Working directory in container */
  workingDir?: string;

  /** Allowed commands (regex patterns) */
  allowedCommands?: string[];

  /** Base directory for temp files */
  tempBaseDir?: string;

  /** Environment variables to inject */
  envVars?: Record<string, string>;

  /** Custom description */
  description?: string;
}

/**
 * Docker code execution provider
 * Executes commands in a Docker container with host directory mounted as volume
 */
export class DockerCodeExecToolProvider extends CodeExecToolProvider {
  private docker?: Docker;
  private container?: Docker.Container;
  private tempDir?: string;
  private config: Required<Omit<DockerCodeExecConfig, 'allowedCommands' | 'tempBaseDir' | 'description'>>;

  constructor(config: DockerCodeExecConfig) {
    super(config.allowedCommands, config.description);

    this.config = {
      image: config.image,
      workingDir: config.workingDir ?? '/workspace',
      envVars: config.envVars ?? {},
    };
  }

  /**
   * Factory method: create from Docker image
   */
  static fromImage(
    image: string,
    workingDir?: string,
    allowedCommands?: string[],
    envVars?: Record<string, string>
  ): DockerCodeExecToolProvider {
    return new DockerCodeExecToolProvider({
      image,
      workingDir,
      allowedCommands,
      envVars,
    });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // Stop and remove container
    if (this.container) {
      try {
        await this.container.stop();
        await this.container.remove();
      } catch (error) {
        console.warn('Failed to cleanup Docker container:', error);
      }
    }

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
    // Lazily load dockerode
    const DockerImpl = await getDocker();
    this.docker = new DockerImpl();

    // Create temp directory
    this.tempDir = await mkdtemp(join(tmpdir(), 'stirrup-docker-'));

    // Create container with volume mount
    this.container = await this.docker.createContainer({
      Image: this.config.image,
      WorkingDir: this.config.workingDir,
      Tty: false,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: false,
      StdinOnce: false,
      Env: Object.entries(this.config.envVars).map(([key, value]) => `${key}=${value}`),
      HostConfig: {
        Binds: [`${this.tempDir}:${this.config.workingDir}`],
        AutoRemove: false,
      },
      Cmd: ['/bin/sh', '-c', 'while true; do sleep 1; done'], // Keep container alive
    });

    // Start container
    await this.container.start();

    return super.getTools();
  }

  async runCommand(cmd: string, timeout: number = DEFAULT_COMMAND_TIMEOUT): Promise<CommandResult> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    try {
      // Execute command in container
      const exec = await this.container.exec({
        Cmd: ['/bin/sh', '-c', cmd],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: this.config.workingDir,
      });

      // Start execution with timeout
      const stream = await exec.start({ Detach: false });

      let stdout = '';
      let stderr = '';

      // Collect output with timeout
      const outputPromise = new Promise<void>((resolve) => {
        this.container!.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => {
              stdout += chunk.toString();
            },
          } as any,
          {
            write: (chunk: Buffer) => {
              stderr += chunk.toString();
            },
          } as any
        );

        stream.on('end', resolve);
      });

      // Race between output collection and timeout
      await Promise.race([
        outputPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
      ]);

      // Get exit code
      const inspectResult = await exec.inspect();
      const exitCode = inspectResult.ExitCode ?? 0;

      return {
        exitCode,
        stdout,
        stderr,
      };
    } catch (error: any) {
      if (error.message === 'timeout') {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Command timed out',
          errorKind: 'timeout',
          advice: `Command exceeded ${timeout}ms timeout`,
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

  /**
   * Resolve a path to the corresponding host filesystem path.
   *
   * Priority:
   * 1. If path is already an absolute host path within tempDir, use as-is.
   * 2. If path starts with container workingDir, map to host equivalent.
   * 3. If path is absolute but not in workingDir, strip root and resolve relative to tempDir.
   * 4. If path is relative, resolve relative to tempDir.
   */
  private resolveHostPath(path: string): string {
    if (!this.tempDir) throw new Error('Temp directory not initialized');

    const resolvedTempDir = resolve(this.tempDir);

    if (isAbsolute(path)) {
      const resolvedPath = resolve(path);

      // Case 1: Already an absolute path within tempDir
      if (resolvedPath.startsWith(resolvedTempDir)) {
        return resolvedPath;
      }

      // Case 2: Absolute container path starting with workingDir
      if (path.startsWith(this.config.workingDir)) {
        const relativePart = relative(this.config.workingDir, path);
        return join(this.tempDir, relativePart);
      }

      // Case 3: Other absolute paths -- strip leading / and resolve relative to tempDir
      return join(this.tempDir, path.replace(/^\/+/, ''));
    }

    // Case 4: Relative path
    return join(this.tempDir, path);
  }

  async readFileBytes(path: string): Promise<Buffer> {
    const fullPath = this.resolveHostPath(path);
    return await readFile(fullPath);
  }

  async writeFileBytes(path: string, content: Buffer): Promise<void> {
    const fullPath = this.resolveHostPath(path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolveHostPath(path);
      const s = await stat(fullPath);
      return s.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Get the container ID (for debugging)
   */
  getContainerId(): string | undefined {
    return this.container?.id;
  }
}
