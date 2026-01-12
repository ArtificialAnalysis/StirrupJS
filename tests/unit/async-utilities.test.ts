/**
 * Unit tests for async utilities (simplified)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AsyncContext,
} from '../../src/utils/context.js';
import {
  AsyncDisposableStack,
} from '../../src/utils/async-stack.js';

describe('AsyncContext', () => {
  let context: AsyncContext<string>;

  beforeEach(() => {
    context = new AsyncContext<string>();
  });

  it('should return undefined when no value is set', () => {
    expect(context.get()).toBeUndefined();
  });

  it('should return default value when no value is set', () => {
    expect(context.get('default')).toBe('default');
  });

  it('should set and get value with run', () => {
    const result = context.run('test-value', () => {
      return context.get();
    });

    expect(result).toBe('test-value');
  });

  it('should set and get value asynchronously', async () => {
    const result = await context.runAsync('async-value', async () => {
      return context.get();
    });

    expect(result).toBe('async-value');
  });

  it('should isolate contexts in nested runs', () => {
    const result = context.run('outer', () => {
      const outer = context.get();

      const inner = context.run('inner', () => {
        return context.get();
      });

      return { outer, inner, afterInner: context.get() };
    });

    expect(result.outer).toBe('outer');
    expect(result.inner).toBe('inner');
    expect(result.afterInner).toBe('outer');
  });

  it('should check if context has value', () => {
    expect(context.has()).toBe(false);

    context.run('value', () => {
      expect(context.has()).toBe(true);
    });

    expect(context.has()).toBe(false);
  });
});

describe('AsyncDisposableStack', () => {
  it('should dispose callback in order', async () => {
    const disposed: number[] = [];
    const stack = new AsyncDisposableStack();

    stack.pushCallback(async () => {
      disposed.push(1);
    });
    stack.pushCallback(async () => {
      disposed.push(2);
    });

    await stack.dispose();

    expect(disposed).toEqual([2, 1]);
  });

  it('should support Symbol.asyncDispose', async () => {
    const disposed: boolean[] = [];
    const stack = new AsyncDisposableStack();

    stack.pushCallback(async () => {
      disposed.push(true);
    });

    await stack[Symbol.asyncDispose]();

    expect(disposed).toEqual([true]);
  });

  it('should handle empty stack', async () => {
    const stack = new AsyncDisposableStack();
    await expect(stack.dispose()).resolves.not.toThrow();
  });
});
