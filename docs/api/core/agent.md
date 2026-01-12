# Agent API Reference

The `Agent` class orchestrates the agent loop: receiving user input, calling the LLM, executing tools, and returning results.

## Constructor

```typescript
new Agent<FP, FM>(config: AgentConfig<FP, FM>)
```

### AgentConfig

```typescript
interface AgentConfig<FP = unknown, FM = unknown> {
  client: Client;
  name?: string;
  maxTurns?: number;
  tools?: Array<BaseTool | ToolProvider>;
  finishTool?: Tool<FP, FM>;
  systemPrompt?: string;
  contextSummarizationCutoff?: number;
  runSyncInThread?: boolean;
  textOnlyToolResponses?: boolean;
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client` | `Client` | Required | LLM client for completions |
| `name` | `string` | `'agent'` | Agent identifier |
| `maxTurns` | `number` | `25` | Maximum conversation turns |
| `tools` | `Array<BaseTool \| ToolProvider>` | `[]` | Available tools |
| `finishTool` | `Tool<FP, FM>` | - | Tool to signal completion |
| `systemPrompt` | `string` | - | Initial system message |
| `contextSummarizationCutoff` | `number` | `0.75` | Context usage before summarization (0-1) |
| `runSyncInThread` | `boolean` | `false` | Run sync executors in worker threads |
| `textOnlyToolResponses` | `boolean` | `false` | Convert tool responses to text |

## Methods

### session()

Create a session for managing tool lifecycle and files.

```typescript
session(config?: SessionConfig): this
```

**Parameters:**

```typescript
interface SessionConfig {
  outputDir?: string;      // Default: './output'
  inputFiles?: string | string[];  // Reserved for future use
}
```

**Returns:** `this` (the agent instance, configured for disposal)

**Usage:**

```typescript
await using session = agent.session({ outputDir: './results' });
const result = await session.run('Create a chart');
// Automatic cleanup on scope exit
```

### run()

Execute the agent with a task or initial messages.

```typescript
async run(
  initMessages: string | ChatMessage[],
  options?: RunOptions
): Promise<AgentRunResult<FP, FM>>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `initMessages` | `string \| ChatMessage[]` | Initial task or conversation |
| `options.signal` | `AbortSignal` | Optional cancellation signal |

**Returns:**

```typescript
interface AgentRunResult<FP, FM = unknown> {
  finishParams?: FP;                // Finish tool parameters
  messageHistory: ChatMessage[][];  // Conversation history (grouped)
  runMetadata: Record<string, unknown>;  // Aggregated tool metadata
}
```

**Usage:**

```typescript
// Simple task
const result = await agent.run('What is 2 + 2?');

// With cancellation
const controller = new AbortController();
const result = await agent.run('Long task', { signal: controller.signal });

// With initial messages
const result = await agent.run([
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  { role: 'user', content: 'Tell me about AI' },
]);
```

### runStream()

Execute the agent and stream events.

```typescript
runStream(
  initMessages: string | ChatMessage[],
  options?: RunOptions
): AsyncGenerator<AgentEvent>
```

**Returns:** Async generator yielding events

**Event Types:**

```typescript
type AgentEvent =
  | { type: 'start'; task: string | ChatMessage[] }
  | { type: 'turn:start'; turn: number; maxTurns: number }
  | { type: 'message'; message: ChatMessage }
  | { type: 'tool:result'; toolName: string; success: boolean; result: string }
  | { type: 'turn:complete'; tokenUsage?: TokenUsage }
  | { type: 'summarization' }
  | { type: 'complete'; result: AgentRunResult<FP, FM> }
  | { type: 'error'; error: Error };
```

**Usage:**

```typescript
for await (const event of agent.runStream('task')) {
  switch (event.type) {
    case 'start':
      console.log('Started');
      break;
    case 'message':
      console.log('Message:', event.message);
      break;
    case 'complete':
      console.log('Done:', event.result);
      break;
  }
}
```

### toTool()

Convert agent to a tool for use as a sub-agent.

```typescript
toTool(description?: string): Tool<SubAgentParamsSchema, ToolUseCountMetadata>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `description` | `string` | Tool description (defaults to agent's name) |

**Returns:** Tool that delegates tasks to this agent

**Usage:**

```typescript
const researcher = new Agent({ client, name: 'researcher', tools: [webTools] });
const mathExpert = new Agent({ client, name: 'math', tools: [calcTools] });

const coordinator = new Agent({
  client,
  tools: [
    researcher.toTool('Delegate research tasks'),
    mathExpert.toTool('Delegate math problems'),
  ],
});
```

### on()

Register event listener.

```typescript
on(event: string, handler: (data: any) => void): void
```

**Events:**

| Event | Data | Description |
|-------|------|-------------|
| `run:start` | `{ task }` | Agent run started |
| `turn:start` | `{ turn, maxTurns }` | Turn started |
| `message:assistant` | `{ content, toolCalls }` | Assistant message |
| `message:tool` | `{ name, result }` | Tool result |
| `tool:start` | `{ name }` | Tool execution started |
| `tool:complete` | `{ name, success }` | Tool execution completed |
| `tool:error` | `{ name, error }` | Tool execution failed |
| `turn:complete` | `{ tokenUsage }` | Turn completed |
| `run:complete` | `{ result, duration }` | Run completed successfully |
| `run:error` | `{ error, duration }` | Run failed |

**Usage:**

```typescript
agent.on('turn:start', ({ turn, maxTurns }) => {
  console.log(`Turn ${turn + 1}/${maxTurns}`);
});

agent.on('tool:complete', ({ name, success }) => {
  console.log(`${name}: ${success ? 'success' : 'failure'}`);
});
```

### Symbol.asyncDispose()

Cleanup agent resources.

```typescript
async [Symbol.asyncDispose](): Promise<void>
```

**Usage:**

```typescript
// Automatic with 'await using'
await using session = agent.session();

// Manual
const session = agent.session();
try {
  await session.run('task');
} finally {
  await session[Symbol.asyncDispose]();
}
```

## Types

### ChatMessage

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
```

### ContentBlock

```typescript
type ContentBlock = TextContentBlock | ImageContentBlock;

interface TextContentBlock {
  type: 'text';
  text: string;
}

interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}
```

### TokenUsage

```typescript
interface TokenUsage {
  input: number;
  output: number;
}
```

## Examples

### Basic Agent

```typescript
import { Agent, SIMPLE_FINISH_TOOL, DEFAULT_TOOLS } from 'stirrupjs';
import { ChatCompletionsClient } from 'stirrupjs/clients';

const client = new ChatCompletionsClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
});

const agent = new Agent({
  client,
  name: 'assistant',
  maxTurns: 10,
  tools: DEFAULT_TOOLS,
  finishTool: SIMPLE_FINISH_TOOL,
});

await using session = agent.session();
const result = await session.run('What is 2 + 2?');
```

### With Event Monitoring

```typescript
const agent = new Agent({ client, tools: DEFAULT_TOOLS });

agent.on('turn:start', ({ turn }) => console.log(`Turn ${turn}`));
agent.on('tool:complete', ({ name }) => console.log(`Tool: ${name}`));

await using session = agent.session();
await session.run('task');
```

### With Cancellation

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

await using session = agent.session();
try {
  await session.run('long task', { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Cancelled');
  }
}
```

## See Also

- [Core Concepts](../../concepts.md) - Understanding agents
- [Examples](../../examples.md) - Working examples
- [Client API](../clients/chat-completions.md) - LLM client reference
