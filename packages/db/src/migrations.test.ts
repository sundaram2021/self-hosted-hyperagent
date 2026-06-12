import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

import type { Db } from './index.js';
import { runMigrations } from './migrations.js';
import * as schema from './schema.js';

async function makeDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  // Structurally identical query API; see Db docs in index.ts.
  return db as unknown as Db;
}

describe('runMigrations', () => {
  it('applies pending migrations once and is idempotent', async () => {
    const db = await makeDb();

    const first = await runMigrations(db);
    expect(first).toContain('0001_initial');

    const second = await runMigrations(db);
    expect(second).toEqual([]);
  });

  it('produces a schema drizzle can query (drift guard)', async () => {
    const db = await makeDb();
    await runMigrations(db);

    const [thread] = await db.insert(schema.threads).values({ title: 'Test' }).returning();
    expect(thread).toBeDefined();
    expect(thread?.title).toBe('Test');

    const [message] = await db
      .insert(schema.messages)
      .values({
        threadId: thread!.id,
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      })
      .returning();
    expect(message?.parts).toEqual([{ type: 'text', text: 'hello' }]);

    const [run] = await db.insert(schema.runs).values({ threadId: thread!.id }).returning();
    expect(run?.status).toBe('queued');

    const [llmCall] = await db
      .insert(schema.llmCalls)
      .values({
        runId: run!.id,
        threadId: thread!.id,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        latencyMs: 420,
        finishReason: 'stop',
      })
      .returning();
    expect(llmCall?.totalTokens).toBe(15);

    const [toolCall] = await db
      .insert(schema.toolCalls)
      .values({
        runId: run!.id,
        threadId: thread!.id,
        toolName: 'execute_code',
        args: { language: 'python', code: 'print(1)' },
        result: { stdout: '1\n' },
        latencyMs: 88,
      })
      .returning();
    expect(toolCall?.status).toBe('completed');

    await db.insert(schema.settings).values({ key: 'theme', value: 'dark', encrypted: false });

    const [mcpServer] = await db
      .insert(schema.mcpServers)
      .values({ name: 'calc', transport: 'stdio', command: 'npx', args: ['-y', 'calc-mcp'] })
      .returning();
    expect(mcpServer?.enabled).toBe(true);

    const [skill] = await db
      .insert(schema.skills)
      .values({
        name: 'pdf-tools',
        source: 'https://github.com/acme/skills/tree/main/pdf-tools',
        content: '# PDF',
        files: [{ path: 'scripts/extract.py', content: 'print(1)' }],
      })
      .returning();
    expect(skill?.files).toHaveLength(1);

    // Cascade: deleting the thread removes messages, runs, and run telemetry.
    await db.delete(schema.threads).where(eq(schema.threads.id, thread!.id));
    const remainingMessages = await db.select().from(schema.messages);
    const remainingRuns = await db.select().from(schema.runs);
    const remainingLlmCalls = await db.select().from(schema.llmCalls);
    const remainingToolCalls = await db.select().from(schema.toolCalls);
    expect(remainingMessages).toEqual([]);
    expect(remainingRuns).toEqual([]);
    expect(remainingLlmCalls).toEqual([]);
    expect(remainingToolCalls).toEqual([]);

    // Settings survive (no FK to threads).
    const remainingSettings = await db.select().from(schema.settings);
    expect(remainingSettings).toHaveLength(1);
  });

  it('rejects invalid roles via the CHECK constraint', async () => {
    const db = await makeDb();
    await runMigrations(db);

    const [thread] = await db.insert(schema.threads).values({}).returning();

    await expect(
      db.insert(schema.messages).values({
        threadId: thread!.id,
        // Deliberately violating the role enum to exercise the CHECK constraint.
        role: 'robot' as 'user',
        parts: [],
      }),
    ).rejects.toThrow();
  });
});
