import type { McpTestResult } from '@hyperagent/shared';
import { createMcpServerBodySchema, updateMcpServerBodySchema } from '@hyperagent/shared';
import type { FastifyInstance } from 'fastify';

import type { McpManager } from '../mcp/manager.js';
import type { McpServerService } from '../services/mcp-servers.js';

const idParamSchema = { type: 'object', properties: { id: { type: 'string' } } } as const;

export function registerMcpRoutes(
  app: FastifyInstance,
  service: McpServerService,
  manager: McpManager,
): void {
  app.get('/mcp-servers', async () => {
    const rows = await service.list();
    return rows.map((row) => service.serialize(row));
  });

  app.post('/mcp-servers', async (request, reply) => {
    const body = createMcpServerBodySchema.parse(request.body);
    const row = await service.create(body);
    reply.code(201);
    return service.serialize(row);
  });

  app.patch<{ Params: { id: string } }>(
    '/mcp-servers/:id',
    { schema: { params: idParamSchema } },
    async (request) => {
      const body = updateMcpServerBodySchema.parse(request.body);
      const row = await service.update(request.params.id, body);
      await manager.invalidate(request.params.id);
      return service.serialize(row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/mcp-servers/:id',
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      await service.delete(request.params.id);
      await manager.invalidate(request.params.id);
      reply.code(204);
      return null;
    },
  );

  /** Connect (uncached), list tools, close. Surfaces connection problems. */
  app.post<{ Params: { id: string } }>(
    '/mcp-servers/:id/test',
    { schema: { params: idParamSchema } },
    async (request): Promise<McpTestResult> => {
      const row = await service.get(request.params.id);
      try {
        const tools = await manager.test(service.toConfig(row));
        return {
          ok: true,
          tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
          error: null,
        };
      } catch (error) {
        return {
          ok: false,
          tools: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
