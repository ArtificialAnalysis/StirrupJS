/**
 * Sub-Agent Example
 *
 * This example demonstrates how to use agents as tools (sub-agents) to delegate
 * specialized tasks. The main agent can delegate to specialized sub-agents.
 *
 * To run this example:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/sub-agent.ts
 */

import { ChatCompletionsClient } from '../src/clients/openai-client.js';
import {
  Agent,
  CALCULATOR_TOOL,
  E2BCodeExecToolProvider,
  SIMPLE_FINISH_TOOL,
  type AgentRunResult,
  type FinishParams,
} from '../src/index.js';
import { WebToolProvider } from '../src/tools/web/provider.js';
import { getApiConfig, loadEnv } from './_helpers.js';

// Load environment variables
loadEnv();

async function main() {
  // Create client (uses Claude Sonnet 4.5 via OpenRouter)
  const { apiKey, baseURL, model } = getApiConfig();
  const client = new ChatCompletionsClient({
    model,
    apiKey,
    baseURL,
    maxTokens: 100_000,
  });

  const codeExec = new E2BCodeExecToolProvider({ apiKey: process.env.E2B_API_KEY!, template: 'code-interpreter-v1' });

  // Create specialized sub-agents

  // 1. Research Agent - specialized in web research
  const researchAgent = new Agent({
    client,
    name: 'researcher',
    maxTurns: 5,
    tools: [new WebToolProvider(180_000, process.env.BRAVE_API_KEY)],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt:
      'You are a research specialist. Use web search to find accurate information. Return all relevant information in the finish tool.',
  });

  // 2. Calculator Agent - specialized in math
  const mathAgent = new Agent({
    client,
    name: 'mathematician',
    maxTurns: 3,
    tools: [CALCULATOR_TOOL],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt:
      'You are a math specialist. Calculate precisely using the calculator tool. Return all relevant information in the finish tool.',
  });

  // 3. Main Coordinator Agent - delegates to sub-agents
  const coordinatorAgent = new Agent({
    client,
    name: 'coordinator',
    maxTurns: 10,
    tools: [
      // Convert sub-agents to tools
      researchAgent.toTool('Delegate research tasks to the research specialist'),
      mathAgent.toTool('Delegate math calculations to the math specialist'),
      codeExec,
    ],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt: `You are a task coordinator. Delegate tasks to specialized sub-agents:
- Use 'researcher' for web search and research tasks
- Use 'mathematician' for calculations and math problems

    Break down complex tasks and delegate appropriately.`,
  });

  // Use session to configure output directory for any files created
  // Structured logging is enabled by default with debug level
  await using session = coordinatorAgent.session();

  // Run a complex task that requires both research and calculation
  const result: AgentRunResult<FinishParams> = await session.run(
    `I need to know:
    1. What is the current population of Tokyo?
    2. If the population grows by 2% annually, what will it be in 5 years?

    Use the research agent to find the population, then use the math agent to calculate the future population. Then create an image of a chart of this forecast`
  );

  // Cleanup sub-agents
  await researchAgent[Symbol.asyncDispose]();
  await mathAgent[Symbol.asyncDispose]();
}

main().catch(console.error);
