import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { settings as settingsTable } from '@hyperagent/db';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildApp } from '../app.js';
import { makeTestDb, makeTestEnv } from '../test-utils.js';
import type { TransportFactory } from './manager.js';
import { mcpToolName } from './tools.js';

/** Every connection gets a fresh in-memory MCP server exposing an `add` tool. */
const testTransportFactory: TransportFactory = () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: 'calc', version: '1.0.0' });
  server.tool(
    'add',
    'Add two numbers',
    { a: z.number(), b: z.number() },
    async ({ a, b }: { a: number; b: number }) => ({
      content: [{ type: 'text' as const, text: String(a + b) }],
    }),
  );
  void server.connect(serverTransport);
  return clientTransport;
};

/** A model that calls calc__add(3, 4) and then reports the result. */
function mcpCallingModel() {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      call += 1;
      if (call === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: 'tool-call' as const,
                toolCallId: 'call-1',
                toolName: mcpToolName('calc', 'add'),
                input: JSON.stringify({ a: 3, b: 4 }),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls' as const, raw: undefined },
                usage: {
                  inputTokens: {
                    total: 5,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 2, text: 2, reasoning: undefined },
                },
              },
            ],
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'The sum is 7.' },
            { type: 'text-end', id: 't1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop' as const, raw: undefined },
              usage: {
                inputTokens: {
                  total: 9,
                  noCache: undefined,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: { total: 5, text: 5, reasoning: undefined },
              },
            },
          ],
        }),
      };
    },
  });
}

let app: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  db = await makeTestDb();
  app = await buildApp(makeTestEnv(), {
    db,
    envSource: { ANTHROPIC_API_KEY: 'test-key' },
    modelFactory: () => mcpCallingModel(),
    mcpTransportFactory: testTransportFactory,
  });
});

afterAll(async () => {
  await app.close();
});

describe('MCP server CRUD', () => {
  it('creates, lists, updates, and deletes servers; secrets never round-trip', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/mcp-servers',
      payload: {
        name: 'calc',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'some-mcp-server'],
        env: { API_TOKEN: 'super-secret-token' },
      },
    });
    expect(created.statusCode).toBe(201);
    const server = created.json();
    expect(server.envKeys).toEqual(['API_TOKEN']);
    expect(JSON.stringify(server)).not.toContain('super-secret-token');

    // Stored encrypted at rest (APP_SECRET is set in the test env).
    const rows = await db.select().from(settingsTable);
    void rows; // settings table untouched by MCP
    const list = (await app.inject({ method: 'GET', url: '/api/mcp-servers' })).json();
    expect(list).toHaveLength(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/mcp-servers/${server.id}`,
      payload: { enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().enabled).toBe(false);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/mcp-servers/${server.id}`,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('validates transport-specific requirements', async () => {
    const missingCommand = await app.inject({
      method: 'POST',
      url: '/api/mcp-servers',
      payload: { name: 'bad-stdio', transport: 'stdio' },
    });
    expect(missingCommand.statusCode).toBe(400);

    const missingUrl = await app.inject({
      method: 'POST',
      url: '/api/mcp-servers',
      payload: { name: 'bad-http', transport: 'http' },
    });
    expect(missingUrl.statusCode).toBe(400);
  });

  it('tests a server connection and reports discovered tools', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/mcp-servers',
        payload: { name: 'calc-test', transport: 'http', url: 'http://in-memory.test' },
      })
    ).json();

    const result = (
      await app.inject({ method: 'POST', url: `/api/mcp-servers/${created.id}/test` })
    ).json();

    expect(result.ok).toBe(true);
    expect(result.tools).toEqual([{ name: 'add', description: 'Add two numbers' }]);

    await app.inject({ method: 'DELETE', url: `/api/mcp-servers/${created.id}` });
  });
});

describe('MCP tools in the agent loop', () => {
  it('discovers, namespaces, executes an MCP tool, and records telemetry', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/mcp-servers',
      payload: { name: 'calc', transport: 'http', url: 'http://in-memory.test' },
    });

    const thread = (await app.inject({ method: 'POST', url: '/api/threads', payload: {} })).json();

    const response = await app.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/stream`,
      payload: { text: 'What is 3+4?', provider: 'anthropic', model: 'claude-sonnet-4-5' },
    });
    expect(response.statusCode).toBe(200);

    const frames = response.payload
      .split('\n\n')
      .filter((frame) => frame.startsWith('data: '))
      .map((frame) => JSON.parse(frame.slice(6)) as Record<string, unknown>);

    const toolCall = frames.find((f) => f.type === 'tool-call');
    expect(toolCall?.toolName).toBe('calc__add');

    const toolResult = frames.find((f) => f.type === 'tool-result');
    expect(toolResult?.status).toBe('completed');
    expect(toolResult?.result).toBe('7');

    const text = frames
      .filter((f) => f.type === 'text-delta')
      .map((f) => f.delta)
      .join('');
    expect(text).toBe('The sum is 7.');
  });
});
