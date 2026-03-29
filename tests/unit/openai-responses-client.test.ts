/**
 * Tests for OpenResponsesClient (Python PR #15)
 */

import { describe, it, expect } from 'vitest';

describe('OpenResponsesClient', () => {
  it('should be importable', async () => {
    const mod = await import('../../src/clients/openai-responses-client.js');
    expect(mod.OpenResponsesClient).toBeDefined();
  });

  it('should throw without API key', async () => {
    const origKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const { OpenResponsesClient } = await import('../../src/clients/openai-responses-client.js');
      expect(() => new OpenResponsesClient({ model: 'gpt-4o' })).toThrow('API key is required');
    } finally {
      if (origKey) process.env.OPENAI_API_KEY = origKey;
    }
  });

  it('should create client with API key', async () => {
    const { OpenResponsesClient } = await import('../../src/clients/openai-responses-client.js');
    const client = new OpenResponsesClient({
      model: 'gpt-4o',
      apiKey: 'test-key-123',
    });
    expect(client.modelSlug).toBe('gpt-4o');
    expect(client.maxTokens).toBe(128_000);
  });

  it('should support custom maxTokens', async () => {
    const { OpenResponsesClient } = await import('../../src/clients/openai-responses-client.js');
    const client = new OpenResponsesClient({
      model: 'o3-mini',
      apiKey: 'test-key',
      maxTokens: 200_000,
    });
    expect(client.maxTokens).toBe(200_000);
  });

  it('should implement LLMClient interface', async () => {
    const { OpenResponsesClient } = await import('../../src/clients/openai-responses-client.js');
    const client = new OpenResponsesClient({
      model: 'gpt-4o',
      apiKey: 'test-key',
    });
    expect(typeof client.generate).toBe('function');
    expect(typeof client.modelSlug).toBe('string');
    expect(typeof client.maxTokens).toBe('number');
  });
});
