import type { KeySource, ProviderStatus } from '@hyperagent/shared';
import {
  PROVIDERS,
  providerIdSchema,
  providerKeySettingKey,
  saveProviderKeyBodySchema,
} from '@hyperagent/shared';
import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors.js';
import type { SettingsService } from '../services/settings.js';

/**
 * Provider key management. Resolution order (also used by the agent loop in
 * Phase 3): environment variable first, then the encrypted database setting.
 */
export function registerProviderRoutes(
  app: FastifyInstance,
  settings: SettingsService,
  envSource: NodeJS.ProcessEnv = process.env,
): void {
  app.get('/providers', async (): Promise<ProviderStatus[]> => {
    const statuses: ProviderStatus[] = [];

    for (const provider of PROVIDERS) {
      let keySource: KeySource = 'none';
      if (envSource[provider.keyEnvVar]) {
        keySource = 'env';
      } else if (await settings.has(providerKeySettingKey(provider.id))) {
        keySource = 'database';
      }
      statuses.push({ ...provider, keySource });
    }

    return statuses;
  });

  app.put<{ Params: { id: string } }>('/providers/:id/key', async (request, reply) => {
    const providerId = providerIdSchema.parse(request.params.id);
    const body = saveProviderKeyBodySchema.parse(request.body);

    await settings.upsert(providerKeySettingKey(providerId), body.apiKey, true);
    reply.code(204);
    return null;
  });

  app.delete<{ Params: { id: string } }>('/providers/:id/key', async (request, reply) => {
    const providerId = providerIdSchema.parse(request.params.id);
    const deleted = await settings.delete(providerKeySettingKey(providerId));
    if (!deleted) throw new NotFoundError('Provider key', providerId);
    reply.code(204);
    return null;
  });
}
