import { llmCalls, messages, runs, threads, toolCalls } from '@hyperagent/db';
import type { AgentStreamEvent } from '@hyperagent/shared';
import { simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { makeTestDb } from '../test-utils.js';
import { historyToModelMessages, runAgentTurn } from './run-agent.js';

/** Provider-level (V3) structured usage for mock stream finish parts. */
function v3Usage(input: number, output: number) {
  return {
    inputTokens: {
      total: input,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

function textModel(text: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          ...text.split(' ').map((word, i) => ({
            type: 'text-delta' as const,
            id: 't1',
            delta: i === 0 ? word : ` ${word}`,
          })),
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop' as const, raw: undefined },
            usage: v3Usage(10, 5),
          },
        ],
      }),
    }),
  });
}

function toolThenTextModel() {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      call += 1;
      if (call === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: 'tool-call' as const,
                toolCallId: 'call-1',
                toolName: 'echo',
                input: JSON.stringify({ value: 'ping' }),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls' as const, raw: undefined },
                usage: v3Usage(8, 4),
              },
            ],
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'echoed: ping' },
            { type: 'text-end', id: 't1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop' as const, raw: undefined },
              usage: v3Usage(20, 6),
            },
          ],
        }),
      };
    },
  });
}

async function setup() {
  const db = await makeTestDb();
  const [thread] = await db.insert(threads).values({}).returning();
  await db.insert(messages).values({
    threadId: thread!.id,
    role: 'user',
    parts: [{ type: 'text', text: 'hello there' }],
  });
  return { db, threadId: thread!.id };
}

describe('runAgentTurn', () => {
  it('streams text, persists the assistant message, run, and llm_calls', async () => {
    const { db, threadId } = await setup();
    const events: AgentStreamEvent[] = [];

    const result = await runAgentTurn({
      db,
      threadId,
      provider: 'anthropic',
      model: 'mock-model',
      languageModel: textModel('General Kenobi!'),
      tools: {},
      system: 'You are a test agent.',
      maxSteps: 4,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe('completed');
    expect(events[0]).toMatchObject({ type: 'run-start', provider: 'anthropic' });
    const text = events
      .filter(
        (e): e is Extract<AgentStreamEvent, { type: 'text-delta' }> => e.type === 'text-delta',
      )
      .map((e) => e.delta)
      .join('');
    expect(text).toBe('General Kenobi!');
    expect(events.at(-1)).toMatchObject({
      type: 'run-finish',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    const storedMessages = await db.select().from(messages);
    const assistant = storedMessages.find((m) => m.role === 'assistant');
    expect(assistant?.parts).toEqual([{ type: 'text', text: 'General Kenobi!' }]);
    expect(assistant?.runId).toBe(result.runId);

    const [run] = await db.select().from(runs);
    expect(run).toMatchObject({ status: 'completed', totalTokens: 15 });

    const calls = await db.select().from(llmCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ provider: 'anthropic', inputTokens: 10 });

    const [thread] = await db.select().from(threads);
    expect(thread).toMatchObject({ lastProvider: 'anthropic', lastModel: 'mock-model' });
  });

  it('executes tools, records tool_calls, and embeds tool parts in the message', async () => {
    const { db, threadId } = await setup();
    const events: AgentStreamEvent[] = [];

    const echo = tool({
      description: 'Echo a value',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => ({ echoed: value }),
    });

    const result = await runAgentTurn({
      db,
      threadId,
      provider: 'openai',
      model: 'mock-model',
      languageModel: toolThenTextModel(),
      tools: { echo },
      system: 'You are a test agent.',
      maxSteps: 4,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe('completed');

    const toolCallEvent = events.find((e) => e.type === 'tool-call');
    expect(toolCallEvent).toMatchObject({ toolName: 'echo', args: { value: 'ping' } });
    const toolResultEvent = events.find((e) => e.type === 'tool-result');
    expect(toolResultEvent).toMatchObject({
      toolName: 'echo',
      status: 'completed',
      result: { echoed: 'ping' },
    });

    const rows = await db.select().from(toolCalls);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ toolName: 'echo', status: 'completed' });

    const storedMessages = await db.select().from(messages);
    const assistant = storedMessages.find((m) => m.role === 'assistant');
    const parts = assistant?.parts as Array<Record<string, unknown>>;
    expect(parts.some((p) => p.type === 'tool-call' && p.status === 'completed')).toBe(true);
    expect(parts.some((p) => p.type === 'text')).toBe(true);

    const calls = await db.select().from(llmCalls);
    expect(calls).toHaveLength(2);
  });

  it('marks the run failed and emits run-error when the model throws', async () => {
    const { db, threadId } = await setup();
    const events: AgentStreamEvent[] = [];

    const broken = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error('provider exploded');
      },
    });

    const result = await runAgentTurn({
      db,
      threadId,
      provider: 'anthropic',
      model: 'mock-model',
      languageModel: broken,
      tools: {},
      system: 'You are a test agent.',
      maxSteps: 2,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe('failed');
    expect(events.some((e) => e.type === 'run-error')).toBe(true);

    const [run] = await db.select().from(runs);
    expect(run?.status).toBe('failed');
    expect(run?.error).toContain('provider exploded');
  });
});

describe('historyToModelMessages', () => {
  it('maps text parts and skips tool-only messages', () => {
    const result = historyToModelMessages([
      { role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', parts: [{ type: 'tool-call', toolCallId: 'x' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'part one' },
          { type: 'tool-call', toolCallId: 'y' },
          { type: 'text', text: 'part two' },
        ],
      },
    ]);

    expect(result).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'part one\n\npart two' },
    ]);
  });
});
