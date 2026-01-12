/**
 * AsyncLocalStorage wrappers for context management
 * Provides Python contextvars-like functionality for TypeScript
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Generic async context wrapper using AsyncLocalStorage
 * Provides convenient methods for getting, setting, and running with context
 */
export class AsyncContext<T> {
  private storage: AsyncLocalStorage<T>;

  constructor() {
    this.storage = new AsyncLocalStorage<T>();
  }

  /**
   * Get the current context value
   * @param defaultValue Optional default value if no context is set
   * @returns Current context value or undefined
   */
  get(defaultValue?: T): T | undefined {
    const value = this.storage.getStore();
    return value ?? defaultValue;
  }

  /**
   * Set the context value for the current async context
   * Note: This uses enterWith which affects the current async context
   * @param value Value to set
   */
  set(value: T): void {
    this.storage.enterWith(value);
  }

  /**
   * Run a function with a specific context value
   * Creates a new async context for the function execution
   * @param value Context value for the function
   * @param fn Function to execute with the context
   * @returns Result of the function
   */
  run<R>(value: T, fn: () => R): R {
    return this.storage.run(value, fn);
  }

  /**
   * Run an async function with a specific context value
   * Creates a new async context for the function execution
   * @param value Context value for the function
   * @param fn Async function to execute with the context
   * @returns Promise resolving to the result of the function
   */
  async runAsync<R>(value: T, fn: () => Promise<R>): Promise<R> {
    return this.storage.run(value, fn);
  }

  /**
   * Check if a context value is currently set
   * @returns true if context has a value
   */
  has(): boolean {
    return this.storage.getStore() !== undefined;
  }
}

/**
 * Reset token for context management
 * Used to restore previous context value
 */
export interface ContextToken {
  reset(): void;
}

/**
 * Async context with token-based reset functionality
 * Similar to Python's contextvars with token reset
 */
export class AsyncContextWithReset<T> extends AsyncContext<T> {
  /**
   * Set a value and return a reset token
   * @param value Value to set
   * @returns Token that can be used to reset to previous value
   */
  setWithToken(value: T): ContextToken {
    const previousValue = this.get();
    this.set(value);

    return {
      reset: () => {
        if (previousValue !== undefined) {
          this.set(previousValue);
        }
      },
    };
  }
}
