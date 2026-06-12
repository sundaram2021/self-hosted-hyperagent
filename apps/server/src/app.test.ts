import { healthResponseSchema } from '@hyperagent/shared';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { makeTestDb, makeTestEnv } from './test-utils.js';

describe('GET /health', () => {
  it('returns a valid health payload', async () => {
    const app = await buildApp(makeTestEnv(), { db: await makeTestDb() });

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);

    const body = healthResponseSchema.parse(response.json());
    expect(body.service).toBe('server');
    expect(body.status).toBe('ok');

    await app.close();
  });
});

describe('loadEnv', () => {
  it('applies defaults when variables are missing', () => {
    expect(loadEnv({})).toMatchObject({
      SERVER_PORT: 8787,
      SERVER_HOST: '127.0.0.1',
      WEB_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'info',
      MIGRATE_ON_START: true,
    });
    expect(loadEnv({}).DATABASE_URL).toContain('postgres://');
  });

  it('coerces numeric strings and boolean flags', () => {
    const env = loadEnv({ SERVER_PORT: '9000', MIGRATE_ON_START: 'false' });
    expect(env.SERVER_PORT).toBe(9000);
    expect(env.MIGRATE_ON_START).toBe(false);
  });
});
