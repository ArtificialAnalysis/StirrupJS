# StirrupJS

StirrupJS is a lightweight TypeScript/JavaScript framework for building AI agents. It differs from other agent frameworks by:

- **Working with the model, not against it:** StirrupJS gets out of the way and lets the model choose its own approach to completing tasks (similar to Claude Code). Many frameworks impose rigid workflows that can degrade results.
- **Best practices and tools built-in:** We analyzed the leading agents (Claude Code, Codex, and others) to understand and incorporate best practices relating to topics like context management and foundational tools (e.g., code execution).
- **Fully customizable:** Use StirrupJS as a package or as a starting template to build your own fully customized agents.

## Features

- **Essential tools built-in:**
    - Online search / web browsing
    - Code execution (local, Docker container, E2B sandbox)
    - Document input and output
- **Skills system:** Extend agents with modular, domain-specific instruction packages
- **Flexible tool execution:** A generic `Tool` interface allows easy tool definition and extension
- **Context management:** Automatically summarizes conversation history when approaching context limits
- **Flexible provider support:** Works with OpenAI-compatible APIs (OpenRouter, Together AI, OpenAI, etc.)
- **Session management:** Automatic file handling and tool lifecycle management
- **Event-driven architecture:** Monitor agent progress with EventEmitter

## Installation

```bash
npm install stirrupjs
# or
yarn add stirrupjs
# or
pnpm add stirrupjs
```

## Quick Start

```typescript
import { Agent, SIMPLE_FINISH_TOOL, DEFAULT_TOOLS } from 'stirrupjs';
import { ChatCompletionsClient } from 'stirrupjs/clients';

// Create an LLM client (uses OpenAI-compatible API)
const client = new ChatCompletionsClient({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
});

// Create an agent with tools
const agent = new Agent({
  client,
  name: 'assistant',
  maxTurns: 10,
  tools: DEFAULT_TOOLS,
  finishTool: SIMPLE_FINISH_TOOL,
});

// Use session to handle tool lifecycle and file outputs
await using session = agent.session();

// Run the agent
const result = await session.run('What is 2 + 2?');
console.log(result.finishParams?.reason);
```

!!! note "Environment Variables"
    This example uses OpenRouter. Set `OPENROUTER_API_KEY` in your environment before running.

    Web search requires a `BRAVE_API_KEY`. The agent will still work without it, but web search will be unavailable.

## How It Works

- **`Agent`** - Configures and runs the agent loop until a finish tool is called or max turns reached
- **`session()`** - Sets up tools, manages files, and handles cleanup using `await using` (explicit resource management)
- **`Tool`** - Define tools with Zod schema validation
- **`ToolProvider`** - Manage tools that require lifecycle (connections, temp directories, etc.)
- **`DEFAULT_TOOLS`** - Standard tools included by default: code execution and web tools

## Using Other LLM Providers

For non-OpenAI providers, change the base URL of the `ChatCompletionsClient`:

### OpenRouter (Recommended)

```typescript
const client = new ChatCompletionsClient({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
});
```

### Together AI

```typescript
const client = new ChatCompletionsClient({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: 'https://api.together.xyz/v1',
  model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
});
```

### OpenAI

```typescript
const client = new ChatCompletionsClient({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-5.2',
});
```

## Default Tools

When you create an `Agent` without specifying tools, it uses `DEFAULT_TOOLS`:

| Tool Provider | Tools Provided | Description |
|--------------|----------------|-------------|
| `LocalCodeExecToolProvider` | `code_exec` | Execute shell commands in an isolated temp directory. Use `uv` to manage packages. |
| `WebToolProvider` | `web_fetch`, `web_search` | Fetch web pages and search (search requires `BRAVE_API_KEY`) |

## Extending with Pre-Built Tools

```typescript
import { Agent, SIMPLE_FINISH_TOOL, CALCULATOR_TOOL } from 'stirrupjs';
import { WebToolProvider } from 'stirrupjs/tools';

const agent = new Agent({
  client,
  tools: [
    new WebToolProvider(),
    CALCULATOR_TOOL,
  ],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

## Defining Custom Tools

```typescript
import { z } from 'zod';
import type { Tool, ToolResult } from 'stirrupjs';
import { ToolUseCountMetadata } from 'stirrupjs';

// Define parameter schema
const WeatherParamsSchema = z.object({
  location: z.string().describe('City name or location'),
  unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
});

// Create tool
const weatherTool: Tool<typeof WeatherParamsSchema, ToolUseCountMetadata> = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: WeatherParamsSchema,
  executor: async (params) => {
    const temp = params.unit === 'celsius' ? 22 : 72;
    return {
      content: `Weather in ${params.location}: ${temp}°${params.unit === 'celsius' ? 'C' : 'F'}`,
      metadata: new ToolUseCountMetadata(1),
    };
  },
};
```

## Full Customization

For deep customization of the framework internals, you can clone and modify StirrupJS locally:

```bash
# Clone the repository
git clone https://github.com/ArtificialAnalysis/stirrup-js.git
cd stirrup-js

# Install dependencies
npm install

# Build the project
npm run build
```

See the [Full Customization guide](extending/full-customization.md) for more details.

## Next Steps

- [Getting Started](getting-started.md) - Installation and first agent tutorial
- [Core Concepts](concepts.md) - Understand Agent, Tools, and Sessions
- [Examples](examples.md) - Working examples for common patterns
- [Creating Tools](guides/tools.md) - Build your own tools
- [Skills](guides/skills.md) - Extend agents with domain-specific expertise
