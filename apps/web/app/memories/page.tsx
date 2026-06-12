'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Memory, MemoryGraph } from '@hyperagent/shared';

import { createMemory, deleteMemory, getMemoryGraph, listMemories, updateMemory } from '@/lib/api';

const CATEGORY_COLORS: Record<string, string> = {
  fact: 'text-sky-400 bg-sky-950',
  preference: 'text-emerald-400 bg-emerald-950',
  episode: 'text-amber-400 bg-amber-950',
  profile: 'text-purple-400 bg-purple-950',
};

function CategoryChip({ category }: { category: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[category] ?? 'bg-zinc-900 text-zinc-400'}`}
    >
      {category}
    </span>
  );
}

function MemoryCard({
  memory,
  onChanged,
  onError,
}: {
  memory: Memory;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);

  async function onSave() {
    setEditing(false);
    if (draft.trim() === memory.content || !draft.trim()) return;
    try {
      await updateMemory(memory.id, { content: draft.trim() });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update memory');
    }
  }

  async function onDelete() {
    if (!window.confirm('Delete this memory?')) return;
    try {
      await deleteMemory(memory.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete memory');
    }
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 ${
        memory.supersededBy ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void onSave()}
            rows={2}
            className="flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm leading-relaxed text-zinc-200 hover:text-white"
            title="Click to edit"
          >
            {memory.content}
          </button>
        )}
        <button
          onClick={() => void onDelete()}
          className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-red-400"
        >
          Delete
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
        <CategoryChip category={memory.category} />
        <span>importance {memory.importance.toFixed(2)}</span>
        <span>recalled {memory.accessCount}×</span>
        {memory.hasEmbedding ? <span>vector ✓</span> : <span>text-only</span>}
        {memory.supersededBy ? <span className="text-amber-500">superseded</span> : null}
      </div>

      {memory.relations.length > 0 ? (
        <div className="flex flex-col gap-1">
          {memory.relations.map((relation, index) => (
            <p key={index} className="text-[11px] text-zinc-500">
              <span className="text-zinc-400">
                {relation.direction === 'out' ? `${relation.relation} →` : `← ${relation.relation}`}
              </span>{' '}
              {relation.otherContent}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Lightweight circular-layout graph (no physics, no deps). */
function GraphView({ graph }: { graph: MemoryGraph }) {
  const [selected, setSelected] = useState<string | null>(null);

  const layout = useMemo(() => {
    const size = 520;
    const center = size / 2;
    const radius = center - 70;
    const positions = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(1, graph.nodes.length) - Math.PI / 2;
      positions.set(node.id, {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
      });
    });
    return { size, positions };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-600">No memories yet.</p>;
  }

  const selectedNode = graph.nodes.find((node) => node.id === selected);

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${layout.size} ${layout.size}`}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60"
      >
        {graph.edges.map((edge, index) => {
          const from = layout.positions.get(edge.from);
          const to = layout.positions.get(edge.to);
          if (!from || !to) return null;
          const highlighted = selected === edge.from || selected === edge.to;
          return (
            <g key={index}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={highlighted ? '#34d399' : '#3f3f46'}
                strokeWidth={highlighted ? 1.5 : 0.75}
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 3}
                fill={highlighted ? '#34d399' : '#52525b'}
                fontSize="8"
                textAnchor="middle"
              >
                {edge.relation}
              </text>
            </g>
          );
        })}
        {graph.nodes.map((node) => {
          const position = layout.positions.get(node.id)!;
          const r = 4 + node.importance * 6;
          return (
            <circle
              key={node.id}
              cx={position.x}
              cy={position.y}
              r={r}
              fill={node.superseded ? '#52525b' : selected === node.id ? '#34d399' : '#10b981'}
              fillOpacity={node.superseded ? 0.4 : 0.85}
              className="cursor-pointer"
              onClick={() => setSelected(node.id === selected ? null : node.id)}
            />
          );
        })}
      </svg>
      {selectedNode ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
          <CategoryChip category={selectedNode.category} />{' '}
          <span className="ml-1">{selectedNode.content}</span>
        </p>
      ) : (
        <p className="text-center text-[11px] text-zinc-600">
          Click a node to inspect it. Size = importance, gray = superseded.
        </p>
      )}
    </div>
  );
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (search?: string) => {
    try {
      const [memoryList, memoryGraph] = await Promise.all([listMemories(search), getMemoryGraph()]);
      setMemories(memoryList);
      setGraph(memoryGraph);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memories');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAdd() {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      await createMemory(content);
      setDraft('');
      await refresh(query.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add memory');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Memories</h1>
        <p className="text-sm text-zinc-400">
          The agent&apos;s long-term memory: hybrid semantic + keyword recall injects relevant
          memories into every turn. New memories are consolidated — duplicates merge, updates
          supersede, related memories link into a knowledge graph.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onAdd();
          }}
          placeholder="Add a memory… (e.g. I prefer TypeScript over JavaScript)"
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
        />
        <button
          onClick={() => void onAdd()}
          disabled={busy || !draft.trim()}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          Save
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void refresh(query.trim() || undefined);
          }}
          placeholder="Search memories (Enter)…"
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
        />
        <div className="flex gap-1 rounded-md border border-zinc-800 p-0.5">
          {(['list', 'graph'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                view === mode ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {view === 'graph' ? (
        graph ? (
          <GraphView graph={graph} />
        ) : (
          <p className="text-sm text-zinc-600">Loading…</p>
        )
      ) : memories === null ? (
        <p className="text-sm text-zinc-600">Loading…</p>
      ) : memories.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-600">
          No memories yet — chat with the agent or add one above.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          {memories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              onChanged={() => void refresh(query.trim() || undefined)}
              onError={setError}
            />
          ))}
        </section>
      )}
    </div>
  );
}
