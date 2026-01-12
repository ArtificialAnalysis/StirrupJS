/**
 * Sub-agent support - convert agents to tools
 */

import { z } from 'zod';
import type { ChatMessage } from './models.js';

/**
 * Parameters for sub-agent execution
 */
export const SubAgentParamsSchema = z.object({
  task: z.string().describe('Task for the sub-agent to complete'),
  inputFiles: z.array(z.string()).default([]).describe('Input files to provide to sub-agent'),
});

export type SubAgentParams = z.infer<typeof SubAgentParamsSchema>;

/**
 * Metadata returned from sub-agent execution
 * Contains full message history and run metadata
 */
export class SubAgentMetadata {
  constructor(
    public messageHistory: ChatMessage[][],
    public runMetadata: Record<string, unknown>
  ) {}

  add(other: SubAgentMetadata): SubAgentMetadata {
    return new SubAgentMetadata(
      [...this.messageHistory, ...other.messageHistory],
      this.mergeMetadata(this.runMetadata, other.runMetadata)
    );
  }

  toJSON() {
    return {
      message_history: this.messageHistory,
      run_metadata: this.runMetadata,
    };
  }

  private mergeMetadata(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...a };

    for (const [key, value] of Object.entries(b)) {
      if (key in merged) {
        // If both have the key, merge arrays or overwrite
        if (Array.isArray(merged[key]) && Array.isArray(value)) {
          merged[key] = [...(merged[key] as unknown[]), ...value];
        } else {
          merged[key] = value;
        }
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }
}
