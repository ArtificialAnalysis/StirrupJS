/**
 * AsyncDisposableStack implementation
 * Provides Python AsyncExitStack-like functionality for TypeScript
 * Uses TC39 Symbol.asyncDispose proposal
 */

/**
 * Interface for async disposable resources
 */
export interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Async disposal function type
 */
export type AsyncDisposeFn = () => Promise<void>;

/**
 * Stack-based async resource manager
 * Ensures resources are cleaned up in reverse order (LIFO)
 * Similar to Python's contextlib.AsyncExitStack
 */
export class AsyncDisposableStack {
  private stack: AsyncDisposeFn[] = [];
  private disposed = false;

  /**
   * Enter a resource into the stack
   * The resource's Symbol.asyncDispose will be called during cleanup
   * @param resource Resource implementing AsyncDisposable
   * @returns The resource (for convenient chaining)
   */
  async enter<T extends AsyncDisposable>(resource: T): Promise<T> {
    if (this.disposed) {
      throw new Error('Cannot enter resource on disposed stack');
    }

    this.stack.push(() => resource[Symbol.asyncDispose]());
    return resource;
  }

  /**
   * Add a callback function to be called during cleanup
   * @param callback Async function to call during disposal
   */
  pushCallback(callback: AsyncDisposeFn): void {
    if (this.disposed) {
      throw new Error('Cannot push callback on disposed stack');
    }

    this.stack.push(callback);
  }

  /**
   * Execute a callback and add its cleanup function to the stack
   * @param callback Function returning a cleanup function
   * @returns Result of the callback
   */
  async enterContext<T>(callback: () => Promise<[T, AsyncDisposeFn]>): Promise<T> {
    if (this.disposed) {
      throw new Error('Cannot enter context on disposed stack');
    }

    const [resource, cleanup] = await callback();
    this.stack.push(cleanup);
    return resource;
  }

  /**
   * Dispose all resources in reverse order (LIFO)
   * Continues disposing even if some resources throw errors
   * Collects all errors and throws them at the end
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const errors: Error[] = [];

    // Dispose in reverse order (LIFO)
    while (this.stack.length > 0) {
      const cleanup = this.stack.pop();
      if (cleanup) {
        try {
          await cleanup();
        } catch (error) {
          if (error instanceof Error) {
            errors.push(error);
          } else {
            errors.push(new Error(String(error)));
          }
        }
      }
    }

    // If there were errors, throw them
    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} errors occurred during disposal`);
    }
  }

  /**
   * Implement Symbol.asyncDispose for use with 'await using'
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  /**
   * Check if the stack has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get the number of resources in the stack
   */
  get size(): number {
    return this.stack.length;
  }
}

/**
 * Create a new AsyncDisposableStack and execute a function with it
 * Automatically disposes the stack when the function completes
 * @param fn Function to execute with the stack
 * @returns Result of the function
 */
export async function withAsyncStack<T>(fn: (stack: AsyncDisposableStack) => Promise<T>): Promise<T> {
  const stack = new AsyncDisposableStack();
  try {
    return await fn(stack);
  } finally {
    await stack.dispose();
  }
}

/**
 * Wrap a resource creation function with automatic disposal
 * @param create Function that creates and returns a resource with cleanup
 * @returns Wrapped function that returns an AsyncDisposable
 */
export function makeAsyncDisposable<T>(create: () => Promise<[T, AsyncDisposeFn]>): () => Promise<T & AsyncDisposable> {
  return async () => {
    const [resource, cleanup] = await create();
    return Object.assign(resource as object, {
      [Symbol.asyncDispose]: cleanup,
    }) as T & AsyncDisposable;
  };
}
