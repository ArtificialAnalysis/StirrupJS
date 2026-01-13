# Getting Started

This guide walks you through installing StirrupJS and creating your first agent.

## Prerequisites

- Node.js 18 or higher
- TypeScript 5.0 or higher (for TypeScript projects)
- An API key from your LLM provider (OpenRouter, OpenAI, Together AI, etc.)

## Installation

Install via npm, yarn, or pnpm:

```bash
npm install @stirrup/stirrup
```

```bash
yarn add @stirrup/stirrup
```

```bash
pnpm add @stirrup/stirrup
```

## Your First Agent

Create a simple agent that can search the web and execute code:

```typescript
import { Agent, SIMPLE_FINISH_TOOL, DEFAULT_TOOLS, createStructuredLogger } from '@stirrup/stirrup';
import { ChatCompletionsClient } from '@stirrup/stirrup/clients/openai';

// Create an LLM client
const client = new ChatCompletionsClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
  maxTokens: 100_000,
});

// Create an agent
const agent = new Agent({
  client,
  name: 'assistant',
  maxTurns: 10,
  tools: DEFAULT_TOOLS,
  finishTool: SIMPLE_FINISH_TOOL,
});

// Optional: Enable structured logging
const cleanup = createStructuredLogger(agent, { level: 'debug' });

// Use session for automatic file handling
await using session = agent.session();

// Run the agent
const result = await session.run('What is 2 + 2?');

console.log('Result:', result.finishParams?.reason);

cleanup();
```

!!! note "Environment Variables"
    This example uses OpenRouter. Set `OPENROUTER_API_KEY` in your environment before running.

    Web search requires a `BRAVE_API_KEY`. The agent will still work without it, but web search will be unavailable.

## Tools

By default, agents include code execution and web tools:

| Tool | Description |
|------|-------------|
| `code_exec` | Execute shell commands in an isolated temp directory. Use `uv` to manage packages. |
| `web_fetch` | Fetch and parse web pages |
| `web_search` | Search the web (requires `BRAVE_API_KEY`) |

Extend with additional tools:

```typescript
import { Agent, SIMPLE_FINISH_TOOL, CALCULATOR_TOOL, WebToolProvider } from '@stirrup/stirrup';

const agent = new Agent({
  client,
  tools: [
    new WebToolProvider(),
    CALCULATOR_TOOL,
  ],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

→ See [Tools](concepts.md#tools) for full documentation on DEFAULT_TOOLS, custom tools, sub-agents, and tool providers.

## Choosing a Client

StirrupJS ships with support for OpenAI-Compatible APIs.

### OpenAI-Compatible APIs

Use `ChatCompletionsClient` to use OpenAI models or OpenAI-compatible APIs:

```typescript
// OpenRouter (recommended for accessing multiple models)
const client = new ChatCompletionsClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
});

// Together AI
const client = new ChatCompletionsClient({
  apiKey: process.env.TOGETHER_API_KEY!,
  baseURL: 'https://api.together.xyz/v1',
  model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
});

// OpenAI
const client = new ChatCompletionsClient({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-5.2',
});
```

→ See [Client](concepts.md#client) for parameter tables and creating custom clients.

## Understanding the Output

The `run()` method returns an `AgentRunResult`:

```typescript
import type { AgentRunResult, FinishParams } from '@stirrup/stirrup';

const result: AgentRunResult<FinishParams> = await session.run("Your task");

// result contains:
// - finishParams: Agent's final response (reason, paths)
// - messageHistory: Conversation message history
// - runMetadata: Aggregated tool metadata
```

**Result structure:**

- **`finishParams`**: Agent's final response with `reason` (string) and `paths` (string[])
- **`messageHistory`**: Full conversation grouped by summarization events
- **`runMetadata`**: Tool usage statistics (e.g., `{ code_exec: { numUses: 3 } }`)

→ See [Understanding Agent Output](concepts.md#understanding-agent-output) for details.

## Uploading Input Files

Provide files to the agent's execution environment:

```typescript
await using session = agent.session({
  inputFiles: ['data.csv', 'config.json'],
  outputDir: './output',
});

await session.run('Analyze the data');
```

!!! warning "Input Files - Coming Soon"
    File upload functionality is currently under development. The `inputFiles` parameter is reserved for future use.

## Saving Output Files

Save files created by the agent by providing an output directory:

```typescript
await using session = agent.session({ outputDir: './results' });

const result = await session.run('Create a chart');

// Files in result.finishParams.paths are automatically saved to ./results/
```

The session automatically:
1. Detects files listed in `finishParams.paths`
2. Copies them from the execution environment to `outputDir`
3. Reports saved files on cleanup

→ See [Receiving Output Files](concepts.md#receiving-output-files-from-the-agent) for details.

## Using Explicit Resource Management

StirrupJS uses the `await using` syntax for automatic cleanup:

```typescript
// Automatic cleanup when scope exits
await using session = agent.session();
await session.run('task');
// Session automatically disposed here
```

For manual control:

```typescript
const session = agent.session();
try {
  await session.run('task');
} finally {
  await session[Symbol.asyncDispose]();
}
```

## Next Steps

- [Core Concepts](concepts.md) - Deep dive into Agent, Session, Client, Tools, and Logging
- [Examples](examples.md) - Working examples for common patterns
- [Creating Tools](guides/tools.md) - Build your own tools
- [Code Execution](guides/code-execution.md) - Different execution backends
