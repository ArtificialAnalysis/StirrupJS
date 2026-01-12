/**
 * MCP configuration schemas and types
 */

import { z } from 'zod';

/**
 * Stdio server configuration (local process)
 */
export const StdioServerConfigSchema = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).default([]).describe('Command arguments'),
  env: z.record(z.string()).optional().describe('Environment variables'),
});

export type StdioServerConfig = z.infer<typeof StdioServerConfigSchema>;

/**
 * SSE server configuration (Server-Sent Events)
 */
export const SseServerConfigSchema = z.object({
  url: z.string().url().describe('SSE endpoint URL (must end with /sse)'),
  headers: z.record(z.string()).optional().describe('HTTP headers'),
  timeout: z.number().default(5000).describe('Connection timeout in ms'),
  sseReadTimeout: z.number().default(300000).describe('SSE read timeout in ms'),
});

export type SseServerConfig = z.infer<typeof SseServerConfigSchema>;

/**
 * HTTP server configuration (Streamable HTTP)
 */
export const HttpServerConfigSchema = z.object({
  url: z.string().url().describe('HTTP endpoint URL'),
  headers: z.record(z.string()).optional().describe('HTTP headers'),
  timeout: z.number().default(30000).describe('Request timeout in ms'),
});

export type HttpServerConfig = z.infer<typeof HttpServerConfigSchema>;

/**
 * WebSocket server configuration
 */
export const WebSocketServerConfigSchema = z.object({
  url: z.string().url().describe('WebSocket URL (ws:// or wss://)'),
});

export type WebSocketServerConfig = z.infer<typeof WebSocketServerConfigSchema>;

/**
 * MCP server configuration (discriminated union)
 */
export const McpServerConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stdio'), config: StdioServerConfigSchema }),
  z.object({ type: z.literal('sse'), config: SseServerConfigSchema }),
  z.object({ type: z.literal('http'), config: HttpServerConfigSchema }),
  z.object({ type: z.literal('websocket'), config: WebSocketServerConfigSchema }),
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * MCP configuration file format
 */
export const McpConfigSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;

/**
 * Auto-detect transport type from config
 */
export function detectTransportType(
  config: StdioServerConfig | SseServerConfig | HttpServerConfig | WebSocketServerConfig
): 'stdio' | 'sse' | 'http' | 'websocket' {
  if ('command' in config) {
    return 'stdio';
  }

  if ('url' in config) {
    const url = config.url;
    if (url.endsWith('/sse')) {
      return 'sse';
    }
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return 'websocket';
    }
    return 'http';
  }

  throw new Error('Unable to detect transport type from config');
}
