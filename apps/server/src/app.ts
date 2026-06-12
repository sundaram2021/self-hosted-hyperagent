import cors from '@fastify/cors';
import { API_PATHS, healthResponseSchema, SERVICES } from '@hyperagent/shared';
import Fastify from 'fastify';

import type { Env } from './env.js';

export const SERVER_VERSION = '0.1.0';

/**
 * Build the Fastify application. Kept separate from the listener so tests can
 * exercise routes via `app.inject` without binding a port.
 */
export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
  });

  app.get(API_PATHS.health, async () =>
    healthResponseSchema.parse({
      status: 'ok',
      service: SERVICES.server,
      version: SERVER_VERSION,
      uptimeSeconds: Number(process.uptime().toFixed(3)),
      timestamp: new Date().toISOString(),
    }),
  );

  return app;
}
