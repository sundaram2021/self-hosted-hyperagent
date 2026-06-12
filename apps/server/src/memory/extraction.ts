import type { LanguageModel } from 'ai';
import { generateText } from 'ai';
import { z } from 'zod';

import type { MemoryService } from './service.js';

const extractedMemorySchema = z.object({
  content: z.string().min(1).max(2000),
  category: z.enum(['fact', 'preference', 'episode', 'profile']).default('fact'),
  importance: z.number().min(0).max(1).default(0.5),
});

const extractionResponseSchema = z.array(extractedMemorySchema).max(8);

const EXTRACTION_PROMPT = `You extract long-term memories from a conversation between a user and an AI assistant.

Extract only durable, useful facts worth remembering across future conversations:
- stable user facts and context (role, projects, environment) → "profile" or "fact"
- explicit preferences ("I prefer…", "always…", "never…") → "preference"
- significant events or decisions from this conversation → "episode"

Rules:
- Skip small talk, one-off questions, and anything only relevant right now.
- Each memory must be a single, self-contained sentence.
- importance: 0.9+ for explicit "remember this", 0.7 for clear preferences/facts, 0.5 default.
- If nothing is worth remembering, return [].

Respond with ONLY a JSON array, no prose:
[{"content": "...", "category": "fact|preference|episode|profile", "importance": 0.5}]

Conversation:
`;

/** Strip markdown fences models love to add around JSON. */
function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}

export interface ExtractionInput {
  model: LanguageModel;
  conversationText: string;
  threadId: string;
  runId: string;
}

/**
 * Post-turn memory extraction (opt-in: MEMORY_AUTO_EXTRACT). Runs async after
 * the response is streamed; failures are logged by the caller, never surfaced
 * to the user.
 */
export async function extractAndStoreMemories(
  memoryService: MemoryService,
  input: ExtractionInput,
): Promise<number> {
  const { text } = await generateText({
    model: input.model,
    prompt: EXTRACTION_PROMPT + input.conversationText.slice(0, 16_000),
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return 0;
  }

  const result = extractionResponseSchema.safeParse(parsed);
  if (!result.success) return 0;

  let stored = 0;
  for (const candidate of result.data) {
    await memoryService.addMemory({
      content: candidate.content,
      category: candidate.category,
      importance: candidate.importance,
      sourceThreadId: input.threadId,
      sourceRunId: input.runId,
      derived: true,
    });
    stored += 1;
  }
  return stored;
}
