# Creating Tools

This guide covers how to create custom tools for your agents.

## Tool Basics

A tool is an object that implements the `Tool` interface:

```typescript
interface Tool<P extends z.ZodType, M = unknown> {
  name: string;
  description: string;
  parameters: P;
  executor: (params: z.infer<P>) => Promise<ToolResult<M>> | ToolResult<M>;
}
```

- **`name`**: Unique tool identifier (snake_case recommended)
- **`description`**: What the tool does (shown to the LLM)
- **`parameters`**: Zod schema defining tool parameters
- **`executor`**: Function that executes the tool

## Simple Tool Example

```typescript
import { z } from 'zod';
import type { Tool, ToolResult } from '@stirrup/stirrup';
import { ToolUseCountMetadata } from '@stirrup/stirrup';

// 1. Define parameter schema
const GreetParamsSchema = z.object({
  name: z.string().describe('Name of person to greet'),
  language: z.enum(['english', 'spanish', 'french']).default('english'),
});

// 2. Create tool
const greetTool: Tool<typeof GreetParamsSchema, ToolUseCountMetadata> = {
  name: 'greet',
  description: 'Greet a person in different languages',
  parameters: GreetParamsSchema,
  executor: async (params) => {
    const greetings = {
      english: `Hello, ${params.name}!`,
      spanish: `¡Hola, ${params.name}!`,
      french: `Bonjour, ${params.name}!`,
    };

    return {
      content: greetings[params.language],
      metadata: new ToolUseCountMetadata(1),
    };
  },
};

// 3. Use with agent
const agent = new Agent({
  client,
  tools: [greetTool],
  finishTool: SIMPLE_FINISH_TOOL,
});
```

## Parameter Schemas

Use Zod to define tool parameters. The LLM sees the schema and descriptions when deciding how to call your tool.

### Basic Types

```typescript
const schema = z.object({
  // Primitives
  text: z.string().describe('A string value'),
  count: z.number().describe('A number'),
  enabled: z.boolean().describe('A boolean flag'),

  // With defaults
  language: z.string().default('en'),
  retries: z.number().default(3),

  // Optional fields
  optional: z.string().optional().describe('An optional field'),

  // Enums
  mode: z.enum(['fast', 'accurate', 'balanced']).describe('Processing mode'),

  // Arrays
  tags: z.array(z.string()).describe('List of tags'),
  scores: z.array(z.number()).describe('Array of scores'),
});
```

### Complex Types

```typescript
const schema = z.object({
  // Nested objects
  user: z.object({
    name: z.string(),
    email: z.string().email(),
  }),

  // Union types
  value: z.union([z.string(), z.number()]),

  // Records/dictionaries
  metadata: z.record(z.string()),

  // Refined validation
  port: z.number().min(1).max(65535),
  email: z.string().email(),
  url: z.string().url(),
});
```

### Descriptions

Always add `.describe()` to parameters - the LLM uses these to understand what to provide:

```typescript
z.object({
  query: z.string().describe('SQL query to execute. Use parameterized queries for safety.'),
  timeout: z.number().default(30).describe('Query timeout in seconds'),
  limit: z.number().optional().describe('Maximum number of rows to return'),
});
```

## Tool Results

Tools return a `ToolResult`:

```typescript
interface ToolResult<M = unknown> {
  content: string | ContentBlock[];
  metadata?: M;
}
```

### Text Results

```typescript
executor: async (params) => {
  const result = await someOperation(params);
  return {
    content: `Operation completed: ${result}`,
    metadata: new ToolUseCountMetadata(1),
  };
}
```

### Structured Results

```typescript
executor: async (params) => {
  const data = await fetchData(params);
  return {
    content: JSON.stringify(data, null, 2),
    metadata: new ToolUseCountMetadata(1),
  };
}
```

### Image Results

```typescript
import { ImageContentBlock } from '@stirrup/stirrup';

executor: async (params) => {
  const imageData = await generateImage(params);
  return {
    content: [
      new ImageContentBlock(
        imageData,      // Buffer or base64 string
        'image/png',    // MIME type
        'chart.png'     // Optional filename
      ),
    ],
    metadata: new ToolUseCountMetadata(1),
  };
}
```

### Error Handling

```typescript
executor: async (params) => {
  try {
    const result = await riskyOperation(params);
    return {
      content: `Success: ${result}`,
      metadata: new ToolUseCountMetadata(1),
    };
  } catch (error) {
    return {
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      metadata: new ToolUseCountMetadata(1),
    };
  }
}
```

## Tool Metadata

Metadata tracks tool usage and custom information:

```typescript
class ToolUseCountMetadata {
  numUses: number;

  constructor(count: number = 1) {
    this.numUses = count;
  }

  merge(other: ToolUseCountMetadata): ToolUseCountMetadata {
    return new ToolUseCountMetadata(this.numUses + other.numUses);
  }
}
```

Access aggregated metadata in results:

```typescript
const result = await session.run('task');
console.log(result.runMetadata.my_tool); // { numUses: 3 }
```

### Custom Metadata

```typescript
class ApiCallMetadata {
  numCalls: number = 0;
  totalLatency: number = 0;

  merge(other: ApiCallMetadata): ApiCallMetadata {
    const merged = new ApiCallMetadata();
    merged.numCalls = this.numCalls + other.numCalls;
    merged.totalLatency = this.totalLatency + other.totalLatency;
    return merged;
  }
}

const tool: Tool<typeof schema, ApiCallMetadata> = {
  name: 'api_call',
  description: 'Call external API',
  parameters: schema,
  executor: async (params) => {
    const start = Date.now();
    const result = await fetch(params.url);
    const latency = Date.now() - start;

    const metadata = new ApiCallMetadata();
    metadata.numCalls = 1;
    metadata.totalLatency = latency;

    return {
      content: await result.text(),
      metadata,
    };
  },
};
```

## Real-World Examples

### HTTP API Tool

```typescript
const HttpRequestParamsSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional().describe('HTTP headers'),
  body: z.string().optional().describe('Request body (JSON string)'),
});

const httpTool: Tool<typeof HttpRequestParamsSchema, ToolUseCountMetadata> = {
  name: 'http_request',
  description: 'Make HTTP requests to external APIs',
  parameters: HttpRequestParamsSchema,
  executor: async (params) => {
    try {
      const response = await fetch(params.url, {
        method: params.method,
        headers: params.headers,
        body: params.body,
      });

      const data = await response.text();

      return {
        content: `Status: ${response.status}\n\n${data}`,
        metadata: new ToolUseCountMetadata(1),
      };
    } catch (error) {
      return {
        content: `HTTP Error: ${error.message}`,
        metadata: new ToolUseCountMetadata(1),
      };
    }
  },
};
```

### File System Tool

```typescript
import { readFile, writeFile } from 'fs/promises';

const FileReadParamsSchema = z.object({
  path: z.string().describe('File path to read'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
});

const fileReadTool: Tool<typeof FileReadParamsSchema, ToolUseCountMetadata> = {
  name: 'read_file',
  description: 'Read contents of a file',
  parameters: FileReadParamsSchema,
  executor: async (params) => {
    try {
      const content = await readFile(params.path, params.encoding as BufferEncoding);
      return {
        content: `File contents:\n${content}`,
        metadata: new ToolUseCountMetadata(1),
      };
    } catch (error) {
      return {
        content: `Error reading file: ${error.message}`,
        metadata: new ToolUseCountMetadata(1),
      };
    }
  },
};
```

### Database Tool

```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DbQueryParamsSchema = z.object({
  query: z.string().describe('SQL query to execute'),
  params: z.array(z.any()).optional().describe('Query parameters for safety'),
});

const dbQueryTool: Tool<typeof DbQueryParamsSchema, ToolUseCountMetadata> = {
  name: 'db_query',
  description: 'Execute a SQL query. Always use parameterized queries.',
  parameters: DbQueryParamsSchema,
  executor: async (params) => {
    try {
      const result = await pool.query(params.query, params.params);
      return {
        content: `Query returned ${result.rowCount} rows:\n${JSON.stringify(result.rows, null, 2)}`,
        metadata: new ToolUseCountMetadata(1),
      };
    } catch (error) {
      return {
        content: `Database error: ${error.message}`,
        metadata: new ToolUseCountMetadata(1),
      };
    }
  },
};
```

## Best Practices

### 1. Clear Descriptions

Write descriptions that help the LLM understand when and how to use your tool:

```typescript
// Good
description: 'Search the product database by name, category, or SKU. Returns matching products with prices and availability.'

// Bad
description: 'Search products'
```

### 2. Validate Input

Use Zod's validation features:

```typescript
const schema = z.object({
  port: z.number().min(1).max(65535).describe('Port number (1-65535)'),
  email: z.string().email().describe('Valid email address'),
  url: z.string().url().describe('Valid HTTP/HTTPS URL'),
});
```

### 3. Handle Errors Gracefully

Return errors as content rather than throwing:

```typescript
executor: async (params) => {
  try {
    return { content: await doWork(params), metadata };
  } catch (error) {
    // Return error as content so agent can handle it
    return {
      content: `Error: ${error.message}. Try a different approach.`,
      metadata
    };
  }
}
```

### 4. Provide Structured Output

Help the agent understand results:

```typescript
return {
  content: `
Results: 3 items found

1. Item: Widget A
   Price: $29.99
   Stock: 15 units

2. Item: Widget B
   Price: $34.99
   Stock: 8 units

3. Item: Widget C
   Price: $39.99
   Stock: 0 units (out of stock)
`,
  metadata,
};
```

### 5. Use Appropriate Types

```typescript
// Good: Specific enum
mode: z.enum(['read', 'write', 'append'])

// Bad: Vague string
mode: z.string()
```

## Next Steps

- [Tool Providers](tool-providers.md) - Managing tool lifecycle
- [Sub-Agents](sub-agents.md) - Using agents as tools
- [Code Execution](code-execution.md) - Built-in code execution tools
- [Examples](../examples.md) - More tool examples
