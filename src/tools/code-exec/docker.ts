/**
 * Docker code execution provider
 * Executes commands in a Docker container with volume mount
 */

import Docker from 'dockerode';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { CodeExecToolProvider, type CommandResult } from './base.js';
import { DEFAULT_COMMAND_TIMEOUT } from '../../constants.js';

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
  private docker: Docker;
  private container?: Docker.Container;
  private tempDir?: string;
  private config: Required<Omit<DockerCodeExecConfig, 'allowedCommands' | 'tempBaseDir' | 'description'>>;

  constructor(config: DockerCodeExecConfig) {
    super(config.allowedCommands, config.description);

    this.docker = new Docker();
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
        this.container!.modem.demuxStream(stream, {
          write: (chunk: Buffer) => {
            stdout += chunk.toString();
          },
        } as any, {
          write: (chunk: Buffer) => {
            stderr += chunk.toString();
          },
        } as any);

        stream.on('end', resolve);
      });

      // Race between output collection and timeout
      await Promise.race([
        outputPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeout)
        ),
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

  async readFileBytes(path: string): Promise<Buffer> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    // Read from host temp directory (mapped to container)
    const fullPath = join(this.tempDir, path);
    return await readFile(fullPath);
  }

  async writeFileBytes(path: string, content: Buffer): Promise<void> {
    if (!this.tempDir) {
      throw new Error('Temp directory not initialized');
    }

    // Write to host temp directory (mapped to container)
    const fullPath = join(this.tempDir, path);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    await writeFile(fullPath, content);
  }

  /**
   * Get the container ID (for debugging)
   */
  getContainerId(): string | undefined {
    return this.container?.id;
  }
}
