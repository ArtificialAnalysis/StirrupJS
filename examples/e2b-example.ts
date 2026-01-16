import 'dotenv/config';
import { Agent, E2BCodeExecToolProvider } from '../src/index.js';
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
  });

  await using session = agent.session({ outputDir: './output' });

  const result = await session.run(
    'Generate the first 50 numbers of the Fibonacci sequence and create ' +
      'a line chart showing the growth. Save the chart as fibonacci.png'
  );

  console.log('Result:', result.finishParams);
}

main().catch(console.error);
