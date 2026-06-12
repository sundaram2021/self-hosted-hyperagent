import type { ToolSet } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

import type { MemoryService } from './service.js';

/** memory_save + memory_search agent tools. */
export function createMemoryTools(memoryService: MemoryService, threadId: string): ToolSet {
  return {
    memory_save: tool({
      description:
        'Save a durable memory about the user or their work (facts, preferences, ' +
        'decisions). Use when the user shares something worth remembering across ' +
        'conversations or explicitly asks you to remember.',
      inputSchema: z.object({
        content: z.string().min(1).max(2000).describe('One self-contained sentence'),
        category: z.enum(['fact', 'preference', 'episode', 'profile']).optional(),
        importance: z.number().min(0).max(1).optional().describe('Default 0.5'),
      }),
      execute: async ({ content, category, importance }) => {
        const result = await memoryService.addMemory({
          content,
          ...(category ? { category } : {}),
          ...(importance !== undefined ? { importance } : {}),
          sourceThreadId: threadId,
        });
        return { action: result.action, memoryId: result.memory.id };
      },
    }),
    memory_search: tool({
      description:
        'Search long-term memories about the user (hybrid semantic + keyword). ' +
        'Use when past context would improve your answer.',
      inputSchema: z.object({
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(20).optional().describe('Default 5'),
      }),
      execute: async ({ query, limit }) => memoryService.search(query, limit ?? 5),
    }),
  };
}
