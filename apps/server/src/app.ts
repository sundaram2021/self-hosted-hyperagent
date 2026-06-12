import cors from '@fastify/cors';
import { createLanguageModel } from '@hyperagent/ai';
import type { Db } from '@hyperagent/db';
import { API_ERROR_CODES, API_PATHS, healthResponseSchema, SERVICES } from '@hyperagent/shared';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import type { Env } from './env.js';
import { AppSecretMissingError, NotFoundError, ProviderKeyMissingError } from './errors.js';
import { registerProviderRoutes } from './routes/providers.js';
import { registerSettingRoutes } from './routes/settings.js';
import type { ModelFactory } from './routes/stream.js';
import { registerStreamRoutes } from './routes/stream.js';
import { registerThreadRoutes } from './routes/threads.js';
import { SettingsService } from './services/settings.js';

export const SERVER_VERSION = '0.3.0';

export interface AppDeps {
  db: Db;
  /** Overridable in tests to exercise env-vs-database key resolution. */
  envSource?: NodeJS.ProcessEnv;
  /** Overridable in tests to inject mock language models. */
  modelFactory?: ModelFactory;
}

/**
 * Build the Fastify application. Kept separate from the listener so tests can
 * exercise routes via `app.inject` without binding a port.
 */
export async function buildApp(env: Env, deps: AppDeps) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      return reply.code(400).send({ error: { message, code: API_ERROR_CODES.validation } });
    }

    if (error instanceof NotFoundError) {
      return reply
        .code(404)
        .send({ error: { message: error.message, code: API_ERROR_CODES.notFound } });
    }

    if (error instanceof AppSecretMissingError) {
      return reply
        .code(400)
        .send({ error: { message: error.message, code: API_ERROR_CODES.appSecretMissing } });
    }

    if (error instanceof ProviderKeyMissingError) {
      return reply
        .code(400)
        .send({ error: { message: error.message, code: API_ERROR_CODES.providerKeyMissing } });
    }

    request.log.error(error);
    return reply
      .code(500)
      .send({ error: { message: 'Internal server error', code: API_ERROR_CODES.internal } });
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

  const settingsService = new SettingsService(deps.db, env.APP_SECRET);
  const envSource = deps.envSource ?? process.env;
  const modelFactory: ModelFactory =
    deps.modelFactory ??
    (({ providerId, modelId, apiKey }) => createLanguageModel({ providerId, modelId, apiKey }));

  await app.register(
    async (api) => {
      registerThreadRoutes(api, deps.db);
      registerSettingRoutes(api, settingsService);
      registerProviderRoutes(api, settingsService, envSource);
      registerStreamRoutes(api, {
        db: deps.db,
        env,
        settings: settingsService,
        envSource,
        modelFactory,
      });
    },
    { prefix: '/api' },
  );

  return app;
}
