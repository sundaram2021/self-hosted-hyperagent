import { randomUUID } from 'node:crypto';

import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const threads = pgTable('threads', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  title: text('title').notNull().default('New thread'),
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
    /** Ordered message parts (text, and later: tool calls, reasoning, files). */
    parts: jsonb('parts').notNull().$type<unknown[]>(),
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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [index('runs_thread_created_idx').on(table.threadId, table.createdAt)],
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
