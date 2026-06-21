import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema, toOpenAITools, toAnthropicTools } from '../../src/clients/utils.js';
import type { Tool } from '../../src/core/models.js';

/**
 * Characterization tests for the bundled Zod -> JSON Schema converter.
 *
 * These pin the exact wire shape that toOpenAITools / toAnthropicTools emit so
 * the converter can be migrated across Zod major versions (the converter reads
 * Zod internals, which change between v3 and v4) without altering provider
 * output. If you intend to change the emitted schema, update these snapshots
 * deliberately.
 */

const schema = z.object({
  name: z.string().describe('The name'),
  age: z.number(),
  active: z.boolean(),
  tags: z.array(z.string()),
  nickname: z.string().optional(),
  mode: z.enum(['a', 'b']),
  count: z.number().default(5),
  kind: z.literal('widget'),
  nullableField: z.string().nullable(),
  meta: z.object({ id: z.string().describe('id') }),
});

const expectedProperties = {
  name: { description: 'The name', type: 'string' },
  age: { type: 'number' },
  active: { type: 'boolean' },
  tags: { type: 'array', items: { type: 'string' } },
  nickname: { type: 'string' },
  mode: { type: 'string', enum: ['a', 'b'] },
  count: { type: 'number' },
  kind: { type: 'string', const: 'widget' },
  nullableField: { type: 'string' },
  meta: { type: 'object', properties: { id: { description: 'id', type: 'string' } } },
};

// Optional and defaulted fields are excluded from `required`.
const expectedRequired = ['name', 'age', 'active', 'tags', 'mode', 'kind', 'nullableField', 'meta'];

function makeTools(): Map<string, Tool> {
  return new Map([
    [
      'demo',
      {
        name: 'demo',
        description: 'A demo tool',
        parameters: schema,
        executor: async () => ({ content: '' }),
      } as unknown as Tool,
    ],
  ]);
}

describe('zodToJsonSchema', () => {
  it('converts each Zod type to the expected JSON Schema shape', () => {
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: expectedProperties,
    });
  });
});

describe('toOpenAITools', () => {
  it('emits the OpenAI function-tool shape with the expected parameters', () => {
    expect(toOpenAITools(makeTools())).toEqual([
      {
        type: 'function',
        function: {
          name: 'demo',
          description: 'A demo tool',
          parameters: {
            type: 'object',
            properties: expectedProperties,
            required: expectedRequired,
          },
        },
      },
    ]);
  });
});

describe('toAnthropicTools', () => {
  it('emits the Anthropic tool shape with the expected input_schema', () => {
    expect(toAnthropicTools(makeTools())).toEqual([
      {
        name: 'demo',
        description: 'A demo tool',
        input_schema: {
          type: 'object',
          properties: expectedProperties,
          required: expectedRequired,
        },
      },
    ]);
  });
});
