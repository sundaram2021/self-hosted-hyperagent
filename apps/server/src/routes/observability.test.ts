import { llmCalls, messages, runs, threads, toolCalls } from '@hyperagent/db';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { makeTestDb, makeTestEnv } from '../test-utils.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof makeTestDb>>;
let runId: string;

function insightsModel() {
  const payload = JSON.stringify({
    summary: 'Users mostly ask about deployment.',
    frustrationSignals: ['Repeated rephrasing about Docker'],
    topics: ['deployment', 'docker'],
    failurePatterns: ['sandbox timeouts'],
    suggestions: ['Document compose setup'],
  });
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: payload }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: { total: 50, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 30, text: 30, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async () => ({ stream: simulateReadableStream({ chunks: [] }) }),
  });
}

beforeAll(async () => {
  db = await makeTestDb();
  app = await buildApp(makeTestEnv(), {
    db,
    envSource: { ANTHROPIC_API_KEY: 'test-key' },
    modelFactory: () => insightsModel(),
    embedder: null,
  });

  // Seed: one thread, two runs (1 completed, 1 failed), priced + unpriced calls.
  const [thread] = await db.insert(threads).values({ title: 'Deploy help' }).returning();
  await db.insert(messages).values({
    threadId: thread!.id,
    role: 'user',
    parts: [{ type: 'text', text: 'How do I deploy with Docker?' }],
  });

  const started = new Date(Date.now() - 60_000);
  const finished = new Date(started.getTime() + 2_000);
  const [completedRun] = await db
    .insert(runs)
    .values({
      threadId: thread!.id,
      status: 'completed',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      startedAt: started,
      finishedAt: finished,
    })
    .returning();
  runId = completedRun!.id;

  await db.insert(runs).values({
    threadId: thread!.id,
    status: 'failed',
    provider: 'openai',
    model: 'gpt-5',
    error: 'boom',
  });

  await db.insert(llmCalls).values([
    {
      runId,
      threadId: thread!.id,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      latencyMs: 100,
      finishReason: 'stop',
    },
    {
      runId,
      threadId: thread!.id,
      provider: 'kimi',
      model: 'mystery-model',
      inputTokens: 10,
      outputTokens: 10,
      totalTokens: 20,
      latencyMs: 300,
      finishReason: 'stop',
    },
  ]);

  await db.insert(toolCalls).values({
    runId,
    threadId: thread!.id,
    toolName: 'execute_code',
    args: { language: 'python', code: 'print(1)' },
    result: { stdout: '1\n' },
    status: 'completed',
    latencyMs: 50,
  });
});

describe('observability aggregation', () => {
  it('overview computes totals, success rate, cost, and percentiles', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/observability/overview' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.runs).toBe(2);
    expect(body.completedRuns).toBe(1);
    expect(body.failedRuns).toBe(1);
    expect(body.successRate).toBeCloseTo(0.5);
    expect(body.llmCalls).toBe(2);
    expect(body.toolCalls).toBe(1);
    expect(body.totalTokens).toBe(2_000_020);
    // claude-sonnet-4-5: $3/M input + $15/M output → 1M+1M tokens = $18.
    expect(body.estimatedCostUsd).toBeCloseTo(18);
    expect(body.unpricedCalls).toBe(1);
    expect(body.latencyP50Ms).toBe(100);
    expect(body.latencyP95Ms).toBe(300);
    expect(body.errors).toBe(1);
  });

  it('by-model groups calls with pricing where known', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/observability/by-model' })).json();

    expect(body).toHaveLength(2);
    const sonnet = body.find((row: { model: string }) => row.model === 'claude-sonnet-4-5');
    expect(sonnet.calls).toBe(1);
    expect(sonnet.estimatedCostUsd).toBeCloseTo(18);

    const mystery = body.find((row: { model: string }) => row.model === 'mystery-model');
    expect(mystery.estimatedCostUsd).toBeNull();
  });

  it('timeseries buckets by day', async () => {
    const body = (
      await app.inject({ method: 'GET', url: '/api/observability/timeseries?days=3' })
    ).json();

    expect(body).toHaveLength(3);
    const today = body.at(-1);
    expect(today.llmCalls).toBe(2);
    expect(today.errors).toBe(1);
  });

  it('runs list includes thread titles and computed cost', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/observability/runs' })).json();
    expect(body).toHaveLength(2);
    expect(body.every((row: { threadTitle: string }) => row.threadTitle === 'Deploy help')).toBe(
      true,
    );
    const completed = body.find((row: { status: string }) => row.status === 'completed');
    expect(completed.estimatedCostUsd).toBeCloseTo(18);
    expect(completed.durationMs).toBe(2000);
  });

  it('trace returns ordered spans for the waterfall', async () => {
    const body = (
      await app.inject({ method: 'GET', url: `/api/observability/runs/${runId}/trace` })
    ).json();

    expect(body.run.id).toBe(runId);
    expect(body.spans).toHaveLength(3);
    expect(body.spans.map((span: { kind: string }) => span.kind).sort()).toEqual([
      'llm',
      'llm',
      'tool',
    ]);
    for (const span of body.spans) {
      expect(span.startOffsetMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('404s for unknown run traces', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/observability/runs/nope/trace',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('insights (opt-in LLM analysis)', () => {
  it('starts with no cached insights', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/observability/insights' });
    expect(response.statusCode).toBe(200);
    expect(response.payload === '' || response.json() === null).toBe(true);
  });

  it('generates, returns, and caches insights', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/observability/insights',
      payload: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.summary).toContain('deployment');
    expect(body.frustrationSignals).toHaveLength(1);
    expect(body.analyzedThreads).toBe(1);

    const cached = (await app.inject({ method: 'GET', url: '/api/observability/insights' })).json();
    expect(cached.summary).toBe(body.summary);
  });

  it('400s without a provider key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/observability/insights',
      payload: { provider: 'mistral', model: 'mistral-small-latest' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('PROVIDER_KEY_MISSING');
  });
});
