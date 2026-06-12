import { estimateCostUsd } from '@hyperagent/ai';
import type { Db, LlmCallRow, RunRow } from '@hyperagent/db';
import { llmCalls, messages, runs, threads, toolCalls } from '@hyperagent/db';
import type {
  ObsInsights,
  ObsModelStat,
  ObsOverview,
  ObsRunSummary,
  ObsTimeseriesPoint,
  ObsTrace,
} from '@hyperagent/shared';
import { insightsRequestSchema } from '@hyperagent/shared';
import { generateText } from 'ai';
import { desc, eq, gte, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { NotFoundError } from '../errors.js';
import type { ModelFactory } from './stream.js';
import { resolveProviderKey } from '../services/provider-keys.js';
import type { SettingsService } from '../services/settings.js';
import { providerIdSchema } from '@hyperagent/shared';

const INSIGHTS_CACHE_KEY = 'observability:insights:last';

function sinceDate(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

function sumCost(rows: LlmCallRow[]): { cost: number | null; unpriced: number } {
  let cost = 0;
  let priced = 0;
  let unpriced = 0;
  for (const row of rows) {
    const estimate = estimateCostUsd(row.provider, row.model, row.inputTokens, row.outputTokens);
    if (estimate === null) unpriced += 1;
    else {
      cost += estimate;
      priced += 1;
    }
  }
  return { cost: priced > 0 ? cost : null, unpriced };
}

function runCost(run: RunRow): number | null {
  if (!run.provider || !run.model) return null;
  return estimateCostUsd(run.provider, run.model, run.inputTokens, run.outputTokens);
}

function serializeRunSummary(run: RunRow, threadTitle: string | null): ObsRunSummary {
  return {
    id: run.id,
    threadId: run.threadId,
    threadTitle,
    status: run.status,
    provider: run.provider,
    model: run.model,
    totalTokens: run.totalTokens,
    estimatedCostUsd: runCost(run),
    durationMs:
      run.startedAt && run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
  };
}

export interface ObservabilityDeps {
  db: Db;
  settings: SettingsService;
  envSource: NodeJS.ProcessEnv;
  modelFactory: ModelFactory;
}

const daysQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });

export function registerObservabilityRoutes(app: FastifyInstance, deps: ObservabilityDeps): void {
  const { db } = deps;

  app.get('/observability/overview', async (request): Promise<ObsOverview> => {
    const { days } = daysQuerySchema.parse(request.query ?? {});
    const since = sinceDate(days);

    const runRows = await db.select().from(runs).where(gte(runs.createdAt, since));
    const callRows = await db.select().from(llmCalls).where(gte(llmCalls.createdAt, since));
    const toolRows = await db.select().from(toolCalls).where(gte(toolCalls.createdAt, since));

    const completed = runRows.filter((run) => run.status === 'completed').length;
    const failed = runRows.filter((run) => run.status === 'failed').length;
    const latencies = callRows
      .map((call) => call.latencyMs)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const { cost, unpriced } = sumCost(callRows);

    const inputTokens = callRows.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0);
    const outputTokens = callRows.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0);

    return {
      days,
      runs: runRows.length,
      completedRuns: completed,
      failedRuns: failed,
      successRate: runRows.length > 0 ? completed / runRows.length : null,
      llmCalls: callRows.length,
      toolCalls: toolRows.length,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: cost,
      unpricedCalls: unpriced,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
      errors: failed + toolRows.filter((tool) => tool.status === 'failed').length,
    };
  });

  app.get('/observability/timeseries', async (request): Promise<ObsTimeseriesPoint[]> => {
    const { days } = daysQuerySchema.parse(request.query ?? {});
    const since = sinceDate(days);
    const callRows = await db.select().from(llmCalls).where(gte(llmCalls.createdAt, since));
    const failedRuns = await db.select().from(runs).where(gte(runs.createdAt, since));

    const buckets = new Map<string, { calls: LlmCallRow[]; errors: number }>();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      buckets.set(date, { calls: [], errors: 0 });
    }
    for (const call of callRows) {
      const date = call.createdAt.toISOString().slice(0, 10);
      buckets.get(date)?.calls.push(call);
    }
    for (const run of failedRuns) {
      if (run.status !== 'failed') continue;
      const date = run.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date);
      if (bucket) bucket.errors += 1;
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => {
        const { cost } = sumCost(bucket.calls);
        return {
          date,
          llmCalls: bucket.calls.length,
          totalTokens: bucket.calls.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0),
          estimatedCostUsd: cost,
          errors: bucket.errors,
        };
      });
  });

  app.get('/observability/by-model', async (request): Promise<ObsModelStat[]> => {
    const { days } = daysQuerySchema.parse(request.query ?? {});
    const callRows = await db
      .select()
      .from(llmCalls)
      .where(gte(llmCalls.createdAt, sinceDate(days)));

    const groups = new Map<string, LlmCallRow[]>();
    for (const call of callRows) {
      const key = `${call.provider}::${call.model}`;
      const group = groups.get(key) ?? [];
      group.push(call);
      groups.set(key, group);
    }

    return [...groups.entries()]
      .map(([key, calls]) => {
        const [provider, model] = key.split('::') as [string, string];
        const latencies = calls
          .map((call) => call.latencyMs)
          .filter((value): value is number => value !== null);
        const { cost } = sumCost(calls);
        return {
          provider,
          model,
          calls: calls.length,
          inputTokens: calls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
          outputTokens: calls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
          estimatedCostUsd: cost,
          avgLatencyMs:
            latencies.length > 0
              ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
              : null,
          errors: calls.filter((call) => call.error !== null).length,
        };
      })
      .sort((a, b) => b.calls - a.calls);
  });

  app.get('/observability/runs', async (request): Promise<ObsRunSummary[]> => {
    const { days } = daysQuerySchema.parse(request.query ?? {});
    const runRows = await db
      .select()
      .from(runs)
      .where(gte(runs.createdAt, sinceDate(days)))
      .orderBy(desc(runs.createdAt))
      .limit(100);

    const threadIds = [...new Set(runRows.map((run) => run.threadId))];
    const titleRows =
      threadIds.length > 0
        ? await db
            .select({ id: threads.id, title: threads.title })
            .from(threads)
            .where(inArray(threads.id, threadIds))
        : [];
    const titles = new Map(titleRows.map((row) => [row.id, row.title]));

    return runRows.map((run) => serializeRunSummary(run, titles.get(run.threadId) ?? null));
  });

  app.get<{ Params: { id: string } }>('/observability/runs/:id/trace', async (request) => {
    const [run] = await db.select().from(runs).where(eq(runs.id, request.params.id)).limit(1);
    if (!run) throw new NotFoundError('Run', request.params.id);

    const [thread] = await db
      .select({ title: threads.title })
      .from(threads)
      .where(eq(threads.id, run.threadId))
      .limit(1);

    const llmRows = await db.select().from(llmCalls).where(eq(llmCalls.runId, run.id));
    const toolRows = await db.select().from(toolCalls).where(eq(toolCalls.runId, run.id));
    const base = (run.startedAt ?? run.createdAt).getTime();

    const spans = [
      ...llmRows.map((call) => ({
        id: call.id,
        kind: 'llm' as const,
        name: `${call.provider}/${call.model}`,
        // llm_calls rows are written at step END; reconstruct the start.
        startOffsetMs: Math.max(0, call.createdAt.getTime() - base - (call.latencyMs ?? 0)),
        durationMs: call.latencyMs,
        status: (call.error ? 'failed' : 'completed') as 'failed' | 'completed',
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        detail: call.finishReason,
      })),
      ...toolRows.map((tool) => ({
        id: tool.id,
        kind: 'tool' as const,
        name: tool.toolName,
        startOffsetMs: Math.max(0, tool.createdAt.getTime() - base - (tool.latencyMs ?? 0)),
        durationMs: tool.latencyMs,
        status: tool.status,
        inputTokens: null,
        outputTokens: null,
        detail: null,
      })),
    ].sort((a, b) => a.startOffsetMs - b.startOffsetMs);

    const trace: ObsTrace = {
      run: serializeRunSummary(run, thread?.title ?? null),
      spans,
    };
    return trace;
  });

  /** Cached result of the last insights generation. */
  app.get('/observability/insights', async (): Promise<ObsInsights | null> => {
    const cached = await deps.settings.getValue(INSIGHTS_CACHE_KEY);
    return cached ? (JSON.parse(cached) as ObsInsights) : null;
  });

  /**
   * Opt-in conversation analysis (agnost-style): samples recent conversations
   * and asks an LLM for frustration signals, topics, failure patterns, and
   * improvement suggestions. Explicit POST because it spends tokens.
   */
  app.post('/observability/insights', async (request): Promise<ObsInsights> => {
    const body = insightsRequestSchema.parse(request.body);
    const providerId = providerIdSchema.parse(body.provider);
    const days = body.days ?? 7;

    const apiKey = await resolveProviderKey(providerId, deps.envSource, deps.settings);
    const model = deps.modelFactory({ providerId, modelId: body.model, apiKey });

    const recentThreads = await db
      .select()
      .from(threads)
      .where(gte(threads.updatedAt, sinceDate(days)))
      .orderBy(desc(threads.updatedAt))
      .limit(15);

    let sample = '';
    for (const thread of recentThreads) {
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.threadId, thread.id))
        .orderBy(messages.createdAt)
        .limit(30);
      sample += `\n## Thread: ${thread.title}\n`;
      for (const row of rows) {
        const text = (row.parts as Array<{ type?: string; text?: string }>)
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join(' ');
        if (text) sample += `${row.role}: ${text.slice(0, 600)}\n`;
      }
      if (sample.length > 18_000) break;
    }

    const { text } = await generateText({
      model,
      prompt:
        'You analyze conversations between users and a self-hosted AI assistant to find ' +
        'product insights. Respond with ONLY JSON matching: {"summary": string, ' +
        '"frustrationSignals": string[], "topics": string[], "failurePatterns": string[], ' +
        '"suggestions": string[]}. Each array: 0-6 short, specific items. Look for: user ' +
        'frustration or repeated rephrasing, failed tool calls, unmet intents, recurring ' +
        `topics, and concrete prompt/tooling improvements.\n\nConversations:\n${sample.slice(0, 18_000)}`,
    });

    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const parsed = JSON.parse((fenced ? fenced[1]! : text).trim()) as Omit<
      ObsInsights,
      'generatedAt' | 'analyzedThreads'
    >;

    const insights: ObsInsights = {
      generatedAt: new Date().toISOString(),
      analyzedThreads: recentThreads.length,
      summary: parsed.summary ?? '',
      frustrationSignals: parsed.frustrationSignals ?? [],
      topics: parsed.topics ?? [],
      failurePatterns: parsed.failurePatterns ?? [],
      suggestions: parsed.suggestions ?? [],
    };

    await deps.settings.upsert(INSIGHTS_CACHE_KEY, JSON.stringify(insights), false);
    return insights;
  });
}
