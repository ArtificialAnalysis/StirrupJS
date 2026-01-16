/**
 * E2B Example
 * Demonstrates how to use the E2BCodeExecToolProvider to execute code in a sandboxed environment
 *
 * To run this example:
 *   1. Create a .env file with: E2B_API_KEY=your-key-here
 *   2. Run: npx tsx examples/e2b-example.ts
 */
import 'dotenv/config';
import { Agent, E2BCodeExecToolProvider, SIMPLE_FINISH_TOOL } from '../src/index.js';
import { ChatCompletionsClient } from '../src/clients/openai-client.js';

async function main() {
  const client = new ChatCompletionsClient({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-opus-4.5',
    maxTokens: 100_000,
  });

  const codeExec = new E2BCodeExecToolProvider({ apiKey: process.env.E2B_API_KEY!, template: 'code-interpreter-v1' });

  const agent = new Agent({
    client,
    name: 'agent',
    maxTurns: 15,
    tools: [codeExec],
    finishTool: SIMPLE_FINISH_TOOL,
  });

  await using session = agent.session({ outputDir: './output' });

  const result = await session.run(
    'Generate the first 50 numbers of the Fibonacci sequence and create ' +
      'a line chart showing the growth. Save the chart as fibonacci.png'
  );
}

main().catch(console.error);
