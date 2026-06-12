'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Message, MessagePart, ProviderModels, Thread } from '@hyperagent/shared';

import { Markdown } from '@/components/markdown';
import { ModelPicker, type ModelSelection } from '@/components/model-picker';
import { ToolCallCard, type ToolCallView } from '@/components/tool-call-card';
import {
  ApiError,
  deleteThread,
  emitThreadsChanged,
  getThread,
  listMessages,
  listModels,
  renameThread,
  streamChat,
} from '@/lib/api';

type LiveToolPart = ToolCallView & { type: 'tool-call'; [key: string]: unknown };

function isToolPart(part: MessagePart): part is MessagePart & LiveToolPart {
  return part.type === 'tool-call';
}

function PartView({ part }: { part: MessagePart }) {
  if (part.type === 'text' && 'text' in part) {
    return <Markdown>{String(part.text)}</Markdown>;
  }
  if (isToolPart(part)) {
    return (
      <ToolCallCard
        tool={{
          toolCallId: String(part.toolCallId ?? ''),
          toolName: String(part.toolName ?? 'tool'),
          args: part.args,
          result: part.result,
          status: (part.status as ToolCallView['status']) ?? 'completed',
          latencyMs: typeof part.latencyMs === 'number' ? part.latencyMs : null,
        }}
      />
    );
  }
  return <p className="text-xs text-zinc-600">[{part.type}]</p>;
}

function MessageView({ role, parts }: { role: Message['role']; parts: MessagePart[] }) {
  const isUser = role === 'user';
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {isUser ? 'you' : role}
      </span>
      <div
        className={
          isUser
            ? 'self-start rounded-lg bg-emerald-950/40 px-4 py-3 text-sm leading-relaxed text-zinc-100'
            : 'flex flex-col gap-2.5'
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">
            {parts
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('\n')}
          </p>
        ) : (
          parts.map((part, index) => <PartView key={index} part={part} />)
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
  const [liveParts, setLiveParts] = useState<MessagePart[] | null>(null);
  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const [selection, setSelection] = useState<ModelSelection>({ provider: '', model: '' });
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectionReady = selection.provider !== '' && selection.model !== '';

  const defaultSelection = useCallback((t: Thread | null, p: ProviderModels[]): ModelSelection => {
    if (t?.lastProvider && t.lastModel) {
      return { provider: t.lastProvider, model: t.lastModel };
    }
    const withKey = p.find((entry) => entry.keySource !== 'none' && entry.models.length > 0);
    const fallback = withKey ?? p[0];
    return {
      provider: fallback?.id ?? '',
      model: fallback?.models[0]?.id ?? '',
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [t, m, p] = await Promise.all([
        getThread(threadId),
        listMessages(threadId),
        listModels(),
      ]);
      setThread(t);
      setMessages(m);
      setProviders(p);
      setSelection((current) => (current.provider ? current : defaultSelection(t, p)));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        router.push('/');
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to load thread');
    }
  }, [threadId, router, defaultSelection]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, liveParts]);

  const appendLiveText = useCallback((delta: string) => {
    setLiveParts((parts) => {
      const next = [...(parts ?? [])];
      const last = next[next.length - 1];
      if (last && last.type === 'text' && 'text' in last) {
        next[next.length - 1] = { type: 'text', text: String(last.text) + delta };
      } else {
        next.push({ type: 'text', text: delta });
      }
      return next;
    });
  }, []);

  async function onSend() {
    const text = draft.trim();
    if (!text || streaming || !selectionReady) return;

    setStreaming(true);
    setError(null);
    setDraft('');

    // Optimistic user message; replaced by server truth after the stream.
    setMessages((prev) => [
      ...prev,
      {
        id: `optimistic-${Date.now()}`,
        threadId,
        role: 'user',
        parts: [{ type: 'text', text }],
        createdAt: new Date().toISOString(),
      },
    ]);
    setLiveParts([]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      for await (const event of streamChat(
        threadId,
        { text, provider: selection.provider as never, model: selection.model },
        abortController.signal,
      )) {
        switch (event.type) {
          case 'text-delta':
            appendLiveText(event.delta);
            break;
          case 'tool-call':
            setLiveParts((parts) => [
              ...(parts ?? []),
              {
                type: 'tool-call',
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                args: event.args,
                status: 'pending',
              },
            ]);
            break;
          case 'tool-result':
            setLiveParts((parts) =>
              (parts ?? []).map((part) =>
                isToolPart(part) && part.toolCallId === event.toolCallId
                  ? {
                      ...part,
                      result: event.result,
                      status: event.status,
                      latencyMs: event.latencyMs ?? undefined,
                    }
                  : part,
              ),
            );
            break;
          case 'run-error':
            setError(event.message);
            break;
          default:
            break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stream failed');
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setLiveParts(null);
      try {
        const [m, t] = await Promise.all([listMessages(threadId), getThread(threadId)]);
        setMessages(m);
        setThread(t);
      } catch {
        // Keep optimistic state if the reload fails; next interaction retries.
      }
      emitThreadsChanged();
    }
  }

  function onStop() {
    abortRef.current?.abort();
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

  const showEmptyState = messages.length === 0 && liveParts === null;
  const currentProvider = useMemo(
    () => providers.find((p) => p.id === selection.provider),
    [providers, selection.provider],
  );

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
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.map((message) => (
            <MessageView key={message.id} role={message.role} parts={message.parts} />
          ))}

          {liveParts !== null ? <MessageView role="assistant" parts={liveParts} /> : null}

          {streaming && liveParts !== null && liveParts.length === 0 ? (
            <p className="text-xs text-zinc-500">Thinking…</p>
          ) : null}

          {showEmptyState ? (
            <p className="py-8 text-center text-sm text-zinc-600">
              {currentProvider?.keySource === 'none'
                ? 'Pick a provider with a configured key (or add one in Settings), then say hello.'
                : 'Say something below — the agent replies with your selected model.'}
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          <ModelPicker
            providers={providers}
            value={selection}
            onChange={setSelection}
            disabled={streaming}
          />

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
            {streaming ? (
              <button
                onClick={onStop}
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-red-800 hover:text-red-400"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => void onSend()}
                disabled={draft.trim().length === 0 || !selectionReady}
                className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
