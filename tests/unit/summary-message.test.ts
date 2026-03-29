/**
 * Tests for SummaryMessage marker type (Python PR #31)
 */

import { describe, it, expect } from 'vitest';
import type { UserMessage, SystemMessage, AssistantMessage } from '../../src/core/models.js';
import {
  SUMMARY_MESSAGE_MARKER,
  isSummaryMessage,
  createSummaryMessage,
} from '../../src/core/models.js';

describe('SummaryMessage', () => {
  it('should create a SummaryMessage with marker', () => {
    const msg = createSummaryMessage('This is a summary');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('This is a summary');
    expect(msg[SUMMARY_MESSAGE_MARKER]).toBe(true);
  });

  it('should detect SummaryMessage with isSummaryMessage', () => {
    const summary = createSummaryMessage('Summary text');
    expect(isSummaryMessage(summary)).toBe(true);
  });

  it('should not detect regular UserMessage as SummaryMessage', () => {
    const regular: UserMessage = { role: 'user', content: 'Hello' };
    expect(isSummaryMessage(regular)).toBe(false);
  });

  it('should not detect other message types as SummaryMessage', () => {
    const system: SystemMessage = { role: 'system', content: 'System' };
    const assistant: AssistantMessage = { role: 'assistant', content: 'Response' };
    expect(isSummaryMessage(system)).toBe(false);
    expect(isSummaryMessage(assistant)).toBe(false);
  });

  it('should not include marker in JSON serialization', () => {
    const msg = createSummaryMessage('Summary');
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ role: 'user', content: 'Summary' });
    expect(SUMMARY_MESSAGE_MARKER.toString() in parsed).toBe(false);
  });
});
