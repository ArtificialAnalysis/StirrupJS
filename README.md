![stirrup-banner](https://github.com/user-attachments/assets/f38df9e4-8c92-43f4-a159-c3c7534381f1)<div align="center">
  <a href="https://stirrup.artificialanalysis.ai">
  </a>
  <h1>The lightweight foundation for building agents (TypeScript implementation)</h1>
<br>
</div>

<p align="center">
  <a href="https://www.npmjs.com/package/@stirrup/stirrup"><img src="https://img.shields.io/npm/v/@stirrup%2Fstirrup" alt="NPM version" /></a>&nbsp;<!--
  --><a href="https://github.com/ArtificialAnalysis/Stirrup/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ArtificialAnalysis/Stirrup" alt="License" /></a>&nbsp;<!--
  --><a href="https://stirrup.artificialanalysis.ai"><img src="https://img.shields.io/badge/MkDocs-4F46E5?logo=materialformkdocs&logoColor=fff" alt="MkDocs" /></a>
</p>

Stirrup is a lightweight framework, or starting point template, for building agents in TypeScript/JavaScript. It differs from other agent frameworks by:

- **Working with the model, not against it:** Stirrup gets out of the way and lets the model choose its own approach to completing tasks. Many frameworks impose rigid workflows that can degrade results.
- **Best practices and tools built-in:** We analyzed the leading agents (Claude Code, Codex, and others) to understand and incorporate best practices relating to topics like context management and foundational tools (e.g., code execution).
- **Fully customizable:** Use Stirrup as a package or as a starting template to build your own fully customized agents.

> **Note:** This is the TypeScript implementation of the [Python Stirrup framework](https://github.com/ArtificialAnalysis/Stirrup).

## Features

- 🔎 **Online search / web browsing:** Search and fetch web pages
- 🧪 **Code execution:** Run code locally, in Docker, or in an E2B sandbox
- 🔌 **MCP client support:** Connect to MCP servers and use their tools/resources
- 📄 **Document input and output:** Import files into context and produce file outputs
- 🧩 **Skills system:** Extend agents with modular, domain-specific instruction packages
- 🛠️ **Flexible tool execution:** A generic `Tool` interface allows easy tool definition and extension with Zod validation
- 👤 **Human-in-the-loop:** Includes a built-in user input tool that enables human feedback or clarification during agent execution
- 🧠 **Context management:** Automatically summarizes conversation history when approaching context limits
- 🔁 **Flexible provider support:** Pre-built support for OpenAI-compatible APIs, Anthropic, and Vercel AI SDK
- 🖼️ **Multimodal support:** Process images, video, and audio with automatic format conversion
- ✅ **Type-safe:** Built from the ground up with TypeScript



## Installation

```bash
npm install @stirrup/stirrup
# or
pnpm add @stirrup/stirrup
# or
yarn add @stirrup/stirrup
```

## Quick Start

```typescript
import { Agent, DEFAULT_TOOLS, SIMPLE_FINISH_TOOL } from '@stirrup/stirrup';
import { ChatCompletionsClient } from '@stirrup/stirrup/clients/openai';

async function main() {
  // Create client using ChatCompletionsClient
  // Automatically uses OPENROUTER_API_KEY environment variable
  const client = new ChatCompletionsClient({
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-4.5-sonnet',
  });

  // As no tools are provided, the agent will use the default tools, which consist of:
  // - Web tools (web search and web fetching, note web search requires BRAVE_API_KEY)
  // - Local code execution tool (to execute shell commands)
  const agent = new Agent({
    client, 
    name: 'agent', 
    maxTurns: 15,
    tools: DEFAULT_TOOLS,
    finishTool: SIMPLE_FINISH_TOOL,
  });

  // Run with session context - handles tool lifecycle, logging and file outputs
  // Structured logging is enabled by default
  await using session = agent.session({ outputDir: './output/getting_started_example' });
  
  const result = await session.run(
    `What is the population of Australia over the last 3 years? Search the web to find out and create a
    simple chart using python and matplotlib showing the current population per year.`
  );

  console.log("Result:", result.finishParams);
}

main().catch(console.error);
```

> **Note:** This example uses OpenRouter. Set `OPENROUTER_API_KEY` in your environment before running. Web search requires a `BRAVE_API_KEY`. The agent will still work without it, but web search will be unavailable.

## Full Customization

For using Stirrup as a foundation for your own fully customized agent, you can clone and import Stirrup locally:

```bash
# Clone the repository
git clone https://github.com/ArtificialAnalysis/StirrupJS.git
cd StirrupJS

# Install dependencies
npm install

# Build
npm run build
```

## How It Works

- **`Agent`** - Configures and runs the agent loop until a finish tool is called or max turns reached
- **`session()`** - Context manager that sets up tools, manages files, handles logging, and ensures cleanup
- **`Tool`** - Define tools with Zod parameters for full type safety
- **`ToolProvider`** - Manage tools that require lifecycle (connections, temp directories, etc.)
- **`DEFAULT_TOOLS`** - Standard tools included by default: code execution and web tools

## Using Other LLM Providers

Stirrup supports multiple providers out of the box.

### OpenAI-Compatible APIs

```typescript
import { ChatCompletionsClient } from '@stirrup/stirrup/clients/openai';

// Create client using Deepseek's OpenAI-compatible endpoint
const client = new ChatCompletionsClient({
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const agent = new Agent({ client, name: 'deepseek_agent', ... });
```

### Anthropic

```typescript
import { AnthropicClient } from '@stirrup/stirrup/clients/anthropic';

const client = new AnthropicClient({
  model: 'claude-sonnet-4-5',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const agent = new Agent({ client, name: 'claude_agent', ... });
```

### Vercel AI SDK

Stirrup integrates seamlessly with the Vercel AI SDK, giving you access to any provider supported by their ecosystem.

```typescript
import { VercelAIClient } from '@stirrup/stirrup/clients/vercel-ai';
import { anthropic } from '@ai-sdk/anthropic';

const client = new VercelAIClient({
  model: anthropic('claude-sonnet-4-5'),
});

const agent = new Agent({ client, name: 'vercel_agent', ... });
```

## Default Tools

When you use `DEFAULT_TOOLS`, you get:

| Tool Provider | Tools Provided | Description |
| ------------- | -------------- | ----------- |
| `LocalCodeExecToolProvider` | `code_exec` | Execute shell commands in an isolated temp directory |
| `WebToolProvider` | `web_fetch`, `web_search` | Fetch web pages and search (search requires `BRAVE_API_KEY`) |

## Extending with Pre-Built Tools

```typescript
import { Agent, DEFAULT_TOOLS, CALCULATOR_TOOL, SIMPLE_FINISH_TOOL } from '@stirrup/stirrup';
import { ChatCompletionsClient } from '@stirrup/stirrup/clients/openai';

// Create client
const client = new ChatCompletionsClient({ ... });

// Create agent with default tools + calculator tool
const agent = new Agent({
  client,
  name: 'web_calculator_agent',
  tools: [...DEFAULT_TOOLS, CALCULATOR_TOOL],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

## Defining Custom Tools

Stirrup uses Zod for type-safe tool definitions:

```typescript
import { z } from 'zod';
import { Agent, Tool, ToolUseCountMetadata, DEFAULT_TOOLS } from '@stirrup/stirrup';

// Define parameters schema
const GreetParamsSchema = z.object({
  name: z.string().describe('Name of the person to greet'),
  formal: z.boolean().default(false).describe('Use formal greeting'),
});

// Create the tool
const GreetTool: Tool<typeof GreetParamsSchema, ToolUseCountMetadata> = {
  name: 'greet',
  description: 'Greet someone by name',
  parameters: GreetParamsSchema,
  executor: async (params) => {
    const greeting = params.formal ? `Good day, ${params.name}.` : `Hey ${params.name}!`;
    
    return {
      content: greeting,
      metadata: new ToolUseCountMetadata(1),
    };
  },
};

// Add to agent
const agent = new Agent({
  client,
  name: 'greeting_agent',
  tools: [...DEFAULT_TOOLS, GreetTool],
  ...
});
```

## Advanced Features

### Structured Logging

Stirrup JS includes a powerful structured logging system powered by Pino. It's enabled by default when using `agent.session()`:

```typescript
// Defaults to pretty-printed debug logs
await using session = agent.session();

// Customize logging
await using session = agent.session({
  loggerOptions: {
    level: 'info',  // 'trace' | 'debug' | 'info' | 'warn' | 'error'
    pretty: false,  // Set to false for JSON output (production)
  }
});

// Disable default logger
await using session = agent.session({ noLogger: true });
```

### Event Monitoring

Monitor agent progress in real-time with typed events:

```typescript
agent.on('turn:start', ({ turn, maxTurns }) => {
  console.log(`Turn ${turn}/${maxTurns}`);
});

agent.on('tool:start', ({ name }) => {
  console.log(`Executing ${name}...`);
});
```

## Development

```bash
# Install
npm install

# Build
npm run build

# Run examples
npx tsx examples/getting-started.ts

# Test
npm test

# Type check
npm run typecheck

# Run documentation
uv run mkdocs serve
```

## License

Licensed under the [MIT LICENSE](LICENSE).
