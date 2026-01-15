/**
 * User input tool - allows the agent to ask the human running the session for clarification.
 *
 * This is intended for interactive CLI runs. It will prompt on stdin/stdout.
 * There should only EVER be one question per tool call.
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../core/models.js';
import { ToolUseCountMetadata } from '../core/models.js';

export const UserInputParamsSchema = z
  .object({
    question: z.string().min(1).describe('A single question to ask the user (*not* multiple questions)'),
    questionType: z
      .enum(['text', 'choice', 'confirm'])
      .default('text')
      .describe("Type of question: 'text' for free-form, 'choice' for multiple choice, 'confirm' for yes/no"),
    choices: z.array(z.string()).optional().describe("List of valid choices (required when questionType is 'choice')"),
    default: z.string().default('').describe('Default value if user presses Enter without input'),
  })
  .superRefine((val, ctx) => {
    if (val.questionType === 'choice') {
      if (!val.choices || val.choices.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['choices'],
          message: "choices is required when questionType is 'choice'",
        });
      }
    }
  });

export type UserInputParams = z.infer<typeof UserInputParamsSchema>;

function normalizeYesNo(input: string): 'yes' | 'no' | null {
  const s = input.trim().toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(s)) return 'yes';
  if (['n', 'no', 'false', '0'].includes(s)) return 'no';
  return null;
}

async function promptLine(prompt: string): Promise<string> {
  const { createInterface } = await import('node:readline/promises');
  const { stdin, stdout } = await import('node:process');

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

export const USER_INPUT_TOOL: Tool<typeof UserInputParamsSchema, ToolUseCountMetadata> = {
  name: 'user_input',
  description:
    "Ask the user a single question when you need clarification or are uncertain. Supports 'text' (free-form), " +
    "'choice' (pick from a list of choices), and 'confirm' (yes/no). Returns the user's response. " +
    'There should only EVER be one question per call to this tool. If you need multiple questions, call this tool multiple times.',
  parameters: UserInputParamsSchema,
  executor: async (params): Promise<ToolResult<ToolUseCountMetadata>> => {
    // Separate prompt from any prior output (e.g. structured logs)
    process.stdout.write('\n');

    const question = params.question.trim();

    if (params.questionType === 'confirm') {
      const defaultNormalized = params.default ? normalizeYesNo(params.default) : null;
      const suffix = defaultNormalized ? ` [default: ${defaultNormalized}]` : '';

      let val: 'yes' | 'no' | null = null;
      do {
        const raw = await promptLine(`${question}${suffix} (y/n): `);
        val = raw.trim() === '' && defaultNormalized ? defaultNormalized : normalizeYesNo(raw);
        if (!val) {
          process.stdout.write("Please answer 'y'/'n' (or 'yes'/'no').\n");
        }
      } while (!val);

      return { content: val, metadata: new ToolUseCountMetadata(1) };
    }

    if (params.questionType === 'choice' && params.choices && params.choices.length > 0) {
      const choices = params.choices;
      process.stdout.write(`Choices: ${choices.join(', ')}\n`);

      let val: string | null = null;
      do {
        const raw = await promptLine(`${question}${params.default ? ` [default: ${params.default}]` : ''}: `);
        const candidate = raw.trim() === '' ? params.default : raw.trim();
        if (choices.includes(candidate)) {
          val = candidate;
        } else {
          process.stdout.write(`Please choose one of: ${choices.join(', ')}\n`);
        }
      } while (val === null);

      return { content: val, metadata: new ToolUseCountMetadata(1) };
    }

    // Free-form text (default)
    {
      const raw = await promptLine(`${question}${params.default ? ` [default: ${params.default}]` : ''}: `);
      const val = raw.trim() === '' ? params.default : raw;
      return { content: val, metadata: new ToolUseCountMetadata(1) };
    }
  },
};
