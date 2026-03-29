/**
 * Tests for ToolResult success field and finish tool validation (Python PRs #5, #14)
 */

import { describe, it, expect } from 'vitest';
import type { ToolResult } from '../../src/core/models.js';

describe('ToolResult success field', () => {
  it('should allow ToolResult with success: true', () => {
    const result: ToolResult = { content: 'done', success: true };
    expect(result.success).toBe(true);
  });

  it('should allow ToolResult with success: false', () => {
    const result: ToolResult = { content: 'failed', success: false };
    expect(result.success).toBe(false);
  });

  it('should allow ToolResult without success (backwards compatible)', () => {
    const result: ToolResult = { content: 'done' };
    expect(result.success).toBeUndefined();
  });

  it('should allow ToolResult with metadata and success', () => {
    const result: ToolResult<{ count: number }> = {
      content: 'done',
      metadata: { count: 5 },
      success: true,
    };
    expect(result.success).toBe(true);
    expect(result.metadata?.count).toBe(5);
  });
});
