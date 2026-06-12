'use client';

import { useCallback, useEffect, useState } from 'react';

import type { McpServer, McpTestResult, McpTransport } from '@hyperagent/shared';

import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  testMcpServer,
  updateMcpServer,
} from '@/lib/api';

function parseKeyValueLines(text: string): Record<string, string> | undefined {
  const map: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function AddServerForm({
  onAdded,
  onError,
}: {
  onAdded: () => void;
  onError: (m: string) => void;
}) {
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [secrets, setSecrets] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createMcpServer({
        name: name.trim(),
        transport,
        ...(transport === 'stdio'
          ? {
              command: command.trim(),
              args: args.trim() ? args.trim().split(/\s+/) : undefined,
              env: parseKeyValueLines(secrets),
            }
          : {
              url: url.trim(),
              headers: parseKeyValueLines(secrets),
            }),
      });
      setName('');
      setCommand('');
      setArgs('');
      setUrl('');
      setSecrets('');
      onAdded();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to add server');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="text-sm font-medium text-zinc-200">Add a public MCP server</h2>

      <div className="flex gap-2">
        {(['stdio', 'http', 'sse'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTransport(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              transport === t
                ? 'bg-emerald-500 text-emerald-950'
                : 'border border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. filesystem) — letters, digits, - and _"
        className={inputClass}
      />

      {transport === 'stdio' ? (
        <>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Command (e.g. npx)"
            className={inputClass}
          />
          <input
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="Arguments (e.g. -y @modelcontextprotocol/server-filesystem /tmp)"
            className={inputClass}
          />
        </>
      ) : (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (e.g. https://mcp.example.com/mcp)"
          className={inputClass}
        />
      )}

      <textarea
        value={secrets}
        onChange={(e) => setSecrets(e.target.value)}
        rows={2}
        placeholder={
          transport === 'stdio'
            ? 'Environment variables, one per line: API_KEY=value (stored encrypted)'
            : 'Headers, one per line: Authorization=Bearer xyz (stored encrypted)'
        }
        className={`${inputClass} resize-none font-mono text-xs`}
      />

      <button
        onClick={() => void onSubmit()}
        disabled={busy || !name.trim() || (transport === 'stdio' ? !command.trim() : !url.trim())}
        className="self-start rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
      >
        {busy ? 'Adding…' : 'Add server'}
      </button>
    </div>
  );
}

function ServerCard({
  server,
  onChanged,
  onError,
}: {
  server: McpServer;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<McpTestResult | null>(null);

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testMcpServer(server.id));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  async function onToggle() {
    try {
      await updateMcpServer(server.id, { enabled: !server.enabled });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  async function onDelete() {
    if (!window.confirm(`Remove MCP server "${server.name}"?`)) return;
    try {
      await deleteMcpServer(server.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-sm text-zinc-200">{server.name}</span>
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
            {server.transport}
          </span>
          {server.enabled ? (
            <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[11px] text-emerald-400">
              enabled
            </span>
          ) : (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-500">
              disabled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onTest()}
            disabled={testing}
            className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-800 hover:text-emerald-400 disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button
            onClick={() => void onToggle()}
            className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:text-zinc-100"
          >
            {server.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => void onDelete()}
            className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="font-mono text-xs text-zinc-500">
        {server.transport === 'stdio'
          ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}`
          : server.url}
      </p>

      {server.envKeys.length > 0 || server.headerKeys.length > 0 ? (
        <p className="text-xs text-zinc-600">
          {server.envKeys.length > 0 ? `env: ${server.envKeys.join(', ')}` : ''}
          {server.headerKeys.length > 0 ? `headers: ${server.headerKeys.join(', ')}` : ''}{' '}
          (encrypted)
        </p>
      ) : null}

      {testResult ? (
        testResult.ok ? (
          <div className="rounded-md border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
            Connected — {testResult.tools.length} tool{testResult.tools.length === 1 ? '' : 's'}:{' '}
            {testResult.tools.map((tool) => tool.name).join(', ') || 'none'}
          </div>
        ) : (
          <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {testResult.error}
          </div>
        )
      ) : null}
    </div>
  );
}

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setServers(await listMcpServers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load servers');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">MCP servers</h1>
        <p className="text-sm text-zinc-400">
          Connect any public MCP server — stdio commands (npx, uvx) or remote HTTP/SSE endpoints.
          Tools from enabled servers are available to the agent in every thread, namespaced as{' '}
          <code className="rounded bg-zinc-900 px-1">server__tool</code>.
        </p>
        <p className="text-xs text-amber-400/80">
          MCP servers run third-party code with this machine&apos;s permissions — only add servers
          you trust.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <AddServerForm onAdded={() => void refresh()} onError={setError} />

      <section className="flex flex-col gap-3">
        {servers === null ? (
          <p className="text-sm text-zinc-600">Loading…</p>
        ) : servers.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No servers yet. Try{' '}
            <code className="rounded bg-zinc-900 px-1 text-xs">
              npx -y @modelcontextprotocol/server-everything
            </code>
          </p>
        ) : (
          servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onChanged={() => void refresh()}
              onError={setError}
            />
          ))
        )}
      </section>
    </div>
  );
}
