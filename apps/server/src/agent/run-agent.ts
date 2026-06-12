import type { Db } from '@hyperagent/db';
import { llmCalls, messages, runs, threads, toolCalls } from '@hyperagent/db';
import type { AgentStreamEvent, MessagePart, Usage } from '@hyperagent/shared';
import type { LanguageModel, ModelMessage, ToolSet } from 'ai';
import { stepCountIs, streamText } from 'ai';
import { eq } from 'drizzle-orm';

export interface RunAgentOptions {
  db: Db;
  threadId: string;
  provider: string;
  model: string;
  languageModel: LanguageModel;
  tools: ToolSet;
  /** Fully assembled system prompt (see buildSystemPrompt + buildRunTools). */
  system: string;
  maxSteps: number;
  signal: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
}

export interface RunAgentResult {
  runId: string;
  status: 'completed' | 'failed' | 'cancelled';
}

interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  status: 'pending' | 'completed' | 'failed';
  latencyMs?: number;
  [key: string]: unknown;
}

function emptyUsage(): Usage {
  return { inputTokens: null, outputTokens: null, totalTokens: null };
}

function toUsage(raw: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}): Usage {
  return {
    inputTokens: raw.inputTokens ?? null,
    outputTokens: raw.outputTokens ?? null,
    totalTokens: raw.totalTokens ?? null,
  };
}

/** Convert stored message parts into model messages (text parts only). */
export function historyToModelMessages(
  rows: Array<{ role: 'user' | 'assistant' | 'system'; parts: unknown[] }>,
): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const row of rows) {
    const text = (row.parts as Array<{ type?: string; text?: string }>)
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n\n');

    if (!text) continue;

    if (row.role === 'user') result.push({ role: 'user', content: text });
    else if (row.role === 'assistant') result.push({ role: 'assistant', content: text });
    else result.push({ role: 'system', content: text });
  }

  return result;
}

/**
 * Execute one assistant turn: multi-step tool-calling loop over the thread
 * history. Streams events to `onEvent`, persists the assistant message,
 * the run row, and telemetry spans (llm_calls + tool_calls) — even when the
 * run fails or is aborted mid-stream.
 */
export async function runAgentTurn(options: RunAgentOptions): Promise<RunAgentResult> {
  const { db, threadId, provider, model, languageModel, tools, system, maxSteps, signal, onEvent } =
    options;

  const [run] = await db
    .insert(runs)
    .values({ threadId, provider, model, status: 'running', startedAt: new Date() })
    .returning();
  const runId = run!.id;

  onEvent({ type: 'run-start', runId, provider, model });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt);

  const parts: MessagePart[] = [];
  const toolStartTimes = new Map<string, number>();
  let stepStartedAt = Date.now();
  let runUsage = emptyUsage();
  let finishReason = 'unknown';
  let status: RunAgentResult['status'] = 'completed';
  let errorMessage: string | null = null;

  function appendText(delta: string): void {
    const last = parts[parts.length - 1];
    if (last && last.type === 'text' && 'text' in last) {
      (last as { text: string }).text += delta;
    } else {
      parts.push({ type: 'text', text: delta });
    }
  }

  function findToolPart(toolCallId: string): ToolCallPart | undefined {
    return parts.find(
      (part): part is ToolCallPart =>
        part.type === 'tool-call' && (part as ToolCallPart).toolCallId === toolCallId,
    );
  }

  try {
    const result = streamText({
      model: languageModel,
      system,
      messages: historyToModelMessages(history),
      tools,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: signal,
      onStepFinish: async (step) => {
        const usage = toUsage(step.usage);
        await db.insert(llmCalls).values({
          runId,
          threadId,
          provider,
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          latencyMs: Date.now() - stepStartedAt,
          finishReason: step.finishReason,
        });
        stepStartedAt = Date.now();
        onEvent({ type: 'step-finish', usage });
      },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          appendText(part.text);
          onEvent({ type: 'text-delta', delta: part.text });
          break;
        }
        case 'tool-call': {
          toolStartTimes.set(part.toolCallId, Date.now());
          parts.push({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
            status: 'pending',
          } satisfies ToolCallPart);
          onEvent({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
          });
          break;
        }
        case 'tool-result': {
          const startedAt = toolStartTimes.get(part.toolCallId);
          const latencyMs = startedAt ? Date.now() - startedAt : null;
          const toolPart = findToolPart(part.toolCallId);
          if (toolPart) {
            toolPart.result = part.output;
            toolPart.status = 'completed';
            if (latencyMs !== null) toolPart.latencyMs = latencyMs;
          }
          await db.insert(toolCalls).values({
            runId,
            threadId,
            toolName: part.toolName,
            args: toolPart?.args ?? null,
            result: part.output ?? null,
            status: 'completed',
            latencyMs,
          });
          onEvent({
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
            status: 'completed',
            latencyMs,
          });
          break;
        }
        case 'tool-error': {
          const startedAt = toolStartTimes.get(part.toolCallId);
          const latencyMs = startedAt ? Date.now() - startedAt : null;
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          const toolPart = findToolPart(part.toolCallId);
          if (toolPart) {
            toolPart.result = { error: message };
            toolPart.status = 'failed';
            if (latencyMs !== null) toolPart.latencyMs = latencyMs;
          }
          await db.insert(toolCalls).values({
            runId,
            threadId,
            toolName: part.toolName,
            args: toolPart?.args ?? null,
            result: { error: message },
            status: 'failed',
            latencyMs,
          });
          onEvent({
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: { error: message },
            status: 'failed',
            latencyMs,
          });
          break;
        }
        case 'finish': {
          finishReason = part.finishReason;
          runUsage = toUsage(part.totalUsage);
          break;
        }
        case 'error': {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
        default:
          break;
      }
    }
  } catch (error) {
    if (signal.aborted) {
      status = 'cancelled';
      finishReason = 'aborted';
    } else {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);
      onEvent({ type: 'run-error', message: errorMessage });
    }
  }

  // Persist whatever the assistant produced — including partial output on
  // abort/failure — so a page refresh shows a consistent conversation.
  if (parts.length > 0) {
    await db.insert(messages).values({ threadId, role: 'assistant', parts, runId });
  }

  await db
    .update(runs)
    .set({
      status,
      error: errorMessage,
      finishedAt: new Date(),
      inputTokens: runUsage.inputTokens,
      outputTokens: runUsage.outputTokens,
      totalTokens: runUsage.totalTokens,
    })
    .where(eq(runs.id, runId));

  await db
    .update(threads)
    .set({ updatedAt: new Date(), lastProvider: provider, lastModel: model })
    .where(eq(threads.id, threadId));

  if (status === 'completed') {
    onEvent({ type: 'run-finish', runId, finishReason, usage: runUsage });
  }

  return { runId, status };
}
