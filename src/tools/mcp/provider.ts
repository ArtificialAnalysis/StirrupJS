/**
 * MCP Tool Provider
 * Connects to Model Context Protocol servers and exposes their tools
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import type { Tool, ToolProvider, ToolResult } from '../../core/models.js';
import { ToolUseCountMetadata } from '../../core/models.js';
import type { McpConfig } from './config.js';
import { readFile } from 'fs/promises';

/**
 * MCP client wrapper with cleanup
 */
interface McpClientWrapper {
  client: Client;
  transport: StdioClientTransport;
  serverName: string;
}

/**
 * MCP Tool Provider
 * Connects to MCP servers and exposes their tools as Stirrup tools
 */
export class MCPToolProvider implements ToolProvider {
  private clients: McpClientWrapper[] = [];
  private config: McpConfig;
  private serverNames?: string[];

  private constructor(config: McpConfig, serverNames?: string[]) {
    this.config = config;
    this.serverNames = serverNames;
  }

  /**
   * Create MCP provider from config file
   */
  static async fromConfig(configPath: string, serverNames?: string[]): Promise<MCPToolProvider> {
    const configJson = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configJson) as McpConfig;

    return new MCPToolProvider(config, serverNames);
  }

  /**
   * Create MCP provider from config object
   */
  static fromConfigObject(config: McpConfig, serverNames?: string[]): MCPToolProvider {
    return new MCPToolProvider(config, serverNames);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // Close all clients
    for (const wrapper of this.clients) {
      try {
        await wrapper.client.close();
      } catch (error) {
        console.warn(`Failed to close MCP client for ${wrapper.serverName}:`, error);
      }
    }
  }

  async getTools(): Promise<Tool[]> {
    const tools: Tool[] = [];

    // Determine which servers to connect to
    const serverEntries = this.serverNames
      ? Object.entries(this.config.mcpServers).filter(([name]) => this.serverNames!.includes(name))
      : Object.entries(this.config.mcpServers);

    // Connect to each server
    for (const [serverName, serverConfig] of serverEntries) {
      try {
        // For now, only support stdio transport
        // Other transports can be added later
        if (serverConfig.type !== 'stdio') {
          console.warn(`Unsupported MCP transport type: ${serverConfig.type} for server ${serverName}`);
          continue;
        }

        // Create client and transport
        const transport = new StdioClientTransport({
          command: serverConfig.config.command,
          args: serverConfig.config.args,
          env: serverConfig.config.env,
        });

        const client = new Client(
          {
            name: 'stirrup-client',
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await client.connect(transport);

        // Store for cleanup
        this.clients.push({ client, transport, serverName });

        // List available tools
        const response = await client.listTools();

        // Create a Tool for each MCP tool
        for (const mcpTool of response.tools) {
          const tool = this.createToolFromMcp(mcpTool, client, serverName);
          tools.push(tool);
        }
      } catch (error) {
        console.warn(`Failed to connect to MCP server ${serverName}:`, error);
      }
    }

    return tools;
  }

  /**
   * Create a Stirrup Tool from an MCP tool definition
   */
  private createToolFromMcp(mcpTool: any, client: Client, serverName: string): Tool {
    // Convert JSON Schema to Zod schema
    const zodSchema = mcpTool.inputSchema ? this.jsonSchemaToZod(mcpTool.inputSchema) : z.object({});

    // Create tool with prefixed name
    const toolName = `${serverName}__${mcpTool.name}`;

    return {
      name: toolName,
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      parameters: zodSchema,
      executor: async (params): Promise<ToolResult<ToolUseCountMetadata>> => {
        try {
          // Call MCP tool
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: params,
          });

          // Format response as XML
          let content = '<mcp_result>\n';

          if (result.content && Array.isArray(result.content)) {
            for (const item of result.content) {
              if (item.type === 'text') {
                content += `  <text><![CDATA[\n${item.text}\n]]></text>\n`;
              } else if (item.type === 'image') {
                content += `  <image>${item.data}</image>\n`;
              } else if (item.type === 'resource') {
                content += `  <resource uri="${item.uri}">${item.text || ''}</resource>\n`;
              }
            }
          }

          content += '</mcp_result>';

          return {
            content,
            metadata: new ToolUseCountMetadata(1),
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: `<mcp_error>${errorMsg}</mcp_error>`,
            metadata: new ToolUseCountMetadata(1),
          };
        }
      },
    };
  }

  /**
   * Convert JSON Schema to Zod schema
   * Simplified implementation - handles common cases
   */
  private jsonSchemaToZod(schema: any): z.ZodType {
    if (!schema || typeof schema !== 'object') {
      return z.any();
    }

    // Handle $ref (not fully supported, just return any)
    if (schema.$ref) {
      return z.any();
    }

    // Handle type
    switch (schema.type) {
      case 'string':
        if (schema.enum) {
          const enumSchema = z.enum(schema.enum as [string, ...string[]]);
          return schema.description ? enumSchema.describe(schema.description) : enumSchema;
        }
        let stringSchema = z.string();
        if (schema.description) {
          stringSchema = stringSchema.describe(schema.description);
        }
        return stringSchema;

      case 'number':
      case 'integer':
        let numberSchema = z.number();
        if (schema.description) {
          numberSchema = numberSchema.describe(schema.description);
        }
        return numberSchema;

      case 'boolean':
        let boolSchema = z.boolean();
        if (schema.description) {
          boolSchema = boolSchema.describe(schema.description);
        }
        return boolSchema;

      case 'array':
        const itemSchema = schema.items ? this.jsonSchemaToZod(schema.items) : z.any();
        let arraySchema = z.array(itemSchema);
        if (schema.description) {
          arraySchema = arraySchema.describe(schema.description);
        }
        return arraySchema;

      case 'object':
        const shape: Record<string, z.ZodType> = {};
        const required = new Set(schema.required || []);

        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            let propZod = this.jsonSchemaToZod(propSchema);
            if (!required.has(key)) {
              propZod = propZod.optional();
            }
            shape[key] = propZod;
          }
        }

        let objectSchema = z.object(shape);
        if (schema.description) {
          objectSchema = objectSchema.describe(schema.description);
        }
        return objectSchema;

      default:
        return z.any();
    }
  }
}
