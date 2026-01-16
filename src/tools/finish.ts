/**
 * Finish tool - signals task completion
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../core/models.js';
import { ToolUseCountMetadata } from '../core/models.js';

/**
 * Parameters for the finish tool
 */
export const FinishParamsSchema = z.object({
  reason: z
    .string()
    .describe('Result of the task, including a summary of what was accomplished and the final answer (if applicable)'),
  paths: z
    .union([z.string(), z.array(z.string())])
    .default([])
    .transform((val) => {
      // Normalize to array
      let arr = Array.isArray(val) ? val : val ? [val] : [];

      // Handle case where model passes JSON-stringified array
      arr = arr.flatMap((item) => {
        if (typeof item === 'string' && item.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(item);
            return Array.isArray(parsed) ? parsed : [item];
          } catch {
            return [item];
          }
        }
        return [item];
      });

      return arr;
    })
    .describe(
      'Output file paths (can be a single string or array of strings). Example: ["output.png", "data.csv"] or "output.png"'
    ),
});

export type FinishParams = z.infer<typeof FinishParamsSchema>;

/**
 * Simple finish tool
 * Signals that the agent has completed its task
 */
export const SIMPLE_FINISH_TOOL: Tool<typeof FinishParamsSchema, ToolUseCountMetadata> = {
  name: 'finish',
  description:
    'Signal that the task is complete. You MUST include any files you created or modified in the paths parameter.',
  parameters: FinishParamsSchema,
  executor: async (params): Promise<ToolResult<ToolUseCountMetadata>> => {
    return {
      content: `Task completed: ${params.reason}`,
      metadata: new ToolUseCountMetadata(1),
    };
  },
};
