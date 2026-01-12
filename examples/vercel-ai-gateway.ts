/**
 * Vercel AI SDK Integration Example
 *
 * This example demonstrates using the Vercel AI SDK with Stirrup
 * using the AI Gateway for multi-provider support.
 *
 * To run this example:
 *   1. Set up AI Gateway credentials
 *   2. Run: npx tsx examples/vercel-ai-gateway.ts
 */

import { VercelAIClient } from '../src/clients/vercel-ai-gateway-client.js';
import { Agent, CALCULATOR_TOOL, DEFAULT_TOOLS, SIMPLE_FINISH_TOOL } from '../src/index.js';
import { loadEnv } from './_helpers.js';

// Load environment variables from .env file
loadEnv();

async function main() {
  // 1. Use AI Gateway with string model identifier
  const model = 'anthropic/claude-sonnet-4-5';

  // 2. Wrap the model with VercelAIClient for Stirrup compatibility
  const client = new VercelAIClient({
    model,
    modelSlug: 'claude-sonnet-4-5',
    maxTokens: 200_000, // Claude's context window
    maxTokensToGenerate: 4096,
    temperature: 0.7,
  });

  // 3. Create Agent with tools
  const agent = new Agent({
    client,
    name: 'vercel-ai-assistant',
    maxTurns: 30,
    tools: [...DEFAULT_TOOLS, CALCULATOR_TOOL],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt: 'You are a helpful assistant. Use tools to complete tasks effectively.',
  });

  // 4. Use session to handle tool lifecycle
  await using session = agent.session({
    // Optional: Configure logging level
    // loggerOptions: { level: 'debug' }
  });

  // 5. Run the agent with a task
  console.log(`Running agent with Vercel AI SDK (${model})...\n`);
  const result = await session.run(
    'What is 15 * 23? Calculate it using the calculator tool and then finish with the result.'
  );

  console.log('\nAgent completed!');
  console.log('Result:', result.finishParams?.reason);
}

// Run the example
main().catch(console.error);
