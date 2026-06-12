import { healthResponseSchema } from '@hyperagent/shared';
import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv({});
const app = await buildApp({ ...env, LOG_LEVEL: 'fatal' });

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns a valid health payload', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);

    const body = healthResponseSchema.parse(response.json());
    expect(body.service).toBe('server');
    expect(body.status).toBe('ok');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe('loadEnv', () => {
  it('applies defaults when variables are missing', () => {
    expect(loadEnv({})).toMatchObject({
      SERVER_PORT: 8787,
      SERVER_HOST: '127.0.0.1',
      WEB_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'info',
    });
  });

  it('coerces numeric strings for the port', () => {
    expect(loadEnv({ SERVER_PORT: '9000' }).SERVER_PORT).toBe(9000);
  });
});
