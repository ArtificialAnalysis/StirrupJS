/**
 * Calculator tool - simple example tool
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../core/models.js';
import { ToolUseCountMetadata } from '../core/models.js';

/**
 * Parameters for calculator tool
 */
export const CalculatorParamsSchema = z.object({
  expression: z.string().describe('Mathematical expression to evaluate (e.g., "2 + 2 * 3")'),
});

export type CalculatorParams = z.infer<typeof CalculatorParamsSchema>;

/**
 * Simple calculator tool
 * Evaluates mathematical expressions safely
 */
export const CALCULATOR_TOOL: Tool<typeof CalculatorParamsSchema, ToolUseCountMetadata> = {
  name: 'calculator',
  description: 'Evaluate a mathematical expression',
  parameters: CalculatorParamsSchema,
  executor: async (params): Promise<ToolResult<ToolUseCountMetadata>> => {
    try {
      // Create a safe evaluation environment
      // Only allow basic math operations
      const sanitized = params.expression.replace(/[^0-9+\-*/().\s]/g, '');

      if (sanitized !== params.expression) {
        throw new Error('Expression contains invalid characters');
      }

      // Use Function constructor for safe evaluation
      const result = new Function(`'use strict'; return (${sanitized})`)();

      return {
        content: `Result: ${result}`,
        metadata: new ToolUseCountMetadata(1),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: `Error evaluating expression: ${errorMsg}`,
        metadata: new ToolUseCountMetadata(1),
      };
    }
  },
};
