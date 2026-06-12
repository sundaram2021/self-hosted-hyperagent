import { upsertSettingBodySchema } from '@hyperagent/shared';
import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors.js';
import type { SettingsService } from '../services/settings.js';

const keyParamSchema = { type: 'object', properties: { key: { type: 'string' } } } as const;

export function registerSettingRoutes(app: FastifyInstance, settings: SettingsService): void {
  app.get('/settings', async () => settings.list());

  app.put<{ Params: { key: string } }>(
    '/settings/:key',
    { schema: { params: keyParamSchema } },
    async (request, reply) => {
      const body = upsertSettingBodySchema.parse(request.body);
      await settings.upsert(request.params.key, body.value, body.encrypted);
      reply.code(204);
      return null;
    },
  );

  app.delete<{ Params: { key: string } }>(
    '/settings/:key',
    { schema: { params: keyParamSchema } },
    async (request, reply) => {
      const deleted = await settings.delete(request.params.key);
      if (!deleted) throw new NotFoundError('Setting', request.params.key);
      reply.code(204);
      return null;
    },
  );
}
