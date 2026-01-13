# Tools API Reference

Overview of the tools API and built-in tools.

## Interfaces

### Tool

```typescript
interface Tool<P extends z.ZodType, M = unknown> {
  name: string;
  description: string;
  parameters: P;
  executor: (params: z.infer<P>) => Promise<ToolResult<M>> | ToolResult<M>;
}
```

### ToolProvider

```typescript
interface ToolProvider {
  name: string;
  initialize?(): Promise<void>;
  getTools(): BaseTool[];
  dispose?(): Promise<void>;
}
```

### ToolResult

```typescript
interface ToolResult<M = unknown> {
  content: string | ContentBlock[];
  metadata?: M;
}
```

## Built-in Tools

### SIMPLE_FINISH_TOOL

Signal task completion:

```typescript
import { SIMPLE_FINISH_TOOL, type FinishParams } from '@stirrup/stirrup';

// Schema
interface FinishParams {
  reason: string;      // Summary of what was done
  paths: string[];     // Output file paths
}

// Usage
const agent = new Agent({
  client,
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### CALCULATOR_TOOL

Perform calculations:

```typescript
import { CALCULATOR_TOOL } from '@stirrup/stirrup';

// Schema
interface CalculatorParams {
  expression: string;  // Math expression to evaluate
}

// Usage
const agent = new Agent({
  client,
  tools: [CALCULATOR_TOOL],
});
```

### DEFAULT_TOOLS

Standard tool set (code execution + web):

```typescript
import { DEFAULT_TOOLS } from '@stirrup/stirrup';

// Includes:
// - LocalCodeExecToolProvider
// - WebToolProvider

const agent = new Agent({
  client,
  tools: DEFAULT_TOOLS,
});
```

## Metadata Classes

### ToolUseCountMetadata

```typescript
class ToolUseCountMetadata {
  numUses: number;

  constructor(count: number = 1);
  merge(other: ToolUseCountMetadata): ToolUseCountMetadata;
}
```

### WebFetchMetadata

```typescript
class WebFetchMetadata {
  numFetches: number;
  totalBytes: number;

  merge(other: WebFetchMetadata): WebFetchMetadata;
}
```

### WebSearchMetadata

```typescript
class WebSearchMetadata {
  numSearches: number;
  numResults: number;

  merge(other: WebSearchMetadata): WebSearchMetadata;
}
```

## See Also

- [Creating Tools](../../guides/tools.md) - Build custom tools
- [Tool Providers](../../guides/tool-providers.md) - Manage tool lifecycle
- [Web Tools](web.md) - Web fetch and search
- [Code Execution](code-backends.md) - Code execution tools
