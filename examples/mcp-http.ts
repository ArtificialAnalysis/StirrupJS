/**
 * MCP HTTP Transport Example
 *
 * This example shows how to connect to a remote MCP server over HTTP
 * using Streamable HTTP transport (also works with type "url").
 *
 * To run this example:
 *   1. Create a .env file with:
 *        OPENROUTER_API_KEY=your-key-here
 *        SUPABASE_PROJECT_REF=your-project-ref
 *        SUPABASE_TOKEN=your-supabase-token
 *   2. Run: npx tsx examples/mcp-http.ts
 *
 * Configuration format:
 *
 *   Using type "http" or "url" (both use StreamableHTTPClientTransport):
 *   {
 *     "mcpServers": {
 *       "my-server": {
 *         "type": "http",
 *         "config": {
 *           "url": "https://example.com/mcp",
 *           "headers": { "Authorization": "Bearer ..." }
 *         }
 *       }
 *     }
 *   }
 *
 *   You can also use type "sse" for legacy SSE-based MCP servers.
 */

import { ChatCompletionsClient } from '../src/clients/openai-client.js';
import {
  Agent,
  MCPToolProvider,
  SIMPLE_FINISH_TOOL,
  type AgentRunResult,
  type FinishParams,
  type McpConfig,
} from '../src/index.js';
import { getApiConfig, loadEnv } from './_helpers.js';

loadEnv();

async function main() {
  const { apiKey, baseURL, model } = getApiConfig();

  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const supabaseToken = process.env.SUPABASE_TOKEN;

  if (!projectRef || !supabaseToken) {
    console.error('Error: Set SUPABASE_PROJECT_REF and SUPABASE_TOKEN in .env file');
    process.exit(1);
  }

  const client = new ChatCompletionsClient({
    model,
    apiKey,
    baseURL,
    maxTokens: 100_000,
  });

  // Option 1: Inline config object with HTTP transport
  const mcpConfig: McpConfig = {
    mcpServers: {
      // Example: Supabase MCP server over HTTP
      supabase: {
        type: 'url',
        config: {
          url: `https://mcp.supabase.com/mcp?project_ref=${projectRef}&read_only=true`,
          headers: {
            Authorization: `Bearer ${supabaseToken}`,
          },
        },
      },
      // You can also mix transport types:
      // local: {
      //   type: 'stdio',
      //   config: {
      //     command: 'npx',
      //     args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      //   },
      // },
    },
  };

  const mcpProvider = MCPToolProvider.fromConfigObject(mcpConfig);

  // Option 2: Load from a JSON config file
  // const mcpProvider = await MCPToolProvider.fromConfig('./mcp-servers.json');

  // Option 3: Connect to only specific servers from the config
  // const mcpProvider = MCPToolProvider.fromConfigObject(mcpConfig, ['supabase']);

  const agent = new Agent({
    client,
    name: 'mcp-http-agent',
    maxTurns: 10,
    tools: [mcpProvider],
    finishTool: SIMPLE_FINISH_TOOL,
    systemPrompt: 'You are a helpful assistant with access to remote MCP tools.',
  });

  await using session = agent.session();

  const result: AgentRunResult<FinishParams> = await session.run(
    'How many models in the models table?'
  );
  console.log(result);
}

main().catch(console.error);
