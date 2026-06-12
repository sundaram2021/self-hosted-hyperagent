import { z } from 'zod';

/** GET /api/observability/overview */
export const obsOverviewSchema = z.object({
  days: z.number(),
  runs: z.number(),
  completedRuns: z.number(),
  failedRuns: z.number(),
  successRate: z.number().nullable(),
  llmCalls: z.number(),
  toolCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  /** Null when no priced calls exist; partial when some models lack pricing. */
  estimatedCostUsd: z.number().nullable(),
  unpricedCalls: z.number(),
  latencyP50Ms: z.number().nullable(),
  latencyP95Ms: z.number().nullable(),
  errors: z.number(),
});
export type ObsOverview = z.infer<typeof obsOverviewSchema>;

/** GET /api/observability/timeseries */
export const obsTimeseriesPointSchema = z.object({
  date: z.string(),
  llmCalls: z.number(),
  totalTokens: z.number(),
  estimatedCostUsd: z.number().nullable(),
  errors: z.number(),
});
export type ObsTimeseriesPoint = z.infer<typeof obsTimeseriesPointSchema>;

/** GET /api/observability/by-model */
export const obsModelStatSchema = z.object({
  provider: z.string(),
  model: z.string(),
  calls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCostUsd: z.number().nullable(),
  avgLatencyMs: z.number().nullable(),
  errors: z.number(),
});
export type ObsModelStat = z.infer<typeof obsModelStatSchema>;

/** GET /api/observability/runs */
export const obsRunSummarySchema = z.object({
  id: z.string(),
  threadId: z.string(),
  threadTitle: z.string().nullable(),
  status: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  totalTokens: z.number().nullable(),
  estimatedCostUsd: z.number().nullable(),
  durationMs: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type ObsRunSummary = z.infer<typeof obsRunSummarySchema>;

/** GET /api/observability/runs/:id/trace — waterfall data. */
export const obsSpanSchema = z.object({
  id: z.string(),
  kind: z.enum(['llm', 'tool']),
  name: z.string(),
  startOffsetMs: z.number(),
  durationMs: z.number().nullable(),
  status: z.enum(['completed', 'failed']),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  detail: z.string().nullable(),
});

export const obsTraceSchema = z.object({
  run: obsRunSummarySchema,
  spans: z.array(obsSpanSchema),
});
export type ObsTrace = z.infer<typeof obsTraceSchema>;

/** Conversation insights (opt-in LLM analysis — spends tokens). */
export const insightsRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  days: z.number().int().min(1).max(90).optional(),
});
export type InsightsRequest = z.infer<typeof insightsRequestSchema>;

export const obsInsightsSchema = z.object({
  generatedAt: z.string(),
  analyzedThreads: z.number(),
  summary: z.string(),
  frustrationSignals: z.array(z.string()),
  topics: z.array(z.string()),
  failurePatterns: z.array(z.string()),
  suggestions: z.array(z.string()),
});
export type ObsInsights = z.infer<typeof obsInsightsSchema>;
