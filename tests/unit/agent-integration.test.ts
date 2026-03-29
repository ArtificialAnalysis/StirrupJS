/**
 * Integration tests for Agent features:
 * - Finish tool success check (PR #5)
 * - Speed metrics (PR #26)
 * - Block successive assistant messages (PR #27)
 * - Session enforcement (PR #32)
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type {
  ChatMessage,
  AssistantMessage,
  Tool,
  LLMClient,
} from '../../src/core/models.js';
import { Agent, type SpeedStats } from '../../src/core/agent.js';
import { SIMPLE_FINISH_TOOL, type FinishParams } from '../../src/tools/finish.js';

/**
 * Create a mock LLM client that returns predefined responses
 */
function createMockClient(responses: AssistantMessage[]): LLMClient {
  let callIndex = 0;
  return {
    modelSlug: 'mock-model',
    maxTokens: 128_000,
    generate: async (): Promise<AssistantMessage> => {
      if (callIndex >= responses.length) {
        return {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            {
              name: 'finish',
              arguments: JSON.stringify({ reason: 'auto-finish', paths: [] }),
              toolCallId: `call_auto_${callIndex}`,
            },
          ],
          tokenUsage: { input: 100, output: 50 },
        };
      }
      return responses[callIndex++];
    },
  };
}

// ── Finish Tool Success Check ────────────────────────────────────────────────

describe('Finish tool success check', () => {
  it('should complete when finish tool returns success: true', async () => {
    const client = createMockClient([
      {
        role: 'assistant',
        content: 'Completing task',
        toolCalls: [
          {
            name: 'finish',
            arguments: JSON.stringify({ reason: 'Task done', paths: [] }),
            toolCallId: 'call_1',
          },
        ],
        tokenUsage: { input: 100, output: 50 },
      },
    ]);

    const agent = new Agent({
      client,
      name: 'test-agent',
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [],
    });
    agent.session({ noLogger: true });

    const result = await agent.run('Do something');
    await agent[Symbol.asyncDispose]();

    expect(result.finishParams).toBeDefined();
    expect((result.finishParams as FinishParams).reason).toBe('Task done');
  });

  it('should complete within max turns', async () => {
    let callCount = 0;
    const client: LLMClient = {
      modelSlug: 'mock',
      maxTokens: 128_000,
      generate: async (): Promise<AssistantMessage> => {
        callCount++;
        return {
          role: 'assistant',
          content: `Working... step ${callCount}`,
          toolCalls: [
            {
              name: 'finish',
              arguments: JSON.stringify({ reason: `step ${callCount}`, paths: [] }),
              toolCallId: `call_${callCount}`,
            },
          ],
          tokenUsage: { input: 50, output: 20 },
        };
      },
    };

    const agent = new Agent({
      client,
      name: 'turns-test',
      maxTurns: 3,
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [],
    });
    agent.session({ noLogger: true });

    const result = await agent.run('Multi-step task');
    await agent[Symbol.asyncDispose]();

    expect(result.finishParams).toBeDefined();
    expect(callCount).toBe(1);
  });
});

// ── Speed Metrics ────────────────────────────────────────────────────────────

describe('Speed metrics in agent run', () => {
  it('should include speedStats in result', async () => {
    const client = createMockClient([
      {
        role: 'assistant',
        content: 'Done',
        toolCalls: [
          {
            name: 'finish',
            arguments: JSON.stringify({ reason: 'Quick task', paths: [] }),
            toolCallId: 'call_1',
          },
        ],
        tokenUsage: { input: 100, output: 50 },
      },
    ]);

    const agent = new Agent({
      client,
      name: 'speed-test',
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [],
    });
    agent.session({ noLogger: true });

    const result = await agent.run('Test speed');
    await agent[Symbol.asyncDispose]();

    expect(result.speedStats).toBeDefined();
    expect(result.speedStats!.modelSlug).toBe('mock-model');
    expect(result.speedStats!.generationCount).toBe(1);
    expect(result.speedStats!.totalGenerationMs).toBeGreaterThanOrEqual(0);
    expect(result.speedStats!.totalOutputTokens).toBe(50);
  });

  it('should track tool execution time in speedStats', async () => {
    const slowTool: Tool<z.ZodObject<{ input: z.ZodString }>> = {
      name: 'slow_tool',
      description: 'A slow tool for testing',
      parameters: z.object({ input: z.string() }),
      executor: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { content: 'done' };
      },
    };

    let callCount = 0;
    const client: LLMClient = {
      modelSlug: 'mock',
      maxTokens: 128_000,
      generate: async (): Promise<AssistantMessage> => {
        callCount++;
        if (callCount === 1) {
          return {
            role: 'assistant',
            content: 'Using tool',
            toolCalls: [
              {
                name: 'slow_tool',
                arguments: JSON.stringify({ input: 'test' }),
                toolCallId: 'call_1',
              },
            ],
            tokenUsage: { input: 50, output: 30 },
          };
        }
        return {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            {
              name: 'finish',
              arguments: JSON.stringify({ reason: 'done', paths: [] }),
              toolCallId: 'call_2',
            },
          ],
          tokenUsage: { input: 100, output: 50 },
        };
      },
    };

    const agent = new Agent({
      client,
      name: 'tool-speed-test',
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [slowTool],
    });
    agent.session({ noLogger: true });

    const result = await agent.run('Use the slow tool');
    await agent[Symbol.asyncDispose]();

    expect(result.speedStats).toBeDefined();
    expect(result.speedStats!.totalToolMs).toBeGreaterThanOrEqual(40);
    expect(result.speedStats!.toolBreakdown['slow_tool']).toBeGreaterThanOrEqual(40);
    expect(result.speedStats!.generationCount).toBe(2);
    expect(result.speedStats!.totalOutputTokens).toBe(80);
  });

  it('should emit run:complete with speedStats', async () => {
    const client = createMockClient([
      {
        role: 'assistant',
        content: 'Done',
        toolCalls: [
          {
            name: 'finish',
            arguments: JSON.stringify({ reason: 'done', paths: [] }),
            toolCallId: 'call_1',
          },
        ],
        tokenUsage: { input: 100, output: 50 },
      },
    ]);

    const agent = new Agent({
      client,
      name: 'events-test',
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [],
    });
    agent.session({ noLogger: true });

    let receivedSpeedStats: SpeedStats | undefined;
    agent.on('run:complete', (data) => {
      receivedSpeedStats = data.speedStats;
    });

    await agent.run('Test events');
    await agent[Symbol.asyncDispose]();

    expect(receivedSpeedStats).toBeDefined();
    expect(receivedSpeedStats!.modelSlug).toBe('mock-model');
  });
});

// ── Block Successive Assistant Messages ──────────────────────────────────────

describe('blockSuccessiveAssistantMessages', () => {
  it('should inject continuation prompt when assistant has no tool calls', async () => {
    let generateCallCount = 0;
    const messagesReceived: ChatMessage[][] = [];

    const client: LLMClient = {
      modelSlug: 'mock',
      maxTokens: 128_000,
      generate: async (messages: ChatMessage[]): Promise<AssistantMessage> => {
        messagesReceived.push([...messages]);
        generateCallCount++;

        if (generateCallCount === 1) {
          return {
            role: 'assistant',
            content: 'Let me think about this...',
            tokenUsage: { input: 50, output: 20 },
          };
        }
        return {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            {
              name: 'finish',
              arguments: JSON.stringify({ reason: 'completed', paths: [] }),
              toolCallId: 'call_2',
            },
          ],
          tokenUsage: { input: 100, output: 50 },
        };
      },
    };

    const agent = new Agent({
      client,
      name: 'block-test',
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [],
      blockSuccessiveAssistantMessages: true,
    });
    agent.session({ noLogger: true });

    const result = await agent.run('Test task');
    await agent[Symbol.asyncDispose]();

    expect(generateCallCount).toBe(2);
    expect(result.finishParams).toBeDefined();

    const secondCallMessages = messagesReceived[1];
    const lastUserMsg = secondCallMessages
      .filter((m) => m.role === 'user')
      .pop();
    expect(lastUserMsg?.content).toContain('Please continue the task');
  });

  it('should NOT inject continuation when assistant has tool calls', async () => {
    let callCount = 0;

    const client: LLMClient = {
      modelSlug: 'mock',
      maxTokens: 128_000,
      generate: async (): Promise<AssistantMessage> => {
        callCount++;
        return {
          role: 'assistant',
          content: 'Using tool',
          toolCalls: [
            {
              name: 'finish',
              arguments: JSON.stringify({ reason: 'done', paths: [] }),
              toolCallId: 'call_1',
            },
          ],
          tokenUsage: { input: 50, output: 20 },
        };
      },
    };

    const agent = new Agent({
      client,
      name: 'no-inject-test',
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [],
      blockSuccessiveAssistantMessages: true,
    });
    agent.session({ noLogger: true });

    await agent.run('Test');
    await agent[Symbol.asyncDispose]();

    expect(callCount).toBe(1);
  });
});

// ── Session Enforcement ──────────────────────────────────────────────────────

describe('Session enforcement', () => {
  it('should auto-call session when ToolProviders exist and session not called', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockToolProvider = {
      async [Symbol.asyncDispose]() {},
      async getTools() {
        return [
          {
            name: 'mock_tool',
            description: 'A mock tool',
            parameters: null,
            executor: async () => ({ content: 'ok' }),
          },
        ];
      },
    };

    const client = createMockClient([
      {
        role: 'assistant',
        content: 'Done',
        toolCalls: [
          {
            name: 'finish',
            arguments: JSON.stringify({ reason: 'done', paths: [] }),
            toolCallId: 'call_1',
          },
        ],
        tokenUsage: { input: 100, output: 50 },
      },
    ]);

    const agent = new Agent({
      client,
      name: 'session-test',
      finishTool: SIMPLE_FINISH_TOOL,
      tools: [mockToolProvider],
    });

    const result = await agent.run('Test');
    await agent[Symbol.asyncDispose]();

    expect(result.finishParams).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('session() was not called')
    );

    warnSpy.mockRestore();
  });
});
