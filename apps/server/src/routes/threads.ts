import type { Db, MessageRow, ThreadRow } from '@hyperagent/db';
import { messages, threads } from '@hyperagent/db';
import type { Message, Thread } from '@hyperagent/shared';
import {
  createMessageBodySchema,
  createThreadBodySchema,
  updateThreadBodySchema,
} from '@hyperagent/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors.js';

function serializeThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    title: row.title,
    lastProvider: row.lastProvider,
    lastModel: row.lastModel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMessage(row: MessageRow): Message {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    parts: row.parts as Message['parts'],
    createdAt: row.createdAt.toISOString(),
  };
}

const idParamSchema = { type: 'object', properties: { id: { type: 'string' } } } as const;

export function registerThreadRoutes(app: FastifyInstance, db: Db): void {
  app.get('/threads', async () => {
    const rows = await db.select().from(threads).orderBy(desc(threads.updatedAt));
    return rows.map(serializeThread);
  });

  app.post('/threads', async (request, reply) => {
    const body = createThreadBodySchema.parse(request.body ?? {});
    const [row] = await db
      .insert(threads)
      .values(body.title ? { title: body.title } : {})
      .returning();
    reply.code(201);
    return serializeThread(row!);
  });

  app.get<{ Params: { id: string } }>(
    '/threads/:id',
    { schema: { params: idParamSchema } },
    async (request) => {
      const [row] = await db
        .select()
        .from(threads)
        .where(eq(threads.id, request.params.id))
        .limit(1);
      if (!row) throw new NotFoundError('Thread', request.params.id);
      return serializeThread(row);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/threads/:id',
    { schema: { params: idParamSchema } },
    async (request) => {
      const body = updateThreadBodySchema.parse(request.body);
      const [row] = await db
        .update(threads)
        .set({ title: body.title, updatedAt: new Date() })
        .where(eq(threads.id, request.params.id))
        .returning();
      if (!row) throw new NotFoundError('Thread', request.params.id);
      return serializeThread(row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/threads/:id',
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const deleted = await db
        .delete(threads)
        .where(eq(threads.id, request.params.id))
        .returning({ id: threads.id });
      if (deleted.length === 0) throw new NotFoundError('Thread', request.params.id);
      reply.code(204);
      return null;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/threads/:id/messages',
    { schema: { params: idParamSchema } },
    async (request) => {
      const [thread] = await db
        .select({ id: threads.id })
        .from(threads)
        .where(eq(threads.id, request.params.id))
        .limit(1);
      if (!thread) throw new NotFoundError('Thread', request.params.id);

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.threadId, request.params.id))
        .orderBy(messages.createdAt);
      return rows.map(serializeMessage);
    },
  );

  /**
   * Append a user message. Phase 3 turns this into the agent-run trigger;
   * for now it validates the persistence stack end to end.
   */
  app.post<{ Params: { id: string } }>(
    '/threads/:id/messages',
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const body = createMessageBodySchema.parse(request.body);

      const [thread] = await db
        .select({ id: threads.id })
        .from(threads)
        .where(eq(threads.id, request.params.id))
        .limit(1);
      if (!thread) throw new NotFoundError('Thread', request.params.id);

      const [row] = await db
        .insert(messages)
        .values({ threadId: request.params.id, role: body.role, parts: body.parts })
        .returning();

      await db
        .update(threads)
        .set({ updatedAt: new Date() })
        .where(eq(threads.id, request.params.id));

      reply.code(201);
      return serializeMessage(row!);
    },
  );
}
