import { memories, memoryRelations } from '@hyperagent/db';
import { describe, expect, it } from 'vitest';

import { makeTestDb } from '../test-utils.js';
import type { Embedder } from './embedder.js';
import { EMBEDDING_DIMENSIONS } from './embedder.js';
import { MemoryService } from './service.js';

/**
 * Deterministic fake embedder: maps known phrases to fixed directions so
 * cosine similarities are exact and the consolidation thresholds testable.
 */
function vectorAt(direction: number, blend = 1): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
  v[direction] = blend;
  v[direction + 1] = Math.sqrt(Math.max(0, 1 - blend * blend));
  return v;
}

const PHRASES = new Map<string, number[]>([
  ['User prefers dark mode', vectorAt(0)],
  // cos sim with the above = 0.95 → duplicate territory
  ['User likes dark mode', vectorAt(0, 0.95)],
  // cos sim = 0.88 → updates territory
  ['User now prefers light mode in summer', vectorAt(0, 0.88)],
  // cos sim = 0.75 → extends territory
  ['User dislikes bright screens at night', vectorAt(0, 0.75)],
  // orthogonal → unrelated
  ['User works at Acme Corp', vectorAt(10)],
  ['dark mode preference?', vectorAt(0, 0.97)],
]);

const fakeEmbedder: Embedder = {
  provider: 'openai',
  embed: async (values) => values.map((value) => PHRASES.get(value) ?? vectorAt(100)),
};

async function makeService() {
  const db = await makeTestDb();
  return { db, service: new MemoryService(db, fakeEmbedder) };
}

describe('MemoryService consolidation', () => {
  it('creates unrelated memories independently', async () => {
    const { service } = await makeService();

    const first = await service.addMemory({ content: 'User prefers dark mode' });
    const second = await service.addMemory({ content: 'User works at Acme Corp' });

    expect(first.action).toBe('created');
    expect(second.action).toBe('created');
  });

  it('deduplicates near-identical memories and bumps importance', async () => {
    const { db, service } = await makeService();

    const original = await service.addMemory({
      content: 'User prefers dark mode',
      importance: 0.5,
    });
    const duplicate = await service.addMemory({ content: 'User likes dark mode' });

    expect(duplicate.action).toBe('deduplicated');
    expect(duplicate.memory.id).toBe(original.memory.id);
    expect(duplicate.memory.importance).toBeCloseTo(0.55, 5);
    expect(await db.select().from(memories)).toHaveLength(1);
  });

  it('supersedes with an updates relation when content strongly overlaps', async () => {
    const { db, service } = await makeService();

    const old = await service.addMemory({ content: 'User prefers dark mode' });
    const updated = await service.addMemory({
      content: 'User now prefers light mode in summer',
    });

    expect(updated.action).toBe('updated_existing');

    const rows = await db.select().from(memories);
    const superseded = rows.find((row) => row.id === old.memory.id);
    expect(superseded?.supersededBy).toBe(updated.memory.id);

    const relations = await db.select().from(memoryRelations);
    expect(relations).toEqual([
      expect.objectContaining({
        fromId: updated.memory.id,
        toId: old.memory.id,
        relation: 'updates',
      }),
    ]);
  });

  it('links related memories with an extends relation', async () => {
    const { db, service } = await makeService();

    await service.addMemory({ content: 'User prefers dark mode' });
    const related = await service.addMemory({
      content: 'User dislikes bright screens at night',
    });

    expect(related.action).toBe('linked');
    const relations = await db.select().from(memoryRelations);
    expect(relations[0]?.relation).toBe('extends');
    // Both memories remain active.
    const rows = await db.select().from(memories);
    expect(rows.every((row) => row.supersededBy === null)).toBe(true);
  });
});

describe('MemoryService hybrid recall', () => {
  it('finds memories by vector similarity and excludes superseded ones', async () => {
    const { service } = await makeService();

    await service.addMemory({ content: 'User prefers dark mode' });
    await service.addMemory({ content: 'User works at Acme Corp' });

    const results = await service.search('dark mode preference?', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.content).toBe('User prefers dark mode');
  });

  it('falls back to full-text search without an embedder', async () => {
    const db = await makeTestDb();
    const service = new MemoryService(db, null);

    await service.addMemory({ content: 'User deploys with Docker Compose on a VPS' });
    await service.addMemory({ content: 'User has a cat named Miso' });

    const results = await service.search('docker compose deployment', 3);
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toContain('Docker Compose');
  });

  it('recallForTurn updates access statistics', async () => {
    const { db, service } = await makeService();
    await service.addMemory({ content: 'User prefers dark mode' });

    const recalled = await service.recallForTurn('dark mode preference?', 2);
    expect(recalled.length).toBeGreaterThan(0);

    const [row] = await db.select().from(memories);
    expect(row?.accessCount).toBe(1);
    expect(row?.lastAccessedAt).not.toBeNull();
  });

  it('exact-duplicate dedupe still works without an embedder', async () => {
    const db = await makeTestDb();
    const service = new MemoryService(db, null);

    const first = await service.addMemory({ content: 'User has a cat named Miso' });
    const second = await service.addMemory({ content: 'User has a cat named Miso' });

    expect(first.action).toBe('created');
    expect(second.action).toBe('deduplicated');
    expect(await db.select().from(memories)).toHaveLength(1);
  });
});
