import { z } from 'zod';

export const memoryCategorySchema = z.enum(['fact', 'preference', 'episode', 'profile']);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const memoryRelationTypeSchema = z.enum(['updates', 'extends', 'derives']);
export type MemoryRelationType = z.infer<typeof memoryRelationTypeSchema>;

export const memoryRelationSchema = z.object({
  relation: memoryRelationTypeSchema,
  direction: z.enum(['out', 'in']),
  otherId: z.string(),
  otherContent: z.string(),
});

export const memorySchema = z.object({
  id: z.string(),
  content: z.string(),
  category: memoryCategorySchema,
  importance: z.number(),
  hasEmbedding: z.boolean(),
  sourceThreadId: z.string().nullable(),
  supersededBy: z.string().nullable(),
  accessCount: z.number(),
  lastAccessedAt: z.string().nullable(),
  relations: z.array(memoryRelationSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof memorySchema>;

export const createMemoryBodySchema = z.object({
  content: z.string().min(1).max(4000),
  category: memoryCategorySchema.optional(),
  importance: z.number().min(0).max(1).optional(),
});
export type CreateMemoryBody = z.infer<typeof createMemoryBodySchema>;

export const updateMemoryBodySchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  importance: z.number().min(0).max(1).optional(),
});
export type UpdateMemoryBody = z.infer<typeof updateMemoryBodySchema>;

/** Graph view payload: nodes + edges. */
export const memoryGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      category: memoryCategorySchema,
      importance: z.number(),
      superseded: z.boolean(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relation: memoryRelationTypeSchema,
    }),
  ),
});
export type MemoryGraph = z.infer<typeof memoryGraphSchema>;
