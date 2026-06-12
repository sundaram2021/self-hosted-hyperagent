import { randomUUID } from 'node:crypto';

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  vector,
} from 'drizzle-orm/pg-core';

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

/**
 * Registered MCP servers. `env` and `headers` may contain secrets, so they
 * are stored as JSON serialized through the secret-encryption layer
 * (enc:v1 payloads when APP_SECRET is configured).
 */
export const mcpServers = pgTable('mcp_servers', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text('name').notNull().unique(),
  transport: text('transport', { enum: ['stdio', 'http', 'sse'] }).notNull(),
  command: text('command'),
  args: jsonb('args').$type<string[]>(),
  env: text('env'),
  url: text('url'),
  headers: text('headers'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/** Installed Agent Skills (SKILL.md format) with bundled files inline. */
export const skills = pgTable('skills', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  source: text('source').notNull(),
  content: text('content').notNull(),
  files: jsonb('files').notNull().default([]).$type<Array<{ path: string; content: string }>>(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * Long-term memory store (supermemory-style). The `tsv` full-text column is a
 * generated column managed in SQL (migration 0004) and queried via raw
 * fragments; the embedding uses pgvector with cosine HNSW indexing.
 */
export const memories = pgTable(
  'memories',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    content: text('content').notNull(),
    category: text('category', { enum: ['fact', 'preference', 'episode', 'profile'] })
      .notNull()
      .default('fact'),
    importance: real('importance').notNull().default(0.5),
    embedding: vector('embedding', { dimensions: 1536 }),
    sourceThreadId: text('source_thread_id'),
    sourceRunId: text('source_run_id'),
    /** Set when a newer memory replaces this one (relation: updates). */
    supersededBy: text('superseded_by'),
    accessCount: integer('access_count').notNull().default(0),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('memories_created_idx').on(table.createdAt)],
);

/** Knowledge-graph edges between memories: updates / extends / derives. */
export const memoryRelations = pgTable(
  'memory_relations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    fromId: text('from_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    toId: text('to_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    relation: text('relation', { enum: ['updates', 'extends', 'derives'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('memory_relations_from_idx').on(table.fromId),
    index('memory_relations_to_idx').on(table.toId),
  ],
);

export type ThreadRow = typeof threads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type LlmCallRow = typeof llmCalls.$inferSelect;
export type ToolCallRow = typeof toolCalls.$inferSelect;
export type McpServerRow = typeof mcpServers.$inferSelect;
export type SkillRow = typeof skills.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type MemoryRelationRow = typeof memoryRelations.$inferSelect;
