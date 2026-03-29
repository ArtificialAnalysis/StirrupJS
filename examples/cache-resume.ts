/**
 * Agent Run Cache & Resume Example
 *
 * Demonstrates how interrupted agent runs are cached and can be resumed.
 * On first run with maxTurns=2, the agent won't finish - its state is cached.
 * On second run with resume=true, it picks up where it left off.
 *
 * To run this example:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/cache-resume.ts
 */

import { ChatCompletionsClient } from '../src/clients/openai-client.js';
import {
  Agent,
  DEFAULT_TOOLS,
  SIMPLE_FINISH_TOOL,
  CacheManager,
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

  const task = 'List 3 interesting facts about the moon. Think step by step.';

  // --- First run: limited turns, will likely not finish ---
  console.log('=== First run (maxTurns=2, will likely be interrupted) ===\n');

  const agent1 = new Agent({
    client,
    name: 'cache-demo',
    maxTurns: 2,
    tools: DEFAULT_TOOLS,
    finishTool: SIMPLE_FINISH_TOOL,
  });

  await using session1 = agent1.session({
    outputDir: './output/cache_example',
    noLogger: true,
  });

  const result1: AgentRunResult<FinishParams> = await session1.run(task);

  if (result1.finishParams) {
    console.log('Completed on first run:', result1.finishParams.reason);
  } else {
    console.log('Run interrupted (max turns reached). State cached automatically.');
  }

  // Check cache status
  const cacheManager = new CacheManager([{ role: 'user', content: task }]);
  const hasCached = await cacheManager.hasCachedState();
  console.log(`Cache exists: ${hasCached}`);
  console.log(`Cache dir: ${cacheManager.getCacheDir()}\n`);

  // --- Second run: resume from cache ---
  console.log('=== Second run (resume=true) ===\n');

  const agent2 = new Agent({
    client,
    name: 'cache-demo',
    maxTurns: 10,
    tools: DEFAULT_TOOLS,
    finishTool: SIMPLE_FINISH_TOOL,
  });

  await using session2 = agent2.session({
    outputDir: './output/cache_example',
    resume: true,
    noLogger: true,
  });

  const result2: AgentRunResult<FinishParams> = await session2.run(task);

  if (result2.finishParams) {
    console.log('Completed:', result2.finishParams.reason);
  } else {
    console.log('Still not finished after resume.');
  }

  console.log('\nSpeed stats:', {
    model: result2.speedStats?.modelSlug,
    otps: result2.speedStats?.totalGenerationMs
      ? (result2.speedStats.totalOutputTokens / (result2.speedStats.totalGenerationMs / 1000)).toFixed(1)
      : 'N/A',
    generations: result2.speedStats?.generationCount,
  });
}

main().catch(console.error);
