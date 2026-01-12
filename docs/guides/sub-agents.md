# Sub-Agents

Sub-agents allow you to create specialized agents and use them as tools within other agents. This enables powerful delegation patterns and modular agent architectures.

## Overview

A sub-agent is simply an agent converted to a tool using the `toTool()` method. The parent agent can then delegate tasks to the sub-agent by calling this tool.

**Benefits:**
- **Specialization**: Different agents for different tasks
- **Modularity**: Reusable agent components
- **Context isolation**: Sub-agents have separate conversation history
- **Simplified reasoning**: Parent focuses on delegation, sub-agents on execution

## Basic Example

```typescript
import { Agent, SIMPLE_FINISH_TOOL, CALCULATOR_TOOL } from 'stirrupjs';
import { WebToolProvider } from 'stirrupjs/tools';

// Create specialized sub-agents
const researchAgent = new Agent({
  client,
  name: 'researcher',
  maxTurns: 5,
  tools: [new WebToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'You are a research specialist. Use web search to find accurate information.',
});

const mathAgent = new Agent({
  client,
  name: 'mathematician',
  maxTurns: 3,
  tools: [CALCULATOR_TOOL],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'You are a math specialist. Use the calculator tool for precise calculations.',
});

// Create coordinator that uses sub-agents
const coordinator = new Agent({
  client,
  name: 'coordinator',
  maxTurns: 10,
  tools: [
    researchAgent.toTool('Delegate research and web search tasks'),
    mathAgent.toTool('Delegate calculations and math problems'),
  ],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: `You are a task coordinator. Break down complex tasks and delegate to specialists:
- Use 'researcher' for web research and information gathering
- Use 'mathematician' for calculations and math problems`,
});

// Use the coordinator
await using session = coordinator.session();
const result = await session.run(`
  What is the current population of Tokyo?
  If it grows by 2% annually, what will the population be in 5 years?
`);
```

## How It Works

### 1. Creating Sub-Agents

Create agents with specialized capabilities:

```typescript
const codeReviewer = new Agent({
  client,
  name: 'code-reviewer',
  tools: [fileReadTool, grepTool],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'You are an expert code reviewer. Analyze code for bugs and improvements.',
});

const tester = new Agent({
  client,
  name: 'tester',
  tools: [new LocalCodeExecToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'You are a testing specialist. Write and run tests.',
});
```

### 2. Converting to Tools

Use `toTool()` to make agents available as tools:

```typescript
const coordinator = new Agent({
  client,
  tools: [
    codeReviewer.toTool('Review code for quality and bugs'),
    tester.toTool('Write and execute tests'),
  ],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### 3. Delegation

The coordinator delegates by calling sub-agent tools:

```typescript
// Coordinator sees sub-agents as regular tools
// When called, sub-agent runs independently and returns results
const result = await coordinator.run('Review and test the authentication code');
```

## Design Patterns

### Specialist Pattern

Multiple specialized agents for different domains:

```typescript
const dataAnalyst = new Agent({
  client,
  name: 'analyst',
  tools: [new LocalCodeExecToolProvider()],
  systemPrompt: 'Data analysis specialist. Use pandas, numpy for analysis.',
});

const visualizer = new Agent({
  client,
  name: 'visualizer',
  tools: [new LocalCodeExecToolProvider()],
  systemPrompt: 'Visualization specialist. Create charts with matplotlib.',
});

const writer = new Agent({
  client,
  name: 'writer',
  tools: [fileWriteTool],
  systemPrompt: 'Report writing specialist. Create clear, concise reports.',
});

const dataScience = new Agent({
  client,
  tools: [
    dataAnalyst.toTool('Analyze data'),
    visualizer.toTool('Create visualizations'),
    writer.toTool('Write reports'),
  ],
});
```

### Pipeline Pattern

Sequential processing through multiple agents:

```typescript
const scraper = new Agent({
  client,
  name: 'scraper',
  tools: [new WebToolProvider()],
  systemPrompt: 'Extract data from websites.',
});

const cleaner = new Agent({
  client,
  name: 'cleaner',
  tools: [new LocalCodeExecToolProvider()],
  systemPrompt: 'Clean and normalize data.',
});

const analyzer = new Agent({
  client,
  name: 'analyzer',
  tools: [new LocalCodeExecToolProvider()],
  systemPrompt: 'Analyze data and generate insights.',
});

const pipeline = new Agent({
  client,
  tools: [
    scraper.toTool('Scrape data from URLs'),
    cleaner.toTool('Clean and normalize data'),
    analyzer.toTool('Analyze data'),
  ],
  systemPrompt: 'Process data through pipeline: scrape → clean → analyze',
});
```

### Hierarchical Pattern

Multiple levels of delegation:

```typescript
// Level 2: Specialized workers
const pythonExpert = new Agent({ /* ... */ });
const jsExpert = new Agent({ /* ... */ });

// Level 1: Language coordinator
const coder = new Agent({
  client,
  tools: [
    pythonExpert.toTool('Python tasks'),
    jsExpert.toTool('JavaScript tasks'),
  ],
});

// Level 0: Main coordinator
const projectManager = new Agent({
  client,
  tools: [
    coder.toTool('Coding tasks'),
    tester.toTool('Testing tasks'),
    reviewer.toTool('Code review'),
  ],
});
```

## Communication Patterns

### Direct Task Delegation

Parent provides complete task description:

```typescript
await coordinator.run(`
  Use the researcher to find:
  1. Current Bitcoin price
  2. 24h trading volume
  3. Market cap
`);
```

### Iterative Refinement

Parent iterates based on sub-agent results:

```typescript
await coordinator.run(`
  1. Ask researcher for sales data
  2. If data looks incomplete, ask again with more specific query
  3. Once you have good data, ask analyst to process it
`);
```

### Parallel Execution

Multiple sub-agents called independently:

```typescript
await coordinator.run(`
  In parallel:
  - Ask researcher for market trends
  - Ask analyst for current performance
  Then combine results into summary
`);
```

## Context Management

### Isolated Contexts

Each sub-agent has its own conversation history:

```typescript
// Researcher's context: only sees research-related conversation
// Math agent's context: only sees math-related conversation
// Coordinator's context: sees overall task and sub-agent results
```

### Passing Context

Parent provides context in sub-agent calls:

```typescript
await coordinator.run(`
  First, use researcher to find Tokyo population.
  Then use math agent to calculate 5-year growth at 2%.
  Pass the population number to the math agent.
`);
```

### Preserving State

Sub-agents don't preserve state between calls:

```typescript
// Each call to sub-agent is independent
await coordinator.run('Ask researcher for data on topic A');
await coordinator.run('Ask researcher for data on topic B');
// Researcher doesn't remember topic A
```

## File Handling

### Sub-Agent File Creation

Sub-agents can create files:

```typescript
const imageGen = new Agent({
  client,
  tools: [new LocalCodeExecToolProvider()],
  systemPrompt: 'Create images with matplotlib',
});

const coordinator = new Agent({
  client,
  tools: [imageGen.toTool('Generate images')],
});

await using session = coordinator.session({ outputDir: './output' });
await session.run('Create a bar chart of sales data');
// Files from sub-agent automatically transferred to ./output/
```

### File Transfer

Files flow from sub-agent → parent:

1. Sub-agent creates file in its execution environment
2. Sub-agent finishes with file in `paths` parameter
3. File transferred to parent's execution environment
4. Parent can use file or save to output directory

## Monitoring Sub-Agents

### Structured Logging

Structured logging automatically tracks sub-agent activity:

```typescript
import { createStructuredLogger } from 'stirrupjs';

const cleanup = createStructuredLogger(coordinator, { level: 'debug' });

await using session = coordinator.session();
await session.run('Complex task');

cleanup();

// Output shows:
// Turn 1
//   Tool: researcher
//     Turn 1  (sub-agent)
//       Tool: web_search
//     Turn 2  (sub-agent)
//       Tool: finish
//   Tool: mathematician
//     Turn 1  (sub-agent)
//       Tool: calculator
```

### Custom Event Handlers

Track sub-agent calls:

```typescript
coordinator.on('tool:start', ({ name }) => {
  if (name === 'researcher' || name === 'mathematician') {
    console.log(`Delegating to ${name}...`);
  }
});

coordinator.on('tool:complete', ({ name, result }) => {
  if (name === 'researcher' || name === 'mathematician') {
    console.log(`${name} completed:`, result);
  }
});
```

## Best Practices

### 1. Clear Specialization

Give each sub-agent a focused responsibility:

```typescript
// Good: Focused specialists
const scraper = new Agent({ /* web scraping */ });
const analyzer = new Agent({ /* data analysis */ });

// Bad: Overlapping responsibilities
const dataWorker = new Agent({ /* scraping AND analysis */ });
```

### 2. Appropriate Granularity

Don't over-decompose:

```typescript
// Too granular - unnecessary overhead
const adder = new Agent({ /* only addition */ });
const subtractor = new Agent({ /* only subtraction */ });

// Better - appropriate scope
const calculator = new Agent({ /* all arithmetic */ });
```

### 3. Clear System Prompts

Help agents understand their role:

```typescript
const reviewer = new Agent({
  client,
  systemPrompt: `You are a code reviewer. Your ONLY job is to:
  1. Read code files
  2. Identify bugs, performance issues, and anti-patterns
  3. Suggest improvements
  Do NOT write or modify code - only review.`,
});
```

### 4. Limit Recursion Depth

Avoid deep nesting:

```typescript
// Good: 2 levels
coordinator → specialists → tools

// Risky: 4+ levels
coordinator → managers → specialists → workers → tools
```

### 5. Handle Sub-Agent Failures

Sub-agents might fail or produce unexpected results:

```typescript
await coordinator.run(`
  Try to get data from researcher.
  If researcher can't find data, use fallback approach:
  - Check local database
  - Use cached data
  - Report data unavailable
`);
```

## Limitations

### Token Usage

Each sub-agent call includes:
- Sub-agent's system prompt
- Sub-agent's tool definitions
- Sub-agent's conversation

This increases token usage significantly.

### Latency

Sub-agent calls add latency:
- Parent → sub-agent delegation
- Sub-agent execution (multiple turns)
- Result → parent

### Complexity

More agents = more complexity:
- Harder to debug
- More failure modes
- Increased token costs

## Examples

### Complete Data Pipeline

```typescript
import { Agent, SIMPLE_FINISH_TOOL } from 'stirrupjs';
import { WebToolProvider, LocalCodeExecToolProvider } from 'stirrupjs/tools';

// Fetch data from web
const fetcher = new Agent({
  client,
  name: 'fetcher',
  maxTurns: 3,
  tools: [new WebToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'Fetch data from URLs and APIs.',
});

// Process and clean data
const processor = new Agent({
  client,
  name: 'processor',
  maxTurns: 5,
  tools: [new LocalCodeExecToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'Clean and process data using pandas.',
});

// Create visualizations
const visualizer = new Agent({
  client,
  name: 'visualizer',
  maxTurns: 5,
  tools: [new LocalCodeExecToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: 'Create charts with matplotlib.',
});

// Coordinate the pipeline
const pipeline = new Agent({
  client,
  name: 'pipeline',
  maxTurns: 15,
  tools: [
    fetcher.toTool('Fetch data from web'),
    processor.toTool('Process and clean data'),
    visualizer.toTool('Create visualizations'),
  ],
  finishTool: SIMPLE_FINISH_TOOL,
  systemPrompt: `Execute data pipeline:
  1. Fetch data
  2. Process data
  3. Create visualizations`,
});

await using session = pipeline.session({ outputDir: './results' });
await session.run('Analyze recent tech stock performance and create charts');
```

## Next Steps

- [Creating Tools](tools.md) - Build custom tools
- [Tool Providers](tool-providers.md) - Manage tool lifecycle
- [Examples](../examples.md) - More sub-agent examples
