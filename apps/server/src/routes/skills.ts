import type { Db, SkillRow } from '@hyperagent/db';
import { skills } from '@hyperagent/db';
import type { Skill, SkillDetail } from '@hyperagent/shared';
import { installSkillBodySchema, updateSkillBodySchema } from '@hyperagent/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../errors.js';
import { installSkillFromGitHub, SkillInstallError } from '../skills/installer.js';

const idParamSchema = { type: 'object', properties: { id: { type: 'string' } } } as const;

function serializeSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source,
    enabled: row.enabled,
    fileCount: row.files.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSkillDetail(row: SkillRow): SkillDetail {
  return {
    ...serializeSkill(row),
    content: row.content,
    files: row.files.map((file) => ({ path: file.path, size: file.content.length })),
  };
}

export interface SkillRouteDeps {
  db: Db;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  githubToken?: string;
}

export function registerSkillRoutes(app: FastifyInstance, deps: SkillRouteDeps): void {
  const { db } = deps;

  app.get('/skills', async () => {
    const rows = await db.select().from(skills).orderBy(skills.name);
    return rows.map(serializeSkill);
  });

  app.get<{ Params: { id: string } }>(
    '/skills/:id',
    { schema: { params: idParamSchema } },
    async (request) => {
      const [row] = await db.select().from(skills).where(eq(skills.id, request.params.id)).limit(1);
      if (!row) throw new NotFoundError('Skill', request.params.id);
      return serializeSkillDetail(row);
    },
  );

  app.post('/skills', async (request, reply) => {
    const body = installSkillBodySchema.parse(request.body);

    let installed;
    try {
      installed = await installSkillFromGitHub(body.url, deps.fetchImpl ?? fetch, deps.githubToken);
    } catch (error) {
      if (error instanceof SkillInstallError) {
        return reply
          .code(422)
          .send({ error: { message: error.message, code: 'SKILL_INSTALL_FAILED' } });
      }
      throw error;
    }

    // Re-installing the same skill name updates it in place.
    const [existing] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.name, installed.name))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(skills)
        .set({
          description: installed.description,
          source: installed.source,
          content: installed.content,
          files: installed.files,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, existing.id))
        .returning();
      return serializeSkill(row!);
    }

    const [row] = await db
      .insert(skills)
      .values({
        name: installed.name,
        description: installed.description,
        source: installed.source,
        content: installed.content,
        files: installed.files,
      })
      .returning();
    reply.code(201);
    return serializeSkill(row!);
  });

  app.patch<{ Params: { id: string } }>(
    '/skills/:id',
    { schema: { params: idParamSchema } },
    async (request) => {
      const body = updateSkillBodySchema.parse(request.body);
      const [row] = await db
        .update(skills)
        .set({ enabled: body.enabled, updatedAt: new Date() })
        .where(eq(skills.id, request.params.id))
        .returning();
      if (!row) throw new NotFoundError('Skill', request.params.id);
      return serializeSkill(row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/skills/:id',
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const deleted = await db
        .delete(skills)
        .where(eq(skills.id, request.params.id))
        .returning({ id: skills.id });
      if (deleted.length === 0) throw new NotFoundError('Skill', request.params.id);
      reply.code(204);
      return null;
    },
  );
}
