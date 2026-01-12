# Core Concepts

This page covers the fundamental concepts of StirrupJS: Agent, Client, Tools, Sessions, and Logging.

## Agent

The `Agent` class orchestrates the agent loop: receiving user input, calling the LLM, executing tools, and returning results.

### Configuration

```typescript
import { Agent, SIMPLE_FINISH_TOOL, DEFAULT_TOOLS } from 'stirrupjs';

const agent = new Agent({
  client,              // Required: LLM client
  name: 'assistant',   // Optional: Agent name (default: 'agent')
  maxTurns: 10,        // Optional: Maximum turns (default: 25)
  tools: DEFAULT_TOOLS,           // Optional: Tools available to agent
  finishTool: SIMPLE_FINISH_TOOL, // Optional: Tool to signal completion
  systemPrompt: 'You are a helpful assistant.',  // Optional: System prompt
  contextSummarizationCutoff: 0.75,  // Optional: When to summarize (0-1)
  runSyncInThread: false,            // Optional: Run sync executors in worker threads
  textOnlyToolResponses: false,      // Optional: Convert tool responses to text
});
```

### Agent Loop

The agent loop runs until:
1. The finish tool is called
2. Maximum turns is reached
3. An error occurs
4. The operation is cancelled (via AbortController)

Each turn:
1. Send messages to LLM
2. Receive response (may include tool calls)
3. Execute tool calls
4. Add results to message history
5. Repeat

### Context Management

When the conversation approaches the context limit (default: 75%), StirrupJS automatically summarizes older messages to free up space. This uses a smaller, faster model to preserve important context while reducing token usage.

```typescript
const agent = new Agent({
  client,
  contextSummarizationCutoff: 0.8,  // Summarize at 80% of context window
});
```

## Client

The client handles communication with the LLM. StirrupJS includes `ChatCompletionsClient` for OpenAI-compatible APIs.

### ChatCompletionsClient

```typescript
import { ChatCompletionsClient } from 'stirrupjs/clients';

const client = new ChatCompletionsClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
  maxTokens: 100_000,  // Optional: Max tokens in response
});
```

**Parameters:**
- `apiKey`: API key for authentication
- `baseURL`: API endpoint URL
- `model`: Model identifier
- `maxTokens`: Maximum tokens in response (optional)

### Custom Clients

Implement the `Client` interface to use other LLM providers:

```typescript
interface Client {
  name: string;
  complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal
  ): Promise<ChatCompletionResponse>;
}
```

See [Custom Clients](extending/clients.md) for details.

## Tools

Tools extend the agent's capabilities. StirrupJS includes built-in tools and makes it easy to create custom ones.

### DEFAULT_TOOLS

By default, agents have access to:

```typescript
import { DEFAULT_TOOLS } from 'stirrupjs';

// DEFAULT_TOOLS = [
//   new LocalCodeExecToolProvider(),
//   new WebToolProvider(),
// ]
```

**LocalCodeExecToolProvider** provides:
- `code_exec`: Execute shell commands in isolated temp directory
  - Uses `uv` for Python package management
  - Returns exit code, stdout, stderr as XML

**WebToolProvider** provides:
- `web_fetch`: Fetch and parse web pages
- `web_search`: Search the web (requires `BRAVE_API_KEY`)

### Custom Tools

Define custom tools with Zod schemas:

```typescript
import { z } from 'zod';
import type { Tool, ToolResult } from 'stirrupjs';
import { ToolUseCountMetadata } from 'stirrupjs';

const WeatherParamsSchema = z.object({
  location: z.string().describe('City name'),
  unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
});

const weatherTool: Tool<typeof WeatherParamsSchema, ToolUseCountMetadata> = {
  name: 'get_weather',
  description: 'Get current weather',
  parameters: WeatherParamsSchema,
  executor: async (params) => {
    const temp = params.unit === 'celsius' ? 22 : 72;
    return {
      content: `Weather: ${temp}°${params.unit === 'celsius' ? 'C' : 'F'}`,
      metadata: new ToolUseCountMetadata(1),
    };
  },
};
```

See [Creating Tools](guides/tools.md) for detailed examples.

### Tool Providers

Tool providers manage tools with lifecycle requirements (connections, temp directories, etc.):

```typescript
import { ToolProvider } from 'stirrupjs';

class DatabaseToolProvider implements ToolProvider {
  name = 'database';
  private connection: any;

  async initialize() {
    this.connection = await connectToDatabase();
  }

  getTools() {
    return [queryTool, insertTool];
  }

  async dispose() {
    await this.connection.close();
  }
}
```

See [Tool Providers](guides/tool-providers.md) for details.

### Sub-Agents

Convert agents into tools to delegate specialized tasks:

```typescript
const researchAgent = new Agent({
  client,
  name: 'researcher',
  tools: [new WebToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
});

const coordinatorAgent = new Agent({
  client,
  name: 'coordinator',
  tools: [
    researchAgent.toTool('Delegate research tasks'),
  ],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

See [Sub-Agents](guides/sub-agents.md) for complex patterns.

## Session

Sessions manage tool lifecycle and file handling using explicit resource management (`await using`).

### Basic Usage

```typescript
await using session = agent.session();
const result = await session.run('Your task');
// Automatic cleanup when scope exits
```

### Session Configuration

```typescript
await using session = agent.session({
  outputDir: './output',      // Save output files here
  inputFiles: ['data.csv'],   // Upload input files (files, globs, or directories)
  skillsDir: 'skills',        // Upload skills + add skills list to system prompt
});
```

### Manual Disposal

For cases where `await using` isn't suitable:

```typescript
const session = agent.session();
try {
  await session.run('task');
} finally {
  await session[Symbol.asyncDispose]();
}
```

## Understanding Agent Output

The `run()` method returns an `AgentRunResult`:

```typescript
import type { AgentRunResult, FinishParams } from 'stirrupjs';

const result: AgentRunResult<FinishParams> = await session.run('task');
```

### Result Properties

**`finishParams`** - Agent's final response (if completed successfully):
```typescript
result.finishParams?.reason  // string: Summary of what was done
result.finishParams?.paths   // string[]: Output file paths
```

**`messageHistory`** - Conversation history grouped by summarization:
```typescript
result.messageHistory  // ChatMessage[][]
// Each array represents a "chunk" of conversation
// Chunks are separated by summarization events
```

**`runMetadata`** - Tool usage statistics:
```typescript
result.runMetadata  // Record<string, unknown>
// Example: { code_exec: { numUses: 3 }, web_fetch: { numUses: 1 } }
```

## Receiving Output Files from the Agent

Files created by the agent can be automatically saved by specifying an `outputDir`:

```typescript
await using session = agent.session({ outputDir: './results' });

const result = await session.run('Create a chart');

// Files in result.finishParams.paths are saved to ./results/
```

### How It Works

1. Agent creates files in its execution environment
2. Agent calls finish tool with `paths` parameter listing files
3. On session disposal, files are copied from execution environment to `outputDir`
4. Console logs saved files

### Sub-Agents and File Transfer

- **Root agent** (depth 0): Saves files to local filesystem
- **Sub-agents** (depth > 0): Transfer files to parent's execution environment

This allows sub-agents to create files that the parent agent can access.

## Passing Input Files to the Agent

```typescript
await using session = agent.session({
  inputFiles: [
    'data.csv',              // Single file
    'config/*.json',         // Glob pattern
    ['file1.txt', 'file2.txt']  // Array
  ],
});
```

## Loading Skills

Skills are modular packages that extend agent capabilities with domain-specific instructions and scripts.
Pass a skills directory to make them available:

```typescript
await using session = agent.session({
  skillsDir: 'skills',
  outputDir: './output',
});

await session.run('Analyze the data using the data_analysis skill');
```

The agent receives a list of available skills in its system prompt and can read the full instructions via:
`cat skills/<skill_name>/SKILL.md`.
See [Skills Guide](guides/skills.md) for full documentation.

## Logging and Monitoring

### Structured Logging

The easiest way to monitor agent activity:

```typescript
import { createStructuredLogger } from 'stirrupjs';

const cleanup = createStructuredLogger(agent, {
  level: 'debug',  // 'debug' shows all details, 'info' shows summary
});

await using session = agent.session();
await session.run('task');

cleanup();  // Stop logging
```

Output includes:
- Turn-by-turn progress
- Assistant messages
- Tool calls with parameters
- Sub-agent activity (indented)
- Token usage
- Final summary

### Event Listeners

For custom monitoring:

```typescript
agent.on('run:start', ({ task }) => {
  console.log('Started:', task);
});

agent.on('turn:start', ({ turn, maxTurns }) => {
  console.log(`Turn ${turn + 1}/${maxTurns}`);
});

agent.on('message:assistant', ({ content, toolCalls }) => {
  console.log('Assistant:', content);
});

agent.on('tool:complete', ({ name, success, result }) => {
  console.log(`Tool ${name}: ${success ? 'success' : 'failure'}`);
});

agent.on('run:complete', ({ result, duration }) => {
  console.log(`Completed in ${duration}ms`);
});

agent.on('run:error', ({ error }) => {
  console.error('Error:', error);
});
```

See [API: Logging](api/utils/logging.md) for all available events.

### Streaming Events

Use async iteration to stream events:

```typescript
for await (const event of agent.runStream('task')) {
  switch (event.type) {
    case 'start':
      console.log('Started');
      break;
    case 'turn:start':
      console.log(`Turn ${event.turn}`);
      break;
    case 'message':
      console.log(event.message);
      break;
    case 'complete':
      console.log('Done:', event.result);
      break;
  }
}
```

## Cancellation

Cancel agent execution using `AbortController`:

```typescript
const controller = new AbortController();

// Cancel after timeout
setTimeout(() => controller.abort('Timeout'), 30000);

await using session = agent.session();
try {
  await session.run('Long task', { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Cancelled:', error.message);
  }
}
```

Or cancel based on events:

```typescript
let turnCount = 0;
agent.on('turn:start', () => {
  if (++turnCount >= 5) {
    controller.abort('Too many turns');
  }
});
```

## Next Steps

- [Examples](examples.md) - Working code for common patterns
- [Creating Tools](guides/tools.md) - Build custom tools
- [Tool Providers](guides/tool-providers.md) - Manage tool lifecycle
- [Sub-Agents](guides/sub-agents.md) - Complex delegation patterns
- [Code Execution](guides/code-execution.md) - Different execution backends
