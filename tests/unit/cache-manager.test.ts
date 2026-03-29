/**
 * Tests for CacheManager (Python PR #10)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatMessage } from '../../src/core/models.js';
import { CacheManager, type CachedRunState } from '../../src/core/cache.js';

describe('CacheManager', () => {
  const testMessages: ChatMessage[] = [
    { role: 'user', content: 'Create a chart showing sales data' },
  ];

  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager(testMessages);
  });

  afterEach(async () => {
    await cacheManager.clearState();
  });

  it('should compute deterministic cache key', () => {
    const key1 = CacheManager.computeKey(testMessages);
    const key2 = CacheManager.computeKey(testMessages);
    expect(key1).toBe(key2);
  });

  it('should compute different keys for different messages', () => {
    const key1 = CacheManager.computeKey(testMessages);
    const key2 = CacheManager.computeKey([
      { role: 'user', content: 'Different task' },
    ]);
    expect(key1).not.toBe(key2);
  });

  it('should report no cached state initially', async () => {
    expect(await cacheManager.hasCachedState()).toBe(false);
  });

  it('should save and load state', async () => {
    const state: CachedRunState = {
      messages: testMessages,
      messageHistory: [],
      runMetadata: { token_usage: [] },
      turn: 5,
      timestamp: Date.now(),
      files: {},
    };

    await cacheManager.saveState(state);
    expect(await cacheManager.hasCachedState()).toBe(true);

    const loaded = await cacheManager.loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.turn).toBe(5);
    expect(loaded!.messages).toEqual(testMessages);
  });

  it('should clear state', async () => {
    const state: CachedRunState = {
      messages: testMessages,
      messageHistory: [],
      runMetadata: {},
      turn: 0,
      timestamp: Date.now(),
      files: {},
    };

    await cacheManager.saveState(state);
    expect(await cacheManager.hasCachedState()).toBe(true);

    await cacheManager.clearState();
    expect(await cacheManager.hasCachedState()).toBe(false);
  });

  it('should return null for non-existent state', async () => {
    const loaded = await cacheManager.loadState();
    expect(loaded).toBeNull();
  });

  it('should produce cache key of expected length', () => {
    const key = CacheManager.computeKey(testMessages);
    expect(key.length).toBe(16);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
});
