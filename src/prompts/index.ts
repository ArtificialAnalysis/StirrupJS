/**
 * System prompts and templates for the Stirrup framework
 */

export const BASE_SYSTEM_PROMPT = `You are an AI agent with access to tools to help complete tasks.

You should:
- Use tools when they would help accomplish the task
- Think step by step and explain your reasoning
- Call the finish tool when the task is complete

Available tools will be provided to you. Use them wisely to accomplish your goals.`;

export const MESSAGE_SUMMARIZER_PROMPT = `You are summarizing a conversation between a user and an AI assistant.

Your task is to create a concise summary that preserves the key information:
- The original task or goal
- Important findings or results
- Current progress and state
- Any critical context needed to continue

Keep the summary focused and relevant. Omit unnecessary details.`;

export const MESSAGE_SUMMARIZER_BRIDGE_TEMPLATE = (summary: string) =>
  `[Previous conversation summarized below]

${summary}

[Resuming conversation]`;
