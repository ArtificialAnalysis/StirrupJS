/**
 * Agent run cache - enables caching and resumption of agent tasks
 *
 * On interruption (max turns, errors), the agent's conversation state
 * is cached to ~/.cache/stirrup/<task_hash>/. Tasks can be resumed
 * by setting resume: true in SessionConfig.
 */

import { createHash } from 'crypto';
import { mkdir, readFile, writeFile, stat, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ChatMessage } from './models.js';

const CACHE_DIR = join(homedir(), '.cache', 'stirrup');

/**
 * Serialized state of an interrupted agent run
 */
export interface CachedRunState {
  /** Current messages at time of interruption */
  messages: ChatMessage[];

  /** Message history groups completed before interruption */
  messageHistory: ChatMessage[][];

  /** Accumulated run metadata */
  runMetadata: Record<string, unknown>;

  /** Turn number at time of interruption */
  turn: number;

  /** Timestamp of cache creation */
  timestamp: number;

  /** Files from execution environment (relative path -> base64 content) */
  files: Record<string, string>;
}

/**
 * Manages caching and resumption of agent run state
 */
export class CacheManager {
  private cacheKey: string;
  private cacheDir: string;

  constructor(initMessages: ChatMessage[]) {
    this.cacheKey = CacheManager.computeKey(initMessages);
    this.cacheDir = join(CACHE_DIR, this.cacheKey);
  }

  /**
   * Compute a deterministic cache key from initial messages
   */
  static computeKey(messages: ChatMessage[]): string {
    const content = JSON.stringify(
      messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
    );
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Check if cached state exists for this task
   */
  async hasCachedState(): Promise<boolean> {
    try {
      const s = await stat(join(this.cacheDir, 'state.json'));
      return s.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Load cached state
   */
  async loadState(): Promise<CachedRunState | null> {
    try {
      const data = await readFile(join(this.cacheDir, 'state.json'), 'utf-8');
      return JSON.parse(data) as CachedRunState;
    } catch {
      return null;
    }
  }

  /**
   * Save current state to cache
   */
  async saveState(state: CachedRunState): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(join(this.cacheDir, 'state.json'), JSON.stringify(state, null, 2));
  }

  /**
   * Remove cached state (called after successful completion)
   */
  async clearState(): Promise<void> {
    try {
      await rm(this.cacheDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }

  /**
   * Get the cache directory path
   */
  getCacheDir(): string {
    return this.cacheDir;
  }
}
