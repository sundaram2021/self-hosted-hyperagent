import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@hyperagent/db';
import { runMigrations, schema } from '@hyperagent/db';
import { drizzle } from 'drizzle-orm/pglite';

import type { Env } from './env.js';
import { loadEnv } from './env.js';

/**
 * In-memory Postgres (PGlite) with all migrations applied. Structurally
 * identical drizzle API to the postgres.js client — see Db docs in
 * @hyperagent/db.
 */
export async function makeTestDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await runMigrations(db);
  return db;
}

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...loadEnv({}),
    LOG_LEVEL: 'fatal' as const,
    APP_SECRET: 'test-secret-0123456789abcdef',
    ...overrides,
  };
}
