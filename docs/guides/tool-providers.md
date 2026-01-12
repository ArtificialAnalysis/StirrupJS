# Tool Providers

Tool providers manage tools that require lifecycle management, such as database connections, temporary directories, or external services.

## Overview

A tool provider implements the `ToolProvider` interface:

```typescript
interface ToolProvider {
  name: string;
  initialize?(): Promise<void>;
  getTools(): BaseTool[];
  dispose?(): Promise<void>;
}
```

- **`name`**: Unique identifier for the provider
- **`initialize()`**: Optional setup (connections, resources)
- **`getTools()`**: Returns array of tools
- **`dispose()`**: Optional cleanup

## When to Use Tool Providers

Use a tool provider when your tools need:

- **Lifecycle management**: Setup and teardown
- **Shared resources**: Database connections, temp directories
- **State**: Maintain state across tool calls
- **Cleanup**: Release resources properly

**Simple tools** don't need providers:

```typescript
// Simple tool - no provider needed
const calculatorTool: Tool<...> = {
  name: 'calculator',
  executor: async (params) => { /* stateless */ },
};
```

**Complex tools** benefit from providers:

```typescript
// Complex tool - use provider
class DatabaseToolProvider implements ToolProvider {
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

## Built-in Providers

### LocalCodeExecToolProvider

Manages local code execution with temp directory:

```typescript
import { LocalCodeExecToolProvider } from 'stirrupjs/tools';

const provider = new LocalCodeExecToolProvider(
  ['python', 'node', 'uv'],  // Allowed commands
  '/custom/temp',             // Temp directory base
  'Custom description'        // Tool description
);
```

### WebToolProvider

Manages web tools (fetch, search):

```typescript
import { WebToolProvider } from 'stirrupjs/tools';

const provider = new WebToolProvider(
  180_000,                        // Timeout (ms)
  process.env.BRAVE_API_KEY       // Search API key
);
```

### DockerCodeExecToolProvider

Manages Docker-based code execution:

```typescript
import { DockerCodeExecToolProvider } from 'stirrupjs/tools';

const provider = new DockerCodeExecToolProvider('python:3.12-slim');
```

### E2BCodeExecToolProvider

Manages E2B cloud sandbox:

```typescript
import { E2BCodeExecToolProvider } from 'stirrupjs/tools';

const provider = new E2BCodeExecToolProvider({
  apiKey: process.env.E2B_API_KEY!,
  template: 'base',
});
```

## Creating Custom Providers

### Basic Example

```typescript
import type { ToolProvider, BaseTool } from 'stirrupjs';

class MyToolProvider implements ToolProvider {
  name = 'my-tools';

  async initialize() {
    console.log('Setting up...');
    // Initialize resources
  }

  getTools(): BaseTool[] {
    return [tool1, tool2];
  }

  async dispose() {
    console.log('Cleaning up...');
    // Release resources
  }
}
```

### Database Provider Example

```typescript
import { Pool } from 'pg';
import type { ToolProvider, Tool, ToolResult } from 'stirrupjs';
import { ToolUseCountMetadata } from 'stirrupjs';
import { z } from 'zod';

class DatabaseToolProvider implements ToolProvider {
  name = 'database';
  private pool: Pool;

  async initialize() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }

  getTools(): BaseTool[] {
    const QuerySchema = z.object({
      query: z.string(),
      params: z.array(z.any()).optional(),
    });

    const queryTool: Tool<typeof QuerySchema, ToolUseCountMetadata> = {
      name: 'db_query',
      description: 'Execute a SQL query',
      parameters: QuerySchema,
      executor: async (params) => {
        try {
          const result = await this.pool.query(params.query, params.params);
          return {
            content: `${result.rowCount} rows:\n${JSON.stringify(result.rows)}`,
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

    return [queryTool];
  }

  async dispose() {
    await this.pool.end();
  }
}
```

### File System Provider Example

```typescript
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import type { ToolProvider } from 'stirrupjs';

class FileSystemToolProvider implements ToolProvider {
  name = 'filesystem';
  private workDir: string;

  constructor(baseDir: string) {
    this.workDir = join(baseDir, `session-${Date.now()}`);
  }

  async initialize() {
    await mkdir(this.workDir, { recursive: true });
  }

  getTools() {
    // Tools that use this.workDir
    return [readFileTool, writeFileTool, listFilesTool];
  }

  async dispose() {
    await rm(this.workDir, { recursive: true, force: true });
  }
}
```

## Using Providers with Agents

### Single Provider

```typescript
const agent = new Agent({
  client,
  tools: [new MyToolProvider()],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### Multiple Providers

```typescript
const agent = new Agent({
  client,
  tools: [
    new DatabaseToolProvider(),
    new WebToolProvider(),
    new LocalCodeExecToolProvider(),
  ],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

### Mix Providers and Tools

```typescript
const agent = new Agent({
  client,
  tools: [
    new DatabaseToolProvider(),    // Provider
    calculatorTool,                // Simple tool
    new WebToolProvider(),         // Provider
  ],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

## Lifecycle

### Initialization

Providers are initialized when creating a session:

```typescript
await using session = agent.session();
// All providers' initialize() called here
```

### Disposal

Providers are disposed when session ends:

```typescript
await using session = agent.session();
await session.run('task');
// All providers' dispose() called here automatically
```

### Manual Control

```typescript
const provider = new DatabaseToolProvider();

try {
  await provider.initialize();
  const tools = provider.getTools();
  // Use tools
} finally {
  await provider.dispose();
}
```

## Best Practices

### 1. Initialize Resources Lazily

Don't initialize until needed:

```typescript
class LazyProvider implements ToolProvider {
  private connection: any = null;

  private async ensureConnected() {
    if (!this.connection) {
      this.connection = await connect();
    }
  }

  getTools() {
    return [{
      executor: async (params) => {
        await this.ensureConnected();
        return await this.connection.query(params);
      },
    }];
  }
}
```

### 2. Handle Errors Gracefully

```typescript
async dispose() {
  try {
    await this.connection?.close();
  } catch (error) {
    console.error('Error closing connection:', error);
    // Don't throw - allow other cleanup to proceed
  }
}
```

### 3. Make Providers Configurable

```typescript
class ConfigurableProvider implements ToolProvider {
  constructor(
    private config: {
      timeout?: number;
      retries?: number;
      maxConnections?: number;
    } = {}
  ) {}

  async initialize() {
    this.pool = new Pool({
      max: this.config.maxConnections ?? 10,
    });
  }
}
```

### 4. Document Resource Requirements

```typescript
/**
 * Database tool provider
 *
 * Requires:
 * - DATABASE_URL environment variable
 * - PostgreSQL 12+
 * - Network access to database
 *
 * Resources:
 * - Creates connection pool (max 10 connections)
 * - All connections closed on dispose
 */
class DatabaseToolProvider implements ToolProvider {
  // ...
}
```

## Next Steps

- [Creating Tools](tools.md) - Build custom tools
- [Code Execution](code-execution.md) - Built-in tool providers
- [Examples](../examples.md) - More provider examples
