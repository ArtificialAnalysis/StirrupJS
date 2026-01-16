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
import { Agent, DEFAULT_TOOLS, SIMPLE_FINISH_TOOL } from '../src/index.js';
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

  // 2. Create an agent with tools
  const agent = new Agent({
    client,
    name: 'assistant',
    maxTurns: 10,
    tools: [...DEFAULT_TOOLS],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt: `You are a helpful assistant. Use tools to complete tasks effectively.

CRITICAL: When calling the finish tool after creating files, you MUST pass paths as a JSON array, not a string.
Correct format: {"reason": "Created chart", "paths": ["tokyo_population.png"]}
WRONG format: {"reason": "Created chart", "paths": "tokyo_population.png"} <-- This will fail!

The paths parameter must always be an array of strings, even if there's only one file.`,
  });

  // 3. Use session to configure output directory (files will be auto-saved on cleanup)
  // Structured logging is enabled by default with debug level
  await using session = agent.session({
    outputDir: './output',
  });

  // 4. Run the agent with a task
  await session.run('Create a spreadsheet of the population of Tokyo for the next 5 years');
}

// Run the example
main().catch(console.error);
