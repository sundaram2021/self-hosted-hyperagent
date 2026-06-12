import { z } from 'zod';

import { providerIdSchema } from './providers.js';

/** Token usage as reported by providers; null when a provider omits a figure. */
export const usageSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
});
export type Usage = z.infer<typeof usageSchema>;

/**
 * The SSE event protocol between the agent server and the web client.
 * Every event is one `data: <json>\n\n` frame.
 */
export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run-start'),
    runId: z.string(),
    provider: z.string(),
    model: z.string(),
  }),
  z.object({ type: z.literal('text-delta'), delta: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    toolName: z.string(),
    result: z.unknown(),
    status: z.enum(['completed', 'failed']),
    latencyMs: z.number().nullable(),
  }),
  z.object({ type: z.literal('step-finish'), usage: usageSchema }),
  z.object({
    type: z.literal('run-finish'),
    runId: z.string(),
    finishReason: z.string(),
    usage: usageSchema,
  }),
  z.object({
    type: z.literal('run-error'),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type AgentStreamEvent = z.infer<typeof streamEventSchema>;

/** POST /api/threads/:id/stream request body. */
export const streamRequestSchema = z.object({
  text: z.string().min(1).max(32_000),
  provider: providerIdSchema,
  model: z.string().min(1).max(200),
});
export type StreamRequest = z.infer<typeof streamRequestSchema>;
