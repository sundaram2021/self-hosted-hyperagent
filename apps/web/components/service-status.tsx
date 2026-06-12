'use client';

import { useEffect, useState } from 'react';

import type { HealthResponse } from '@hyperagent/shared';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:8787';
const SANDBOX_URL = process.env.NEXT_PUBLIC_SANDBOX_URL ?? 'http://localhost:8788';

type ProbeState =
  | { status: 'checking' }
  | { status: 'online'; health: HealthResponse }
  | { status: 'offline' };

async function probe(baseUrl: string): Promise<ProbeState> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return { status: 'offline' };
    const health = (await response.json()) as HealthResponse;
    return { status: 'online', health };
  } catch {
    return { status: 'offline' };
  }
}

function StatusBadge({ state }: { state: ProbeState }) {
  if (state.status === 'checking') {
    return <span className="text-xs text-zinc-500">checking…</span>;
  }
  if (state.status === 'online') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        online · v{state.health.version}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
      offline
    </span>
  );
}

function ServiceRow({ name, detail, state }: { name: string; detail: string; state: ProbeState }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="flex flex-col">
        <span className="text-sm text-zinc-200">{name}</span>
        <span className="text-xs text-zinc-500">{detail}</span>
      </div>
      <StatusBadge state={state} />
    </div>
  );
}

export function ServiceStatus() {
  const [serverState, setServerState] = useState<ProbeState>({ status: 'checking' });
  const [sandboxState, setSandboxState] = useState<ProbeState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;

    void probe(SERVER_URL).then((state) => {
      if (!cancelled) setServerState(state);
    });
    void probe(SANDBOX_URL).then((state) => {
      if (!cancelled) setSandboxState(state);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <ServiceRow
        name="Web"
        detail="Next.js UI"
        state={{
          status: 'online',
          health: {
            status: 'ok',
            service: 'web',
            version: '0.1.0',
            uptimeSeconds: 0,
            timestamp: new Date().toISOString(),
          },
        }}
      />
      <ServiceRow name="Agent server" detail={`Fastify · ${SERVER_URL}`} state={serverState} />
      <ServiceRow name="Sandbox" detail={`FastAPI · ${SANDBOX_URL}`} state={sandboxState} />
    </div>
  );
}
