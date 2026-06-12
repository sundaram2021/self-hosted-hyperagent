'use client';

import { useState } from 'react';

export interface ToolCallView {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  status: 'pending' | 'completed' | 'failed';
  latencyMs?: number | null;
}

function pretty(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StatusDot({ status }: { status: ToolCallView['status'] }) {
  if (status === 'pending') {
    return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />;
  }
  if (status === 'completed') {
    return <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-red-400" />;
}

/** Renders execute_code results specially; falls back to JSON for other tools. */
function ResultView({ tool }: { tool: ToolCallView }) {
  const result = tool.result as Record<string, unknown> | undefined;

  if (tool.toolName === 'execute_code' && result && typeof result === 'object') {
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    return (
      <div className="flex flex-col gap-2">
        {stdout ? (
          <pre className="overflow-x-auto rounded bg-zinc-950 p-2.5 text-[12px] leading-relaxed text-zinc-200">
            {stdout}
            {result.stdout_truncated === true ? '\n… (truncated)' : ''}
          </pre>
        ) : null}
        {stderr ? (
          <pre className="overflow-x-auto rounded bg-red-950/40 p-2.5 text-[12px] leading-relaxed text-red-300">
            {stderr}
          </pre>
        ) : null}
        <div className="flex gap-3 text-[11px] text-zinc-500">
          {result.timed_out === true ? (
            <span className="text-amber-400">timed out</span>
          ) : (
            <span>exit {String(result.exit_code ?? '?')}</span>
          )}
          {typeof result.duration_ms === 'number' ? <span>{result.duration_ms}ms</span> : null}
        </div>
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto rounded bg-zinc-950 p-2.5 text-[12px] leading-relaxed text-zinc-300">
      {pretty(tool.result)}
    </pre>
  );
}

export function ToolCallCard({ tool }: { tool: ToolCallView }) {
  const [open, setOpen] = useState(false);

  const argsView =
    tool.toolName === 'execute_code' &&
    tool.args &&
    typeof tool.args === 'object' &&
    'code' in (tool.args as Record<string, unknown>)
      ? String((tool.args as Record<string, unknown>).code)
      : pretty(tool.args);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs text-zinc-300">
          <StatusDot status={tool.status} />
          <span className="font-mono">{tool.toolName}</span>
          {typeof tool.latencyMs === 'number' ? (
            <span className="text-zinc-600">{tool.latencyMs}ms</span>
          ) : null}
        </span>
        <span className="text-xs text-zinc-600">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-zinc-800/60 px-3 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            Input
          </span>
          <pre className="overflow-x-auto rounded bg-zinc-950 p-2.5 text-[12px] leading-relaxed text-zinc-300">
            {argsView}
          </pre>
          {tool.status !== 'pending' ? (
            <>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Result
              </span>
              <ResultView tool={tool} />
            </>
          ) : (
            <span className="text-xs text-zinc-500">Running…</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
