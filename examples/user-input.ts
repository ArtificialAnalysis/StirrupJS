/**
 * User Input Tool Example
 *
 * Demonstrates adding the USER_INPUT_TOOL so the agent can ask the human for clarification.
 *
 * To run this example:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/user-input.ts
 */

import { ChatCompletionsClient } from '../src/clients/openai-client.js';
import {
  Agent,
  DEFAULT_TOOLS,
  SIMPLE_FINISH_TOOL,
  USER_INPUT_TOOL,
  type AgentRunResult,
  type FinishParams,
} from '../src/index.js';
import { getApiConfig, loadEnv } from './_helpers.js';

loadEnv();

async function main() {
  const { apiKey, baseURL, model } = getApiConfig();

  const client = new ChatCompletionsClient({
    model,
    apiKey,
    baseURL,
    maxTokens: 100_000,
  });

  const agent = new Agent({
    client,
    name: 'assistant',
    maxTurns: 15,
    tools: [...DEFAULT_TOOLS, USER_INPUT_TOOL],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt:
      'If the task depends on unknown personal details (like the user’s home country), ask via user_input instead of guessing.',
  });

  await using session = agent.session({
    // Optional: set debug to see tool args/results in logs
    // loggerOptions: { level: 'debug' },
  });

  const result: AgentRunResult<FinishParams> = await session.run(
    `
What is the population of the user's home country over the last 3 years?

- Ask the user for their home country using the user_input tool.
- Search the web to find the population per year.
- Then finish with a brief answer (no chart needed).
`.trim()
  );
}

main().catch(console.error);
