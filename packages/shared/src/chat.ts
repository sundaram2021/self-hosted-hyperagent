import { z } from 'zod';

export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/**
 * Message content is stored as an ordered list of typed parts, mirroring the
 * AI SDK UIMessage shape so Phase 3 (agent loop) can persist tool calls,
 * reasoning, and files without a schema migration.
 */
export const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
});
export type TextPart = z.infer<typeof textPartSchema>;

/**
 * Forward-compatible escape hatch: parts we don't know yet (tool calls,
 * reasoning, files…) are preserved as-is. Text parts must use the strict
 * schema above.
 */
export const genericPartSchema = z
  .object({ type: z.string().min(1) })
  .catchall(z.unknown())
  .refine((part) => part.type !== 'text', {
    message: 'text parts must match the text part schema',
  });

export const messagePartSchema = z.union([textPartSchema, genericPartSchema]);
export type MessagePart = z.infer<typeof messagePartSchema>;

export const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: messageRoleSchema,
  parts: z.array(messagePartSchema).min(1),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const threadSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Thread = z.infer<typeof threadSchema>;

export const runStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  status: runStatusSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type Run = z.infer<typeof runSchema>;

// --- Request bodies ---

export const createThreadBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type CreateThreadBody = z.infer<typeof createThreadBodySchema>;

export const updateThreadBodySchema = z.object({
  title: z.string().min(1).max(200),
});
export type UpdateThreadBody = z.infer<typeof updateThreadBodySchema>;

/** Until the agent loop lands (Phase 3), clients may only append user text messages. */
export const createMessageBodySchema = z.object({
  role: z.literal('user'),
  parts: z.array(textPartSchema).min(1),
});
export type CreateMessageBody = z.infer<typeof createMessageBodySchema>;
