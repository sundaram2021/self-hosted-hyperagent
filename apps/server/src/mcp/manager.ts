import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpToolInfo, McpTransport } from '@hyperagent/shared';

/** Decrypted, server-internal MCP server configuration. */
export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[] | null;
  env: Record<string, string> | null;
  url: string | null;
  headers: Record<string, string> | null;
}

export interface McpToolDescriptor extends McpToolInfo {
  /** Raw JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
}

export interface McpConnection {
  client: Client;
  tools: McpToolDescriptor[];
}

export type TransportFactory = (config: McpServerConfig) => Transport;

export function defaultTransportFactory(config: McpServerConfig): Transport {
  switch (config.transport) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command!,
        args: config.args ?? [],
        env: { ...getSafeDefaultEnv(), ...(config.env ?? {}) },
        stderr: 'ignore',
      });
    case 'http':
      return new StreamableHTTPClientTransport(new URL(config.url!), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      });
    case 'sse':
      return new SSEClientTransport(new URL(config.url!), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      });
  }
}

/** Minimal PATH/HOME so npx/uvx-launched servers work without leaking all server env. */
function getSafeDefaultEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'LANG', 'TMPDIR', 'NODE_PATH']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

function configFingerprint(config: McpServerConfig): string {
  return JSON.stringify([
    config.transport,
    config.command,
    config.args,
    config.env,
    config.url,
    config.headers,
  ]);
}

/**
 * Owns MCP client connections. Connections are created lazily, cached per
 * server, and invalidated when the configuration changes or a connection
 * attempt fails.
 */
export class McpManager {
  private connections = new Map<string, { fingerprint: string; promise: Promise<McpConnection> }>();

  constructor(private readonly transportFactory: TransportFactory = defaultTransportFactory) {}

  async getConnection(config: McpServerConfig): Promise<McpConnection> {
    const fingerprint = configFingerprint(config);
    const cached = this.connections.get(config.id);

    if (cached && cached.fingerprint === fingerprint) {
      return cached.promise;
    }

    if (cached) {
      void this.closeEntry(config.id);
    }

    const promise = this.connect(config).catch((error) => {
      this.connections.delete(config.id);
      throw error;
    });
    this.connections.set(config.id, { fingerprint, promise });
    return promise;
  }

  private async connect(config: McpServerConfig): Promise<McpConnection> {
    const client = new Client({ name: 'self-hosted-hyperagent', version: '0.1.0' });
    await client.connect(this.transportFactory(config));

    const listed = await client.listTools();
    const tools: McpToolDescriptor[] = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    }));

    return { client, tools };
  }

  /**
   * Call a tool and flatten the MCP content blocks to a model-friendly shape.
   */
  async callTool(
    config: McpServerConfig,
    toolName: string,
    args: unknown,
  ): Promise<{ content: string; isError: boolean }> {
    const connection = await this.getConnection(config);
    const result = await connection.client.callTool({
      name: toolName,
      arguments: (args ?? {}) as Record<string, unknown>,
    });

    const blocks = Array.isArray(result.content) ? result.content : [];
    const content = blocks
      .map((block) => {
        if (block && typeof block === 'object' && 'type' in block) {
          if (block.type === 'text') return String((block as { text?: unknown }).text ?? '');
          return `[${String(block.type)} content]`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

    return { content, isError: result.isError === true };
  }

  /** Connect fresh (uncached), list tools, and close — for the Test button. */
  async test(config: McpServerConfig): Promise<McpToolDescriptor[]> {
    const client = new Client({ name: 'self-hosted-hyperagent-test', version: '0.1.0' });
    await client.connect(this.transportFactory(config));
    try {
      const listed = await client.listTools();
      return listed.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? null,
        inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
          type: 'object',
          properties: {},
        },
      }));
    } finally {
      await client.close().catch(() => {});
    }
  }

  async invalidate(serverId: string): Promise<void> {
    await this.closeEntry(serverId);
  }

  private async closeEntry(serverId: string): Promise<void> {
    const entry = this.connections.get(serverId);
    this.connections.delete(serverId);
    if (!entry) return;
    try {
      const connection = await entry.promise;
      await connection.client.close();
    } catch {
      // Connection never established or already closed.
    }
  }

  async closeAll(): Promise<void> {
    const ids = [...this.connections.keys()];
    await Promise.all(ids.map((id) => this.closeEntry(id)));
  }
}
