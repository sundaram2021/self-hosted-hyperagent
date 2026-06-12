'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Message, Thread } from '@hyperagent/shared';

import {
  ApiError,
  deleteThread,
  emitThreadsChanged,
  getThread,
  listMessages,
  renameThread,
  sendUserMessage,
} from '@/lib/api';

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {message.role}
      </span>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm leading-relaxed text-zinc-200">
        {message.parts.map((part, index) =>
          part.type === 'text' && 'text' in part ? (
            <p key={index} className="whitespace-pre-wrap">
              {String(part.text)}
            </p>
          ) : (
            <p key={index} className="text-zinc-500">
              [{part.type}]
            </p>
          ),
        )}
      </div>
    </div>
  );
}

export default function ThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const threadId = params.id;

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([getThread(threadId), listMessages(threadId)]);
      setThread(t);
      setMessages(m);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        router.push('/');
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to load thread');
    }
  }, [threadId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function onSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendUserMessage(threadId, text);
      setMessages((prev) => [...prev, message]);
      setDraft('');
      emitThreadsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function onRename() {
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!title || !thread || title === thread.title) return;
    try {
      const updated = await renameThread(threadId, title);
      setThread(updated);
      emitThreadsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename');
    }
  }

  async function onDelete() {
    if (!window.confirm('Delete this thread and all of its messages?')) return;
    try {
      await deleteThread(threadId);
      emitThreadsChanged();
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void onRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onRename();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            className="w-72 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        ) : (
          <button
            className="truncate text-sm font-medium text-zinc-200 hover:text-white"
            title="Click to rename"
            onClick={() => {
              setTitleDraft(thread?.title ?? '');
              setEditingTitle(true);
            }}
          >
            {thread?.title ?? 'Loading…'}
          </button>
        )}
        <button
          onClick={() => void onDelete()}
          className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-red-400"
        >
          Delete
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-300">
            Persistence is live — messages are stored in Postgres. Agent responses arrive in Phase 3
            (multi-provider loop).
          </div>

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-600">
              No messages yet. Say something below.
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              rows={2}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              className="flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
            />
            <button
              onClick={() => void onSend()}
              disabled={sending || draft.trim().length === 0}
              className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
            >
              {sending ? 'Saving…' : 'Send'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
