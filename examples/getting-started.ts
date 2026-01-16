/**
 * Getting Started with Stirrup
 *
 * This example demonstrates the basics of creating and running an agent
 * with the Stirrup framework.
 *
 * To run this example:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/getting-started.ts
 */

import { ChatCompletionsClient } from '../src/clients/openai-client.js';
import {
  Agent,
  CALCULATOR_TOOL,
  DEFAULT_TOOLS,
  SIMPLE_FINISH_TOOL,
  type AgentRunResult,
  type FinishParams,
} from '../src/index.js';
import { getApiConfig, loadEnv } from './_helpers.js';

// Load environment variables from .env file
loadEnv();

async function main() {
  // 1. Create an LLM client (uses Claude Sonnet 4.5 via OpenRouter)
  const { apiKey, baseURL, model } = getApiConfig();

  const client = new ChatCompletionsClient({
    model,
    apiKey,
    baseURL,
    maxTokens: 100_000,
  });

  // 2. Create Agent with tools
  const agent = new Agent({
    client,
    name: 'assistant',
    maxTurns: 10,
    tools: [...DEFAULT_TOOLS, CALCULATOR_TOOL],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt: 'You are a helpful assistant. Use tools to complete tasks effectively.',
  });

  // 3. Use session to handle tool lifecycle and file outputs
  // Structured logging is enabled by default with 'info' level
  await using session = agent.session({
    // Optional: Configure logging
    // loggerOptions: { level: 'debug' }
  });

  // 4. Run the agent with a task
  const result: AgentRunResult<FinishParams> = await session.run(
    'What is 2 + 2? Calculate it using the calculator tool and then finish.'
  );
  console.log(result);
}

// Run the example
main().catch(console.error);
