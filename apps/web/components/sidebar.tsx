'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import type { Thread } from '@hyperagent/shared';

import { createThread, emitThreadsChanged, listThreads, THREADS_CHANGED_EVENT } from '@/lib/api';

function relativeTime(iso: string): string {
  const deltaSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (deltaSeconds < 60) return 'just now';
  const minutes = Math.round(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setThreads(await listThreads());
      setError(null);
    } catch {
      setThreads([]);
      setError('Server offline');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener(THREADS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(THREADS_CHANGED_EVENT, handler);
  }, [refresh]);

  async function onNewThread() {
    setCreating(true);
    try {
      const thread = await createThread();
      emitThreadsChanged();
      router.push(`/threads/${thread.id}`);
    } catch {
      setError('Server offline');
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-100">
          Self-Hosted Hyperagent
        </Link>
      </div>

      <div className="px-3">
        <button
          onClick={() => void onNewThread()}
          disabled={creating}
          className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {creating ? 'Creating…' : '+ New thread'}
        </button>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3 text-sm">
        <Link
          href="/"
          className={`rounded-md px-2 py-1.5 ${
            pathname === '/' ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Chat
        </Link>
        <Link
          href="/mcp"
          className={`rounded-md px-2 py-1.5 ${
            pathname === '/mcp' ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          MCP servers
        </Link>
        <Link
          href="/skills"
          className={`rounded-md px-2 py-1.5 ${
            pathname === '/skills'
              ? 'bg-zinc-900 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Skills
        </Link>
        <Link
          href="/settings"
          className={`rounded-md px-2 py-1.5 ${
            pathname === '/settings'
              ? 'bg-zinc-900 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Settings
        </Link>
        <span className="flex items-center justify-between rounded-md px-2 py-1.5 text-zinc-600">
          Observability
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            Phase 9
          </span>
        </span>
      </nav>

      <div className="mt-5 flex items-center justify-between px-5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
        <span>Threads</span>
        {error ? <span className="normal-case text-amber-500">{error}</span> : null}
      </div>

      <div className="mt-1 flex-1 overflow-y-auto px-3 pb-4">
        {threads === null ? (
          <p className="px-2 py-1.5 text-xs text-zinc-600">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-zinc-600">No threads yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {threads.map((thread) => {
              const active = pathname === `/threads/${thread.id}`;
              return (
                <li key={thread.id}>
                  <Link
                    href={`/threads/${thread.id}`}
                    className={`block rounded-md px-2 py-1.5 text-sm ${
                      active
                        ? 'bg-zinc-900 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                    }`}
                  >
                    <span className="block truncate">{thread.title}</span>
                    <span className="block text-[11px] text-zinc-600">
                      {relativeTime(thread.updatedAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
