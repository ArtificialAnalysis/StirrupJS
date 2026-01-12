/**
 * Custom Tool Example
 *
 * This example shows how to create custom tools and use them with an agent.
 *
 * To run this example:
 *   1. Create a .env file with: OPENROUTER_API_KEY=your-key-here
 *   2. Run: npx tsx examples/custom-tool.ts
 */

import { z } from 'zod';
import { ChatCompletionsClient } from '../src/clients/openai-client.js';
import { Agent, SIMPLE_FINISH_TOOL, ToolUseCountMetadata, type AgentRunResult, type FinishParams, type Tool, type ToolResult } from '../src/index.js';
import { getApiConfig, loadEnv } from './_helpers.js';

// Load environment variables
loadEnv();

// Define parameter schema for your tool
const WeatherParamsSchema = z.object({
  location: z.string().describe('City name or location'),
  unit: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature unit'),
});

type WeatherParams = z.infer<typeof WeatherParamsSchema>;

// Create a custom tool
const weatherTool: Tool<typeof WeatherParamsSchema, ToolUseCountMetadata> = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: WeatherParamsSchema,
  executor: async (params: WeatherParams): Promise<ToolResult<ToolUseCountMetadata>> => {
    // Simulate API call
    const temp = params.unit === 'celsius' ? 22 : 72;
    const condition = 'Sunny';

    return {
      content: `Weather in ${params.location}: ${temp}°${params.unit === 'celsius' ? 'C' : 'F'}, ${condition}`,
      metadata: new ToolUseCountMetadata(1),
    };
  },
};

// Create a custom database tool
const DbQueryParamsSchema = z.object({
  query: z.string().describe('SQL query to execute'),
});

const databaseTool: Tool<typeof DbQueryParamsSchema, ToolUseCountMetadata> = {
  name: 'db_query',
  description: 'Execute a SQL query against the database',
  parameters: DbQueryParamsSchema,
  executor: async (params) => {
    // Simulate database query
    console.log(`Executing query: ${params.query}`);

    // Mock results
    const results = [
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25 },
    ];

    return {
      content: `Query results (${results.length} rows):\n${JSON.stringify(results, null, 2)}`,
      metadata: new ToolUseCountMetadata(1),
    };
  },
};

async function main() {
  // Create client (uses Claude Sonnet 4.5 via OpenRouter)
  const { apiKey, baseURL, model } = getApiConfig();
  const client = new ChatCompletionsClient({
    model,
    apiKey,
    baseURL,
    maxTokens: 100_000,
  });

  // Create agent with custom tools
  const agent = new Agent({
    client,
    name: 'weather-assistant',
    maxTurns: 5,
    tools: [weatherTool, databaseTool], // Use our custom tools
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt: 'You are a helpful assistant with access to weather data and a database.',
  });

  // Use session to handle tool lifecycle
  // Structured logging is enabled by default with debug level
  await using session = agent.session();

  // Run the agent
  const result: AgentRunResult<FinishParams> = await session.run(
    'What is the weather in London? Also, query the database for all users.'
  );
}

main().catch(console.error);
