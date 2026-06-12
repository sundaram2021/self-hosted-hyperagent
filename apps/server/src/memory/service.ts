import type { Db, MemoryRow } from '@hyperagent/db';
import { memories, memoryRelations } from '@hyperagent/db';
import type { MemoryCategory } from '@hyperagent/shared';
import { and, cosineDistance, desc, eq, isNull, sql } from 'drizzle-orm';

import type { Embedder } from './embedder.js';

/** Cosine similarity thresholds for the consolidation engine. */
const DUPLICATE_THRESHOLD = 0.92;
const UPDATES_THRESHOLD = 0.85;
const EXTENDS_THRESHOLD = 0.7;

const RRF_K = 60;
const RECENT_DAYS = 7;

export interface AddMemoryInput {
  content: string;
  category?: MemoryCategory;
  importance?: number;
  sourceThreadId?: string;
  sourceRunId?: string;
  /** Marks memories created by the extraction pipeline (relation: derives). */
  derived?: boolean;
}

export interface ConsolidationResult {
  action: 'created' | 'updated_existing' | 'deduplicated' | 'linked';
  memory: MemoryRow;
}

export interface RecalledMemory {
  id: string;
  content: string;
  category: MemoryCategory;
  score: number;
}

/**
 * Supermemory-style memory engine on Postgres:
 * - hybrid retrieval: pgvector cosine + full-text, fused with RRF plus
 *   importance and recency boosts
 * - consolidation: near-duplicates are dropped, strong overlaps supersede the
 *   old memory (relation: updates), moderate overlaps link (relation: extends)
 * - decay inputs: access counts + last access timestamps are maintained on
 *   every recall
 */
export class MemoryService {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder | null,
  ) {}

  get hasEmbedder(): boolean {
    return this.embedder !== null;
  }

  private async embedOne(text: string): Promise<number[] | null> {
    if (!this.embedder) return null;
    const [embedding] = await this.embedder.embed([text]);
    return embedding ?? null;
  }

  /** Insert without consolidation (used internally and in tests). */
  async insertRaw(input: AddMemoryInput, embedding: number[] | null): Promise<MemoryRow> {
    const [row] = await this.db
      .insert(memories)
      .values({
        content: input.content,
        category: input.category ?? 'fact',
        importance: input.importance ?? 0.5,
        embedding,
        sourceThreadId: input.sourceThreadId ?? null,
        sourceRunId: input.sourceRunId ?? null,
      })
      .returning();
    return row!;
  }

  /**
   * Add a memory through the consolidation engine so the store stays
   * deduplicated and current.
   */
  async addMemory(input: AddMemoryInput): Promise<ConsolidationResult> {
    const embedding = await this.embedOne(input.content);

    if (!embedding) {
      // Degraded mode: exact-content dedupe only.
      const [existing] = await this.db
        .select()
        .from(memories)
        .where(and(eq(memories.content, input.content), isNull(memories.supersededBy)))
        .limit(1);
      if (existing) return { action: 'deduplicated', memory: existing };
      return { action: 'created', memory: await this.insertRaw(input, null) };
    }

    const similarity = sql<number>`1 - (${cosineDistance(memories.embedding, embedding)})`;
    const [nearest] = await this.db
      .select({ row: memories, similarity })
      .from(memories)
      .where(and(isNull(memories.supersededBy), sql`${memories.embedding} IS NOT NULL`))
      .orderBy((t) => desc(t.similarity))
      .limit(1);

    if (nearest && nearest.similarity >= DUPLICATE_THRESHOLD) {
      // Same information — bump importance slightly instead of duplicating.
      const [bumped] = await this.db
        .update(memories)
        .set({
          importance: Math.min(1, nearest.row.importance + 0.05),
          updatedAt: new Date(),
        })
        .where(eq(memories.id, nearest.row.id))
        .returning();
      return { action: 'deduplicated', memory: bumped! };
    }

    const created = await this.insertRaw(input, embedding);

    if (input.derived) {
      // Extraction-derived memories keep their provenance edge when they
      // relate to an existing memory.
      if (nearest && nearest.similarity >= EXTENDS_THRESHOLD) {
        await this.db.insert(memoryRelations).values({
          fromId: created.id,
          toId: nearest.row.id,
          relation: 'derives',
        });
        return { action: 'linked', memory: created };
      }
    }

    if (nearest && nearest.similarity >= UPDATES_THRESHOLD) {
      // The new memory supersedes the old one.
      await this.db.insert(memoryRelations).values({
        fromId: created.id,
        toId: nearest.row.id,
        relation: 'updates',
      });
      await this.db
        .update(memories)
        .set({ supersededBy: created.id, updatedAt: new Date() })
        .where(eq(memories.id, nearest.row.id));
      return { action: 'updated_existing', memory: created };
    }

    if (nearest && nearest.similarity >= EXTENDS_THRESHOLD) {
      await this.db.insert(memoryRelations).values({
        fromId: created.id,
        toId: nearest.row.id,
        relation: 'extends',
      });
      return { action: 'linked', memory: created };
    }

    return { action: 'created', memory: created };
  }

  /**
   * Hybrid search: vector + full-text candidates fused with reciprocal rank
   * fusion, boosted by importance and recency. Superseded memories excluded.
   */
  async search(query: string, k = 5): Promise<RecalledMemory[]> {
    const candidates = new Map<
      string,
      {
        row: {
          id: string;
          content: string;
          category: MemoryCategory;
          importance: number;
          createdAt: Date;
        };
        score: number;
      }
    >();

    const addRanked = (
      rows: Array<{
        id: string;
        content: string;
        category: string;
        importance: number;
        createdAt: Date;
      }>,
    ) => {
      rows.forEach((row, rank) => {
        const entry = candidates.get(row.id);
        const contribution = 1 / (RRF_K + rank + 1);
        if (entry) {
          entry.score += contribution;
        } else {
          candidates.set(row.id, {
            row: { ...row, category: row.category as MemoryCategory },
            score: contribution,
          });
        }
      });
    };

    const embedding = await this.embedOne(query);
    if (embedding) {
      const vectorRows = await this.db
        .select({
          id: memories.id,
          content: memories.content,
          category: memories.category,
          importance: memories.importance,
          createdAt: memories.createdAt,
        })
        .from(memories)
        .where(and(isNull(memories.supersededBy), sql`${memories.embedding} IS NOT NULL`))
        .orderBy(cosineDistance(memories.embedding, embedding))
        .limit(20);
      addRanked(vectorRows);
    }

    const textRows = await this.db
      .select({
        id: memories.id,
        content: memories.content,
        category: memories.category,
        importance: memories.importance,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(and(isNull(memories.supersededBy), sql`tsv @@ plainto_tsquery('english', ${query})`))
      .orderBy(desc(sql`ts_rank(tsv, plainto_tsquery('english', ${query}))`))
      .limit(20);
    addRanked(textRows);

    const now = Date.now();
    const scored = [...candidates.values()].map((entry) => {
      const ageDays = (now - entry.row.createdAt.getTime()) / 86_400_000;
      const recencyBoost = ageDays <= RECENT_DAYS ? 0.005 : 0;
      return {
        id: entry.row.id,
        content: entry.row.content,
        category: entry.row.category,
        score: entry.score + entry.row.importance * 0.01 + recencyBoost,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /** Search + touch access stats — used before every agent turn. */
  async recallForTurn(query: string, k = 5): Promise<RecalledMemory[]> {
    const recalled = await this.search(query, k);
    if (recalled.length > 0) {
      await this.db
        .update(memories)
        .set({
          accessCount: sql`${memories.accessCount} + 1`,
          lastAccessedAt: new Date(),
        })
        .where(
          sql`${memories.id} IN (${sql.join(
            recalled.map((m) => sql`${m.id}`),
            sql`, `,
          )})`,
        );
    }
    return recalled;
  }
}
