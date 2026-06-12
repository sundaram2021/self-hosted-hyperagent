import { randomUUID } from 'node:crypto';

import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const threads = pgTable('threads', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  title: text('title').notNull().default('New thread'),
  /** Last provider/model used in this thread (preselects the model picker). */
  lastProvider: text('last_provider'),
  lastModel: text('last_model'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    /** Ordered message parts (text, tool calls; later: reasoning, files). */
    parts: jsonb('parts').notNull().$type<unknown[]>(),
    /** Run that produced this message (assistant messages only). */
    runId: text('run_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('messages_thread_created_idx').on(table.threadId, table.createdAt)],
);

export const runs = pgTable(
  'runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    provider: text('provider'),
    model: text('model'),
    error: text('error'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [index('runs_thread_created_idx').on(table.threadId, table.createdAt)],
);

/**
 * One row per model invocation (a "step" in a multi-step agent run).
 * The base telemetry that Phase 9's observability dashboards aggregate.
 */
export const llmCalls = pgTable(
  'llm_calls',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    latencyMs: integer('latency_ms'),
    finishReason: text('finish_reason'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('llm_calls_run_idx').on(table.runId),
    index('llm_calls_created_idx').on(table.createdAt),
  ],
);

/** One row per tool invocation inside a run. */
export const toolCalls = pgTable(
  'tool_calls',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    toolName: text('tool_name').notNull(),
    args: jsonb('args'),
    result: jsonb('result'),
    status: text('status', { enum: ['completed', 'failed'] })
      .notNull()
      .default('completed'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('tool_calls_run_idx').on(table.runId),
    index('tool_calls_created_idx').on(table.createdAt),
  ],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  /** Plaintext for regular settings; an `enc:v1:…` payload when encrypted. */
  value: text('value').notNull(),
  encrypted: boolean('encrypted').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type ThreadRow = typeof threads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type LlmCallRow = typeof llmCalls.$inferSelect;
export type ToolCallRow = typeof toolCalls.$inferSelect;
