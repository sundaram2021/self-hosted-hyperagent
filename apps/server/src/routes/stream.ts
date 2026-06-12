import type { Db } from '@hyperagent/db';
import { messages, runs, threads } from '@hyperagent/db';
import type { AgentStreamEvent, ProviderModels, Run } from '@hyperagent/shared';
import { PROVIDERS, streamRequestSchema } from '@hyperagent/shared';
import { MODEL_CATALOG } from '@hyperagent/ai';
import type { LanguageModel } from 'ai';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { buildRunTools } from '../agent/build-tools.js';
import { runAgentTurn } from '../agent/run-agent.js';
import { buildSystemPrompt } from '../agent/system-prompt.js';
import type { Env } from '../env.js';
import { NotFoundError } from '../errors.js';
import type { McpManager } from '../mcp/manager.js';
import { extractAndStoreMemories } from '../memory/extraction.js';
import type { MemoryService } from '../memory/service.js';
import type { McpServerService } from '../services/mcp-servers.js';
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
  mcpService: McpServerService;
  mcpManager: McpManager;
  memoryService: MemoryService | null;
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
  const { db, env, settings, envSource, modelFactory, mcpService, mcpManager, memoryService } =
    deps;

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

      const { tools, skills } = await buildRunTools({
        db,
        env,
        envSource,
        settings,
        mcpService,
        mcpManager,
        memoryService,
        threadId,
        logger: request.log,
      });

      // Hybrid memory recall (Phase 8) — failures never block the turn.
      let recalledMemories: Array<{ content: string; category: string }> = [];
      if (memoryService && env.MEMORY_RECALL_K > 0) {
        try {
          recalledMemories = await memoryService.recallForTurn(body.text, env.MEMORY_RECALL_K);
        } catch (error) {
          request.log.warn({ err: error }, 'memory recall failed');
        }
      }

      try {
        const result = await runAgentTurn({
          db,
          threadId,
          provider: body.provider,
          model: body.model,
          languageModel,
          tools,
          system: buildSystemPrompt({
            toolsAvailable: Object.keys(tools),
            skills,
            memories: recalledMemories,
          }),
          maxSteps: env.AGENT_MAX_STEPS,
          signal: abortController.signal,
          onEvent: send,
        });

        // Opt-in post-turn extraction; fire-and-forget.
        if (memoryService && env.MEMORY_AUTO_EXTRACT && result.status === 'completed') {
          void (async () => {
            try {
              const conversationText = `user: ${body.text}`;
              await extractAndStoreMemories(memoryService, {
                model: languageModel,
                conversationText,
                threadId,
                runId: result.runId,
              });
            } catch (error) {
              request.log.warn({ err: error }, 'memory extraction failed');
            }
          })();
        }
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
