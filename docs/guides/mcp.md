# MCP (Model Context Protocol)

Connect agents to external tool servers using the [Model Context Protocol](https://modelcontextprotocol.io/). Stirrup supports stdio, HTTP (Streamable HTTP), SSE, and URL transport types.

## Transport Types

| Type | Transport | Use Case |
|------|-----------|----------|
| `stdio` | `StdioClientTransport` | Local MCP servers launched as child processes |
| `http` | `StreamableHTTPClientTransport` | Remote MCP servers over HTTP |
| `url` | `StreamableHTTPClientTransport` | Alias for `http` |
| `sse` | `SSEClientTransport` | Legacy SSE-based MCP servers |

## Quick Start

```typescript
import { Agent, MCPToolProvider, SIMPLE_FINISH_TOOL, type McpConfig } from '@stirrup/stirrup';

const mcpConfig: McpConfig = {
  mcpServers: {
    supabase: {
      type: 'url',
      config: {
        url: `https://mcp.supabase.com/mcp?project_ref=${process.env.SUPABASE_PROJECT_REF}&read_only=true`,
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_TOKEN}`,
        },
      },
    },
  },
};

const mcpProvider = MCPToolProvider.fromConfigObject(mcpConfig);

const agent = new Agent({
  client,
  tools: [mcpProvider],
  finishTool: SIMPLE_FINISH_TOOL,
});

await using session = agent.session();
await session.run('List the available tables.');
```

## Configuration

### HTTP / URL Servers

Use `type: "http"` or `type: "url"` for remote MCP servers that support Streamable HTTP transport. Both are equivalent.

```typescript
const mcpConfig: McpConfig = {
  mcpServers: {
    myServer: {
      type: 'url',
      config: {
        url: 'https://example.com/mcp',
        headers: {                          // optional
          Authorization: 'Bearer token',
        },
      },
    },
  },
};
```

### Stdio Servers

Use `type: "stdio"` for local MCP servers launched as child processes:

```typescript
const mcpConfig: McpConfig = {
  mcpServers: {
    filesystem: {
      type: 'stdio',
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: { NODE_ENV: 'production' },    // optional
      },
    },
  },
};
```

### SSE Servers

Use `type: "sse"` for legacy SSE-based MCP servers:

```typescript
const mcpConfig: McpConfig = {
  mcpServers: {
    legacy: {
      type: 'sse',
      config: {
        url: 'https://example.com/sse',
        headers: {                          // optional
          Authorization: 'Bearer token',
        },
      },
    },
  },
};
```

### Mixed Transports

You can combine different transport types in a single config:

```typescript
const mcpConfig: McpConfig = {
  mcpServers: {
    remote: {
      type: 'url',
      config: { url: 'https://example.com/mcp' },
    },
    local: {
      type: 'stdio',
      config: { command: 'npx', args: ['-y', 'some-mcp-server'] },
    },
  },
};
```

## Loading Configuration

### From Object

```typescript
const provider = MCPToolProvider.fromConfigObject(mcpConfig);
```

### From JSON File

```typescript
const provider = await MCPToolProvider.fromConfig('./mcp-servers.json');
```

Example `mcp-servers.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "url",
      "config": {
        "url": "https://mcp.supabase.com/mcp?project_ref=xxx&read_only=true",
        "headers": {
          "Authorization": "Bearer your-token"
        }
      }
    }
  }
}
```

### Selective Server Connection

Connect to specific servers from a config with multiple entries:

```typescript
// Only connect to the "supabase" server
const provider = MCPToolProvider.fromConfigObject(mcpConfig, ['supabase']);
```

## Tool Naming

MCP tools are exposed with the prefix `{serverName}__{toolName}`. For example, a tool called `list_tables` from a server named `supabase` becomes `supabase__list_tables`.

## Lifecycle

`MCPToolProvider` implements `ToolProvider`, so it integrates with Stirrup's session-based lifecycle:

```typescript
const agent = new Agent({
  client,
  tools: [mcpProvider],
  finishTool: SIMPLE_FINISH_TOOL,
});

await using session = agent.session();
// MCP connections established when tools are initialized
await session.run('...');
// MCP connections closed automatically when session ends
```

## See Also

- [Tool Providers](tool-providers.md) - How tool providers work
- [Examples](../examples.md#mcp-model-context-protocol) - MCP examples
