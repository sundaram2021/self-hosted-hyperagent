import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export * from './schema.js';
export { MIGRATIONS, runMigrations, type Migration } from './migrations.js';

/**
 * The application-wide database handle type. Tests construct a structurally
 * identical PGlite-backed instance and cast to this type (the drizzle query
 * API is the same across pg drivers).
 */
export type Db = PostgresJsDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Db;
  close: () => Promise<void>;
}

/** Create a postgres.js-backed drizzle client for the given connection string. */
export function createDb(connectionString: string): DatabaseHandle {
  const client = postgres(connectionString, {
    max: 10,
    // Suppress NOTICE chatter (e.g. from IF NOT EXISTS) in logs.
    onnotice: () => {},
  });

  const db = drizzle(client, { schema });

  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

export { schema };
