import { sql } from 'drizzle-orm';

import type { Db } from './index.js';

/**
 * Migrations are embedded as ordered statement lists rather than .sql files on
 * disk: the package then works identically from source (vitest), from dist
 * (server runtime), and inside containers — no asset copying, no path
 * resolution. Each migration runs in a single transaction and is recorded in
 * the `_migrations` table.
 *
 * Rules:
 * - NEVER edit an applied migration; append a new one.
 * - Keep statements driver-agnostic (executed one at a time, works on both
 *   postgres.js and PGlite).
 * - `src/schema.ts` must always describe the end state of all migrations;
 *   the integration test in migrations.test.ts exercises drizzle queries
 *   against a migrated database to catch drift.
 */
export interface Migration {
  id: string;
  statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0001_initial',
    statements: [
      `CREATE TABLE threads (
        id text PRIMARY KEY,
        title text NOT NULL DEFAULT 'New thread',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE messages (
        id text PRIMARY KEY,
        thread_id text NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        parts jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX messages_thread_created_idx ON messages (thread_id, created_at)`,
      `CREATE TABLE runs (
        id text PRIMARY KEY,
        thread_id text NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
        provider text,
        model text,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz,
        finished_at timestamptz
      )`,
      `CREATE INDEX runs_thread_created_idx ON runs (thread_id, created_at)`,
      `CREATE TABLE settings (
        key text PRIMARY KEY,
        value text NOT NULL,
        encrypted boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    ],
  },
  {
    id: '0002_agent_loop_telemetry',
    statements: [
      `ALTER TABLE threads ADD COLUMN last_provider text`,
      `ALTER TABLE threads ADD COLUMN last_model text`,
      `ALTER TABLE messages ADD COLUMN run_id text`,
      `ALTER TABLE runs ADD COLUMN input_tokens integer`,
      `ALTER TABLE runs ADD COLUMN output_tokens integer`,
      `ALTER TABLE runs ADD COLUMN total_tokens integer`,
      `CREATE TABLE llm_calls (
        id text PRIMARY KEY,
        run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        thread_id text NOT NULL,
        provider text NOT NULL,
        model text NOT NULL,
        input_tokens integer,
        output_tokens integer,
        total_tokens integer,
        latency_ms integer,
        finish_reason text,
        error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX llm_calls_run_idx ON llm_calls (run_id)`,
      `CREATE INDEX llm_calls_created_idx ON llm_calls (created_at)`,
      `CREATE TABLE tool_calls (
        id text PRIMARY KEY,
        run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        thread_id text NOT NULL,
        tool_name text NOT NULL,
        args jsonb,
        result jsonb,
        status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
        latency_ms integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX tool_calls_run_idx ON tool_calls (run_id)`,
      `CREATE INDEX tool_calls_created_idx ON tool_calls (created_at)`,
    ],
  },
  {
    id: '0003_mcp_and_skills',
    statements: [
      `CREATE TABLE mcp_servers (
        id text PRIMARY KEY,
        name text NOT NULL UNIQUE,
        transport text NOT NULL CHECK (transport IN ('stdio', 'http', 'sse')),
        command text,
        args jsonb,
        env text,
        url text,
        headers text,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE skills (
        id text PRIMARY KEY,
        name text NOT NULL UNIQUE,
        description text NOT NULL DEFAULT '',
        source text NOT NULL,
        content text NOT NULL,
        files jsonb NOT NULL DEFAULT '[]'::jsonb,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    ],
  },
];

interface RowsResult {
  rows?: unknown[];
}

/** postgres.js returns an array; PGlite returns `{ rows }`. Normalize. */
function toRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as RowsResult).rows)) {
    return (result as Required<RowsResult>).rows;
  }
  return [];
}

/**
 * Apply all pending migrations. Returns the ids that were newly applied.
 * Safe to run concurrently-ish for a single self-hosted instance; each
 * migration is transactional and re-application is guarded by the tracking
 * table's primary key.
 */
export async function runMigrations(db: Db): Promise<string[]> {
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS _migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    ),
  );

  const appliedRows = toRows(await db.execute(sql.raw(`SELECT id FROM _migrations`)));
  const applied = new Set(appliedRows.map((row) => (row as { id: string }).id));

  const newlyApplied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    await db.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(sql`INSERT INTO _migrations (id) VALUES (${migration.id})`);
    });

    newlyApplied.push(migration.id);
  }

  return newlyApplied;
}
