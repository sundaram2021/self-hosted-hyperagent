import { messages } from '@hyperagent/db';
import type { AgentStreamEvent } from '@hyperagent/shared';
import { streamEventSchema } from '@hyperagent/shared';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { makeTestDb, makeTestEnv } from '../test-utils.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof makeTestDb>>;

function mockTextModel() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'Hello from the mock' },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop' as const, raw: undefined },
            usage: {
              inputTokens: {
                total: 3,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 4, text: 4, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

function parseSse(payload: string): AgentStreamEvent[] {
  return payload
    .split('\n\n')
    .filter((frame) => frame.startsWith('data: '))
    .map((frame) => streamEventSchema.parse(JSON.parse(frame.slice('data: '.length))));
}

beforeAll(async () => {
  db = await makeTestDb();
  app = await buildApp(makeTestEnv(), {
    db,
    envSource: { ANTHROPIC_API_KEY: 'test-key' },
    modelFactory: () => mockTextModel(),
  });
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/models', () => {
  it('returns the catalog for all 11 providers with key sources', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/models' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveLength(11);

    const anthropic = body.find((p: { id: string }) => p.id === 'anthropic');
    expect(anthropic.keySource).toBe('env');
    expect(anthropic.models.length).toBeGreaterThan(0);

    const openai = body.find((p: { id: string }) => p.id === 'openai');
    expect(openai.keySource).toBe('none');
  });
});

describe('POST /api/threads/:id/stream', () => {
  it('streams SSE events and persists user + assistant messages', async () => {
    const thread = (await app.inject({ method: 'POST', url: '/api/threads', payload: {} })).json();

    const response = await app.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/stream`,
      payload: { text: 'Say hi', provider: 'anthropic', model: 'claude-sonnet-4-5' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSse(response.payload);
    expect(events[0]?.type).toBe('run-start');
    const text = events
      .filter(
        (e): e is Extract<AgentStreamEvent, { type: 'text-delta' }> => e.type === 'text-delta',
      )
      .map((e) => e.delta)
      .join('');
    expect(text).toBe('Hello from the mock');
    expect(events.at(-1)?.type).toBe('run-finish');

    const stored = (
      await app.inject({ method: 'GET', url: `/api/threads/${thread.id}/messages` })
    ).json();
    expect(stored).toHaveLength(2);
    expect(stored[0].role).toBe('user');
    expect(stored[1].role).toBe('assistant');

    const runsList = (
      await app.inject({ method: 'GET', url: `/api/threads/${thread.id}/runs` })
    ).json();
    expect(runsList).toHaveLength(1);
    expect(runsList[0].status).toBe('completed');
  });

  it('400s with PROVIDER_KEY_MISSING before streaming when no key exists', async () => {
    const thread = (await app.inject({ method: 'POST', url: '/api/threads', payload: {} })).json();

    const response = await app.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/stream`,
      payload: { text: 'Say hi', provider: 'openai', model: 'gpt-5' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('PROVIDER_KEY_MISSING');

    // No user message should be persisted when configuration fails upfront.
    const stored = await db.select().from(messages);
    const forThread = stored.filter((m) => m.threadId === thread.id);
    expect(forThread).toHaveLength(0);
  });

  it('rejects unknown providers with validation errors', async () => {
    const thread = (await app.inject({ method: 'POST', url: '/api/threads', payload: {} })).json();

    const response = await app.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/stream`,
      payload: { text: 'Say hi', provider: 'skynet', model: 'T-800' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION');
  });

  it('404s for unknown threads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/threads/nope/stream',
      payload: { text: 'Say hi', provider: 'anthropic', model: 'claude-sonnet-4-5' },
    });
    expect(response.statusCode).toBe(404);
  });
});
