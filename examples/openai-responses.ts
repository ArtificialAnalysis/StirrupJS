/**
 * OpenAI Responses API Example
 *
 * This example demonstrates using the OpenResponsesClient with the
 * newer OpenAI Responses API (POST /v1/responses), which supports
 * o-series models with reasoning effort control.
 *
 * Works with both OpenAI directly and OpenRouter.
 *
 * To run this example:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/openai-responses.ts
 */

import { OpenResponsesClient } from '../src/clients/open-responses-client.js';
import {
  Agent,
  DEFAULT_TOOLS,
  SIMPLE_FINISH_TOOL,
  type AgentRunResult,
  type FinishParams,
} from '../src/index.js';
import { getApiConfig, loadEnv } from './_helpers.js';

loadEnv();

async function main() {
  const { apiKey, baseURL, model } = getApiConfig();

  // Create client using the Responses API
  const client = new OpenResponsesClient({
    model,
    apiKey,
    baseURL,
    // For o-series models, you can set reasoning effort:
    // reasoningEffort: 'medium',
  });

  const agent = new Agent({
    client,
    name: 'responses-agent',
    maxTurns: 10,
    tools: DEFAULT_TOOLS,
    finishTool: SIMPLE_FINISH_TOOL,
  });

  await using session = agent.session({
    outputDir: './output/responses_example',
  });

  const result: AgentRunResult<FinishParams> = await session.run(
    'What is the capital of France? Answer briefly and finish.'
  );

  console.log('\nResult:', result.finishParams?.reason);
  console.log('Speed:', {
    otps: result.speedStats?.totalGenerationMs
      ? (result.speedStats.totalOutputTokens / (result.speedStats.totalGenerationMs / 1000)).toFixed(1)
      : 'N/A',
    generationTime: `${((result.speedStats?.totalGenerationMs ?? 0) / 1000).toFixed(1)}s`,
  });
}

main().catch(console.error);
