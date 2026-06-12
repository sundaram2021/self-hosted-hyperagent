import { createDb, runMigrations } from '@hyperagent/db';

import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const { db, close: closeDb } = createDb(env.DATABASE_URL);

if (env.MIGRATE_ON_START) {
  try {
    const applied = await runMigrations(db);
    if (applied.length > 0) {
      console.log(`Applied migrations: ${applied.join(', ')}`);
    }
  } catch (error) {
    console.error(
      'Failed to run database migrations. Is Postgres up? (docker compose up -d postgres)',
    );
    console.error(error);
    process.exit(1);
  }
}

const app = await buildApp(env, { db });

try {
  await app.listen({ port: env.SERVER_PORT, host: env.SERVER_HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'received shutdown signal, closing server');
  await app.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', (signal) => void shutdown(signal));
process.on('SIGTERM', (signal) => void shutdown(signal));
