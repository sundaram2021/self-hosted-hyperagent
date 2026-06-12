import type { Db, MemoryRow } from '@hyperagent/db';
import { memories, memoryRelations } from '@hyperagent/db';
import type { Memory, MemoryGraph } from '@hyperagent/shared';
import { createMemoryBodySchema, updateMemoryBodySchema } from '@hyperagent/shared';
import { desc, eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors.js';
import type { MemoryService } from '../memory/service.js';

const idParamSchema = { type: 'object', properties: { id: { type: 'string' } } } as const;

function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function registerMemoryRoutes(
  app: FastifyInstance,
  db: Db,
  memoryService: MemoryService,
): void {
  async function serialize(row: MemoryRow): Promise<Memory> {
    const edges = await db
      .select({
        relation: memoryRelations.relation,
        fromId: memoryRelations.fromId,
        toId: memoryRelations.toId,
        fromContent: memories.content,
      })
      .from(memoryRelations)
      .leftJoin(memories, eq(memories.id, memoryRelations.toId))
      .where(or(eq(memoryRelations.fromId, row.id), eq(memoryRelations.toId, row.id)));

    const relations: Memory['relations'] = [];
    for (const edge of edges) {
      const direction = edge.fromId === row.id ? 'out' : 'in';
      const otherId = direction === 'out' ? edge.toId : edge.fromId;
      const [other] = await db
        .select({ content: memories.content })
        .from(memories)
        .where(eq(memories.id, otherId))
        .limit(1);
      relations.push({
        relation: edge.relation,
        direction,
        otherId,
        otherContent: truncate(other?.content ?? ''),
      });
    }

    return {
      id: row.id,
      content: row.content,
      category: row.category,
      importance: row.importance,
      hasEmbedding: row.embedding !== null,
      sourceThreadId: row.sourceThreadId,
      supersededBy: row.supersededBy,
      accessCount: row.accessCount,
      lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
      relations,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  app.get<{ Querystring: { q?: string } }>('/memories', async (request) => {
    const query = request.query.q?.trim();

    if (query) {
      const hits = await memoryService.search(query, 25);
      const rows: MemoryRow[] = [];
      for (const hit of hits) {
        const [row] = await db.select().from(memories).where(eq(memories.id, hit.id)).limit(1);
        if (row) rows.push(row);
      }
      return Promise.all(rows.map((row) => serialize(row)));
    }

    const rows = await db.select().from(memories).orderBy(desc(memories.createdAt)).limit(200);
    return Promise.all(rows.map((row) => serialize(row)));
  });

  app.post('/memories', async (request, reply) => {
    const body = createMemoryBodySchema.parse(request.body);
    const result = await memoryService.addMemory({
      content: body.content,
      ...(body.category ? { category: body.category } : {}),
      ...(body.importance !== undefined ? { importance: body.importance } : {}),
    });
    reply.code(result.action === 'created' ? 201 : 200);
    return serialize(result.memory);
  });

  app.patch<{ Params: { id: string } }>(
    '/memories/:id',
    { schema: { params: idParamSchema } },
    async (request) => {
      const body = updateMemoryBodySchema.parse(request.body);
      const [row] = await db
        .update(memories)
        .set({
          ...(body.content !== undefined ? { content: body.content } : {}),
          ...(body.importance !== undefined ? { importance: body.importance } : {}),
          updatedAt: new Date(),
        })
        .where(eq(memories.id, request.params.id))
        .returning();
      if (!row) throw new NotFoundError('Memory', request.params.id);
      return serialize(row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/memories/:id',
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const deleted = await db
        .delete(memories)
        .where(eq(memories.id, request.params.id))
        .returning({ id: memories.id });
      if (deleted.length === 0) throw new NotFoundError('Memory', request.params.id);
      reply.code(204);
      return null;
    },
  );

  app.get('/memories/graph', async (): Promise<MemoryGraph> => {
    const nodes = await db.select().from(memories).orderBy(desc(memories.createdAt)).limit(150);
    const edges = await db.select().from(memoryRelations);
    const nodeIds = new Set(nodes.map((node) => node.id));

    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        content: truncate(node.content, 80),
        category: node.category,
        importance: node.importance,
        superseded: node.supersededBy !== null,
      })),
      edges: edges
        .filter((edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId))
        .map((edge) => ({ from: edge.fromId, to: edge.toId, relation: edge.relation })),
    };
  });
}
