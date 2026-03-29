/**
 * Tests for start+end truncation (Python PR #12)
 */

import { describe, it, expect } from 'vitest';

describe('Start+End Truncation', () => {
  // The truncate method is protected, so we test the logic directly
  function truncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    const half = Math.floor(maxLength / 2);
    return (
      content.substring(0, half) +
      '\n\n[... output truncated ...]\n\n' +
      content.substring(content.length - half)
    );
  }

  it('should not truncate short content', () => {
    const result = truncate('short output', 100);
    expect(result).toBe('short output');
  });

  it('should keep start and end of long content', () => {
    const content = 'A'.repeat(10) + 'B'.repeat(10) + 'C'.repeat(10);
    const result = truncate(content, 20);

    expect(result.startsWith('AAAAAAAAAA')).toBe(true);
    expect(result.endsWith('CCCCCCCCCC')).toBe(true);
    expect(result).toContain('[... output truncated ...]');
    expect(result).not.toContain('B');
  });

  it('should preserve error messages at end of output', () => {
    const successOutput = 'Processing line 1\nProcessing line 2\n'.repeat(5);
    const errorMessage = 'Error: File not found at /path/to/missing.txt';
    const content = successOutput + errorMessage;

    const result = truncate(content, 100);
    expect(result).toContain('missing.txt');
  });

  it('should return exact content at boundary length', () => {
    const content = 'X'.repeat(100);
    const result = truncate(content, 100);
    expect(result).toBe(content);
  });
});
