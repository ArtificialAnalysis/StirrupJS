/**
 * Tests for SpeedStats type and OTPS calculation (Python PR #26)
 */

import { describe, it, expect } from 'vitest';
import type { SpeedStats } from '../../src/core/agent.js';

describe('SpeedStats', () => {
  it('should have correct structure', () => {
    const stats: SpeedStats = {
      totalGenerationMs: 5000,
      totalOutputTokens: 1000,
      totalToolMs: 2000,
      toolBreakdown: { code_exec: 1500, web_fetch: 500 },
      generationCount: 3,
      modelSlug: 'gpt-4o',
    };

    expect(stats.totalGenerationMs).toBe(5000);
    expect(stats.totalOutputTokens).toBe(1000);
    expect(stats.totalToolMs).toBe(2000);
    expect(stats.generationCount).toBe(3);
    expect(stats.modelSlug).toBe('gpt-4o');
    expect(stats.toolBreakdown.code_exec).toBe(1500);
  });

  it('should calculate OTPS correctly', () => {
    const stats: SpeedStats = {
      totalGenerationMs: 2000,
      totalOutputTokens: 100,
      totalToolMs: 0,
      toolBreakdown: {},
      generationCount: 1,
      modelSlug: 'test',
    };

    const otps = stats.totalOutputTokens / (stats.totalGenerationMs / 1000);
    expect(otps).toBe(50);
  });

  it('should handle zero generation time gracefully', () => {
    const stats: SpeedStats = {
      totalGenerationMs: 0,
      totalOutputTokens: 50,
      totalToolMs: 0,
      toolBreakdown: {},
      generationCount: 1,
      modelSlug: 'fast-model',
    };

    const otps = stats.totalGenerationMs > 0
      ? stats.totalOutputTokens / (stats.totalGenerationMs / 1000)
      : Infinity;
    expect(otps).toBe(Infinity);
  });
});
