/**
 * Skills Example
 *
 * Demonstrates loading skills from the local `skills/` directory, uploading them to the
 * execution environment, and letting the agent read `skills/<skill>/SKILL.md` to guide work.
 *
 * To run:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/skills/skills-example.ts
 */

import { ChatCompletionsClient } from '../../src/clients/openai-client.js';
import { Agent, DEFAULT_TOOLS, SIMPLE_FINISH_TOOL } from '../../src/index.js';
import { getApiConfig, loadEnv } from '../_helpers.js';

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
    name: 'skills-agent',
    maxTurns: 20,
    tools: DEFAULT_TOOLS,
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt:
      'You are a helpful assistant. Use code_exec to run shell commands. Use skills when available by reading their SKILL.md.',
  });

  await using session = agent.session({
    inputFiles: ['examples/skills/sample_data.csv'],
    outputDir: 'output/skills_example',
    skillsDir: 'skills',
  });

  await session.run(
    [
      'Use the data_analysis skill.',
      'Read the input CSV at examples/skills/sample_data.csv.',
      'Install any needed Python deps inside the execution environment.',
      'Do a full analysis and create at least one chart image file.',
      'Finish with a short summary and include output file paths in finish params.',
    ].join('\n')
  );
}

main().catch(console.error);


