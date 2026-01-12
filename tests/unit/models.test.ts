/**
 * Unit tests for core models
 */

import { describe, it, expect } from 'vitest';
import {
  TokenUsageMetadata,
  ToolUseCountMetadata,
  aggregateMetadata,
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
  ContentSchema,
  ImageContentBlockSchema,
  VideoContentBlockSchema,
  AudioContentBlockSchema,
} from '../../src/core/models.js';

describe('TokenUsageMetadata', () => {
  it('should create metadata with default values', () => {
    const metadata = new TokenUsageMetadata();
    expect(metadata.input).toBe(0);
    expect(metadata.output).toBe(0);
    expect(metadata.reasoning).toBe(0);
  });

  it('should create metadata with custom values', () => {
    const metadata = new TokenUsageMetadata(100, 50, 25);
    expect(metadata.input).toBe(100);
    expect(metadata.output).toBe(50);
    expect(metadata.reasoning).toBe(25);
  });

  it('should add two metadata objects', () => {
    const m1 = new TokenUsageMetadata(100, 50, 25);
    const m2 = new TokenUsageMetadata(200, 75, 10);
    const result = m1.add(m2);

    expect(result.input).toBe(300);
    expect(result.output).toBe(125);
    expect(result.reasoning).toBe(35);
  });

  it('should calculate total tokens', () => {
    const metadata = new TokenUsageMetadata(100, 50, 25);
    expect(metadata.total).toBe(175);
  });

  it('should serialize to JSON', () => {
    const metadata = new TokenUsageMetadata(100, 50, 25);
    const json = metadata.toJSON();

    expect(json).toEqual({
      input: 100,
      output: 50,
      reasoning: 25,
      total: 175,
    });
  });

  it('should create from TokenUsage object', () => {
    const tokenUsage = { input: 100, output: 50, reasoning: 25 };
    const metadata = TokenUsageMetadata.fromTokenUsage(tokenUsage);

    expect(metadata.input).toBe(100);
    expect(metadata.output).toBe(50);
    expect(metadata.reasoning).toBe(25);
  });
});

describe('ToolUseCountMetadata', () => {
  it('should create metadata with count', () => {
    const metadata = new ToolUseCountMetadata(5);
    expect(metadata.numUses).toBe(5);
  });

  it('should add two metadata objects', () => {
    const m1 = new ToolUseCountMetadata(3);
    const m2 = new ToolUseCountMetadata(7);
    const result = m1.add(m2);

    expect(result.numUses).toBe(10);
  });

  it('should serialize to JSON', () => {
    const metadata = new ToolUseCountMetadata(5);
    const json = metadata.toJSON();

    expect(json).toEqual({ num_uses: 5 });
  });
});

describe('aggregateMetadata', () => {
  it('should aggregate empty metadata', () => {
    const result = aggregateMetadata({});
    expect(result).toEqual({});
  });

  it('should aggregate token usage', () => {
    const metadata = {
      token_usage: [
        new TokenUsageMetadata(100, 50, 25),
        new TokenUsageMetadata(200, 75, 10),
      ],
    };

    const result = aggregateMetadata(metadata);
    // Result is the metadata object itself, not just JSON
    expect(result.token_usage).toBeInstanceOf(TokenUsageMetadata);
    expect((result.token_usage as TokenUsageMetadata).input).toBe(300);
    expect((result.token_usage as TokenUsageMetadata).output).toBe(125);
    expect((result.token_usage as TokenUsageMetadata).reasoning).toBe(35);
  });

  it('should aggregate tool counts', () => {
    const metadata = {
      code_exec: [
        new ToolUseCountMetadata(3),
        new ToolUseCountMetadata(2),
      ],
    };

    const result = aggregateMetadata(metadata);
    expect(result.code_exec).toBeInstanceOf(ToolUseCountMetadata);
    expect((result.code_exec as ToolUseCountMetadata).numUses).toBe(5);
  });

  it('should aggregate mixed metadata', () => {
    const metadata = {
      token_usage: [
        new TokenUsageMetadata(100, 50),
        new TokenUsageMetadata(200, 75),
      ],
      code_exec: [
        new ToolUseCountMetadata(2),
        new ToolUseCountMetadata(1),
      ],
    };

    const result = aggregateMetadata(metadata);
    expect(result.token_usage).toBeInstanceOf(TokenUsageMetadata);
    expect((result.token_usage as TokenUsageMetadata).input).toBe(300);
    expect((result.token_usage as TokenUsageMetadata).output).toBe(125);
    expect(result.code_exec).toBeInstanceOf(ToolUseCountMetadata);
    expect((result.code_exec as ToolUseCountMetadata).numUses).toBe(3);
  });

  it('should handle non-addable metadata', () => {
    const metadata = {
      custom: [{ value: 1 }, { value: 2 }],
    };

    const result = aggregateMetadata(metadata);
    // Non-addable metadata is returned as an array
    expect(result.custom).toEqual([{ value: 1 }, { value: 2 }]);
  });
});

describe('Content Schemas', () => {
  it('should validate string content', () => {
    const result = ContentSchema.parse('Hello, world!');
    expect(result).toBe('Hello, world!');
  });

  it('should validate image content block', () => {
    const block = {
      type: 'image',
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };

    const result = ImageContentBlockSchema.parse(block);
    expect(result.type).toBe('image');
    expect(result.data).toContain('data:image/png;base64,');
  });

  it('should validate video content block', () => {
    const block = {
      type: 'video',
      data: 'data:video/mp4;base64,AAAAIGZ0eXBpc29t',
    };

    const result = VideoContentBlockSchema.parse(block);
    expect(result.type).toBe('video');
    expect(result.data).toContain('data:video/mp4;base64,');
  });

  it('should validate audio content block', () => {
    const block = {
      type: 'audio',
      data: 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAAD',
    };

    const result = AudioContentBlockSchema.parse(block);
    expect(result.type).toBe('audio');
    expect(result.data).toContain('data:audio/mp3;base64,');
  });

  it('should validate array content', () => {
    const content = [
      'Text message',
      { type: 'image', data: 'data:image/png;base64,ABC' },
      'More text',
    ];

    const result = ContentSchema.parse(content);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Text message');
    expect(result[1]).toEqual({ type: 'image', data: 'data:image/png;base64,ABC' });
  });
});

describe('Message Schemas', () => {
  it('should validate system message', () => {
    const message = {
      role: 'system',
      content: 'You are a helpful assistant',
    };

    const result = SystemMessageSchema.parse(message);
    expect(result.role).toBe('system');
    expect(result.content).toBe('You are a helpful assistant');
  });

  it('should validate user message with string content', () => {
    const message = {
      role: 'user',
      content: 'Hello!',
    };

    const result = UserMessageSchema.parse(message);
    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello!');
  });

  it('should validate user message with multimodal content', () => {
    const message = {
      role: 'user',
      content: [
        'Check this image:',
        { type: 'image', data: 'data:image/png;base64,ABC' },
      ],
    };

    const result = UserMessageSchema.parse(message);
    expect(result.role).toBe('user');
    expect(Array.isArray(result.content)).toBe(true);
  });

  it('should validate assistant message', () => {
    const message = {
      role: 'assistant',
      content: 'Here is my response',
      toolCalls: [
        {
          name: 'calculator',
          arguments: '{"expression":"2+2"}',
          toolCallId: 'call_123',
        },
      ],
      tokenUsage: {
        input: 100,
        output: 50,
        reasoning: 0,
      },
    };

    const result = AssistantMessageSchema.parse(message);
    expect(result.role).toBe('assistant');
    expect(result.content).toBe('Here is my response');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe('calculator');
    expect(result.tokenUsage).toEqual({
      input: 100,
      output: 50,
      reasoning: 0,
    });
  });

  it('should validate tool message', () => {
    const message = {
      role: 'tool',
      content: 'Result: 4',
      toolCallId: 'call_123',
      name: 'calculator',
      argsWasValid: true,
    };

    const result = ToolMessageSchema.parse(message);
    expect(result.role).toBe('tool');
    expect(result.content).toBe('Result: 4');
    expect(result.toolCallId).toBe('call_123');
    expect(result.name).toBe('calculator');
    expect(result.argsWasValid).toBe(true);
  });

  it('should reject invalid message role', () => {
    const message = {
      role: 'invalid',
      content: 'test',
    };

    expect(() => SystemMessageSchema.parse(message)).toThrow();
  });
});
