# Examples

This page contains working examples for common patterns and use cases.

## Basic Usage

### Simple Agent

Create an agent that can use tools and finish when done:

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

console.log(result.finishParams?.reason);
```

### With Custom System Prompt

```typescript
const agent = new Agent({
  client,
  name: 'code-reviewer',
  maxTurns: 10,
  tools: DEFAULT_TOOLS,
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'You are an expert code reviewer. Analyze code for bugs, performance issues, and best practices.',
});
```

## Custom Tools

### Simple Calculator Tool

```typescript
import { z } from 'zod';
import type { Tool, ToolResult } from 'stirrupjs';
import { ToolUseCountMetadata } from 'stirrupjs';

const CalculatorParamsSchema = z.object({
  expression: z.string().describe('Mathematical expression to evaluate'),
});

const calculatorTool: Tool<typeof CalculatorParamsSchema, ToolUseCountMetadata> = {
  name: 'calculator',
  description: 'Evaluate mathematical expressions',
  parameters: CalculatorParamsSchema,
  executor: async (params) => {
    try {
      // WARNING: eval is dangerous - use a proper math parser in production
      const result = eval(params.expression);
      return {
        content: `Result: ${result}`,
        metadata: new ToolUseCountMetadata(1),
      };
    } catch (error) {
      return {
        content: `Error: ${error.message}`,
        metadata: new ToolUseCountMetadata(1),
      };
    }
  },
};

const agent = new Agent({
  client,
  tools: [calculatorTool],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### Weather API Tool

```typescript
import { z } from 'zod';
import type { Tool, ToolResult } from 'stirrupjs';
import { ToolUseCountMetadata } from 'stirrupjs';

const WeatherParamsSchema = z.object({
  location: z.string().describe('City name or location'),
  unit: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature unit'),
});

const weatherTool: Tool<typeof WeatherParamsSchema, ToolUseCountMetadata> = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: WeatherParamsSchema,
  executor: async (params): Promise<ToolResult<ToolUseCountMetadata>> => {
    // In production, call a real weather API
    const temp = params.unit === 'celsius' ? 22 : 72;
    const condition = 'Sunny';

    return {
      content: `Weather in ${params.location}: ${temp}°${params.unit === 'celsius' ? 'C' : 'F'}, ${condition}`,
      metadata: new ToolUseCountMetadata(1),
    };
  },
};
```

### Database Query Tool

```typescript
import { z } from 'zod';
import type { Tool, ToolResult } from 'stirrupjs';
import { ToolUseCountMetadata } from 'stirrupjs';

const DbQueryParamsSchema = z.object({
  query: z.string().describe('SQL query to execute'),
});

const databaseTool: Tool<typeof DbQueryParamsSchema, ToolUseCountMetadata> = {
  name: 'db_query',
  description: 'Execute a SQL query against the database',
  parameters: DbQueryParamsSchema,
  executor: async (params) => {
    // In production, use a proper database client with parameterized queries
    console.log(`Executing query: ${params.query}`);

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
```

## Sub-Agents

Delegate specialized tasks to sub-agents:

```typescript
import { Agent, SIMPLE_FINISH_TOOL, CALCULATOR_TOOL } from 'stirrupjs';
import { WebToolProvider } from 'stirrupjs/tools';

// Create specialized sub-agents
const researchAgent = new Agent({
  client,
  name: 'researcher',
  maxTurns: 5,
  tools: [new WebToolProvider(180_000, process.env.BRAVE_API_KEY)],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'You are a research specialist. Use web search to find accurate information.',
});

const mathAgent = new Agent({
  client,
  name: 'mathematician',
  maxTurns: 3,
  tools: [CALCULATOR_TOOL],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'You are a math specialist. Calculate precisely using the calculator tool.',
});

// Create coordinator that delegates to sub-agents
const coordinatorAgent = new Agent({
  client,
  name: 'coordinator',
  maxTurns: 10,
  tools: [
    researchAgent.toTool('Delegate research tasks to the research specialist'),
    mathAgent.toTool('Delegate math calculations to the math specialist'),
  ],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: `You are a task coordinator. Delegate tasks to specialized sub-agents:
- Use 'researcher' for web search and research tasks
- Use 'mathematician' for calculations and math problems`,
});

await using session = coordinatorAgent.session();
await session.run('What is the population of Tokyo and what will it be in 5 years with 2% growth?');
```

## Event Monitoring

### Basic Event Listeners

```typescript
const agent = new Agent({
  client,
  name: 'event-agent',
  maxTurns: 5,
  tools: DEFAULT_TOOLS,
  finishTool: SIMPLE_FINISH_TOOL,
});

// Listen to agent events
agent.on('run:start', ({ task }) => {
  console.log('🚀 Agent started');
});

agent.on('turn:start', ({ turn, maxTurns }) => {
  console.log(`📍 Turn ${turn + 1}/${maxTurns}`);
});

agent.on('message:assistant', ({ content, toolCalls }) => {
  if (content) console.log('💬 Assistant:', content.substring(0, 100));
  if (toolCalls) console.log('🔧 Tools:', toolCalls.map(tc => tc.name).join(', '));
});

agent.on('tool:complete', ({ name, success }) => {
  console.log(`${success ? '✅' : '❌'} Tool: ${name}`);
});

agent.on('run:complete', ({ result, duration }) => {
  console.log(`✅ Completed in ${duration}ms`);
});

await using session = agent.session();
await session.run('What is 2+2?');
```

### Streaming Events

```typescript
for await (const event of agent.runStream('What is 2+2?')) {
  switch (event.type) {
    case 'start':
      console.log('🚀 Started');
      break;
    case 'turn:start':
      console.log(`📍 Turn ${event.turn + 1}/${event.maxTurns}`);
      break;
    case 'message':
      if (event.message.role === 'assistant') {
        console.log('💬 Assistant:', event.message.content);
      }
      break;
    case 'complete':
      console.log('✅ Complete');
      break;
  }
}
```

### Cancellation with AbortController

```typescript
const controller = new AbortController();

// Cancel after 3 turns
let turnCount = 0;
agent.on('turn:start', () => {
  turnCount++;
  if (turnCount >= 3) {
    console.log('⏰ Cancelling...');
    controller.abort('Maximum turns reached');
  }
});

await using session = agent.session();
try {
  await session.run('Count to 100', { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('✅ Successfully cancelled');
  }
}
```

### Structured Logging

The easiest way to monitor agent activity:

```typescript
import { createStructuredLogger } from 'stirrupjs';

const cleanup = createStructuredLogger(agent, {
  level: 'debug',  // or 'info'
});

await using session = agent.session();
await session.run('Create a chart');

cleanup();  // Stop logging
```

This automatically shows:
- Turn-by-turn progress
- Tool calls with parameters
- Sub-agent activity (indented)
- Token usage per turn
- Final summary with totals

## File Handling

### Saving Output Files

```typescript
await using session = agent.session({ outputDir: './output' });

const result = await session.run('Create a chart of sales data');

// Files listed in result.finishParams.paths are automatically saved to ./output/
console.log('Saved files:', result.finishParams?.paths);
```

### Multiple Output Directories

```typescript
// Save research results
await using session1 = agent.session({ outputDir: './research' });
await session1.run('Research topic and save summary');

// Save analysis in different directory
await using session2 = agent.session({ outputDir: './analysis' });
await session2.run('Analyze data and create visualizations');
```

## Code Execution Backends

### Local Execution (Default)

```typescript
import { LocalCodeExecToolProvider } from 'stirrupjs/tools';

const agent = new Agent({
  client,
  tools: [new LocalCodeExecToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### Docker Execution

```typescript
import { DockerCodeExecToolProvider } from 'stirrupjs/tools';

const agent = new Agent({
  client,
  tools: [new DockerCodeExecToolProvider('python:3.12-slim')],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### E2B Cloud Sandboxes

```typescript
import { E2BCodeExecToolProvider } from 'stirrupjs/tools';

const agent = new Agent({
  client,
  tools: [new E2BCodeExecToolProvider({
    apiKey: process.env.E2B_API_KEY!,
    template: 'base',
  })],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

## Skills

Load skills from a local `skills/` directory and make them available in the execution environment:

```typescript
await using session = agent.session({
  skillsDir: 'skills',
  inputFiles: ['examples/skills/sample_data.csv'],
  outputDir: './output/skills_example',
});

await session.run('Use the data_analysis skill to analyze the CSV and create a chart.');
```

## Next Steps

- [Creating Tools](guides/tools.md) - Deep dive into custom tools
- [Tool Providers](guides/tool-providers.md) - Managing tool lifecycle
- [Sub-Agents](guides/sub-agents.md) - Complex delegation patterns
- [Code Execution](guides/code-execution.md) - Different execution backends
