/**
 * Session state management for agent execution
 */

import { AsyncContext } from '../utils/context.js';
import { AsyncDisposableStack } from '../utils/async-stack.js';
import type { CodeExecToolProvider } from '../tools/code-exec/base.js';
import type { SkillMetadata } from '../skills/index.js';

export type { CodeExecToolProvider };

/**
 * Session state for agent execution
 * Managed via AsyncLocalStorage for proper isolation
 */
export interface SessionState {
  /** Exit stack for resource cleanup */
  exitStack: AsyncDisposableStack;

  /** Code execution environment (if available) */
  execEnv?: CodeExecToolProvider;

  /** Output directory for files */
  outputDir?: string;

  /** Parent execution environment for sub-agents */
  parentExecEnv?: CodeExecToolProvider;

  /** Nesting depth (0 = root agent, >0 = sub-agent) */
  depth: number;

  /** Files uploaded at session start */
  uploadedFilePaths: string[];

  /** Skills metadata loaded at session start */
  skillsMetadata: SkillMetadata[];
}

/**
 * Session context for agent execution
 * Provides access to current session state
 */
export const sessionContext = new AsyncContext<SessionState>();

/**
 * Parent depth context for sub-agent tracking
 */
export const parentDepthContext = new AsyncContext<number>();

/**
 * Create a new session state
 */
export function createSessionState(depth: number = 0): SessionState {
  return {
    exitStack: new AsyncDisposableStack(),
    depth,
    uploadedFilePaths: [],
    skillsMetadata: [],
  };
}

/**
 * Get current session state
 * Throws if no session is active
 */
export function getCurrentSession(): SessionState {
  const state = sessionContext.get();
  if (!state) {
    throw new Error('No active session. Agent must be run within a session context.');
  }
  return state;
}

/**
 * Get parent depth for sub-agent nesting
 */
export function getParentDepth(): number {
  return parentDepthContext.get() ?? 0;
}
