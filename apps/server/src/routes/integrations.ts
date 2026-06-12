import type { IntegrationStatus, KeySource } from '@hyperagent/shared';
import {
  INTEGRATIONS,
  integrationIdSchema,
  integrationKeySettingKey,
  saveIntegrationKeyBodySchema,
} from '@hyperagent/shared';
import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors.js';
import type { SettingsService } from '../services/settings.js';

/** Non-LLM integration keys (Exa). Same env-first resolution as providers. */
export function registerIntegrationRoutes(
  app: FastifyInstance,
  settings: SettingsService,
  envSource: NodeJS.ProcessEnv,
): void {
  app.get('/integrations', async (): Promise<IntegrationStatus[]> => {
    const statuses: IntegrationStatus[] = [];
    for (const integration of INTEGRATIONS) {
      let keySource: KeySource = 'none';
      if (envSource[integration.keyEnvVar]) {
        keySource = 'env';
      } else if (await settings.has(integrationKeySettingKey(integration.id))) {
        keySource = 'database';
      }
      statuses.push({ ...integration, keySource });
    }
    return statuses;
  });

  app.put<{ Params: { id: string } }>('/integrations/:id/key', async (request, reply) => {
    const id = integrationIdSchema.parse(request.params.id);
    const body = saveIntegrationKeyBodySchema.parse(request.body);
    await settings.upsert(integrationKeySettingKey(id), body.apiKey, true);
    reply.code(204);
    return null;
  });

  app.delete<{ Params: { id: string } }>('/integrations/:id/key', async (request, reply) => {
    const id = integrationIdSchema.parse(request.params.id);
    const deleted = await settings.delete(integrationKeySettingKey(id));
    if (!deleted) throw new NotFoundError('Integration key', id);
    reply.code(204);
    return null;
  });
}
