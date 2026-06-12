import type { Db } from '@hyperagent/db';
import { messages, runs, threads } from '@hyperagent/db';
import type { AgentStreamEvent, ProviderModels, Run } from '@hyperagent/shared';
import { PROVIDERS, streamRequestSchema } from '@hyperagent/shared';
import { MODEL_CATALOG } from '@hyperagent/ai';
import type { LanguageModel, ToolSet } from 'ai';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { createExecuteCodeTool } from '../agent/tools/execute-code.js';
import { runAgentTurn } from '../agent/run-agent.js';
import type { Env } from '../env.js';
import { NotFoundError } from '../errors.js';
import { resolveKeySource, resolveProviderKey } from '../services/provider-keys.js';
import type { SettingsService } from '../services/settings.js';
import type { RunRow } from '@hyperagent/db';

export type ModelFactory = (options: {
  providerId: Parameters<typeof resolveProviderKey>[0];
  modelId: string;
  apiKey: string;
}) => LanguageModel;

export interface StreamRouteDeps {
  db: Db;
  env: Env;
  settings: SettingsService;
  envSource: NodeJS.ProcessEnv;
  modelFactory: ModelFactory;
}

const idParamSchema = { type: 'object', properties: { id: { type: 'string' } } } as const;

function serializeRun(row: RunRow): Run {
  return {
    id: row.id,
    threadId: row.threadId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function registerStreamRoutes(app: FastifyInstance, deps: StreamRouteDeps): void {
  const { db, env, settings, envSource, modelFactory } = deps;

  /** Model catalog grouped by provider, with key availability. */
  app.get('/models', async (): Promise<ProviderModels[]> => {
    const result: ProviderModels[] = [];
    for (const provider of PROVIDERS) {
      result.push({
        id: provider.id,
        label: provider.label,
        keySource: await resolveKeySource(provider, envSource, settings),
        models: MODEL_CATALOG[provider.id],
      });
    }
    return result;
  });

  app.get<{ Params: { id: string } }>(
    '/threads/:id/runs',
    { schema: { params: idParamSchema } },
    async (request) => {
      const rows = await db
        .select()
        .from(runs)
        .where(eq(runs.threadId, request.params.id))
        .orderBy(desc(runs.createdAt));
      return rows.map(serializeRun);
    },
  );

  /**
   * The chat endpoint: appends the user message, executes one agent turn,
   * and streams progress as Server-Sent Events over the POST response.
   */
  app.post<{ Params: { id: string } }>(
    '/threads/:id/stream',
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const body = streamRequestSchema.parse(request.body);
      const threadId = request.params.id;

      const [thread] = await db
        .select({ id: threads.id })
        .from(threads)
        .where(eq(threads.id, threadId))
        .limit(1);
      if (!thread) throw new NotFoundError('Thread', threadId);

      // Resolve the model BEFORE hijacking the response so configuration
      // errors surface as clean JSON 400s rather than broken streams.
      const apiKey = await resolveProviderKey(body.provider, envSource, settings);
      const languageModel = modelFactory({
        providerId: body.provider,
        modelId: body.model,
        apiKey,
      });

      await db.insert(messages).values({
        threadId,
        role: 'user',
        parts: [{ type: 'text', text: body.text }],
      });

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        // CORS must be set manually: hijacked responses bypass @fastify/cors.
        'access-control-allow-origin': env.WEB_ORIGIN,
      });
      reply.hijack();

      const send = (event: AgentStreamEvent): void => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const abortController = new AbortController();
      request.raw.on('close', () => {
        if (!reply.raw.writableEnded) abortController.abort();
      });

      const tools: ToolSet = {
        execute_code: createExecuteCodeTool({
          sandboxUrl: env.SANDBOX_URL,
          timeoutMs: env.SANDBOX_EXECUTE_TIMEOUT_MS,
        }),
      };

      try {
        await runAgentTurn({
          db,
          threadId,
          provider: body.provider,
          model: body.model,
          languageModel,
          tools,
          maxSteps: env.AGENT_MAX_STEPS,
          signal: abortController.signal,
          onEvent: send,
        });
      } catch (error) {
        request.log.error(error, 'agent turn crashed');
        send({
          type: 'run-error',
          message: error instanceof Error ? error.message : 'Agent turn failed',
        });
      } finally {
        reply.raw.end();
      }
    },
  );
}
