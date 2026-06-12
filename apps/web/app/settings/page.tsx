'use client';

import { useCallback, useEffect, useState } from 'react';

import type { IntegrationStatus, ProviderStatus } from '@hyperagent/shared';

import {
  deleteIntegrationKey,
  deleteProviderKey,
  listIntegrations,
  listProviders,
  saveIntegrationKey,
  saveProviderKey,
} from '@/lib/api';

function KeySourceBadge({ source }: { source: ProviderStatus['keySource'] }) {
  if (source === 'env') {
    return (
      <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
        from env
      </span>
    );
  }
  if (source === 'database') {
    return (
      <span className="rounded-full bg-sky-950 px-2 py-0.5 text-[11px] font-medium text-sky-400">
        stored · encrypted
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
      not set
    </span>
  );
}

function ProviderRow({
  provider,
  onChanged,
  onError,
}: {
  provider: ProviderStatus;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSave() {
    const apiKey = draft.trim();
    if (!apiKey) return;
    setBusy(true);
    onError(null);
    try {
      await saveProviderKey(provider.id, apiKey);
      setDraft('');
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save key');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    onError(null);
    try {
      await deleteProviderKey(provider.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to remove key');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-zinc-200">{provider.label}</span>
          <KeySourceBadge source={provider.keySource} />
        </div>
        <a
          href={provider.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:text-emerald-400"
        >
          Get a key ↗
        </a>
      </div>

      {provider.keySource === 'env' ? (
        <p className="text-xs text-zinc-500">
          Using <code className="rounded bg-zinc-900 px-1 py-0.5">{provider.keyEnvVar}</code> from
          the environment (overrides any stored key).
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              provider.keySource === 'database' ? 'Replace stored key…' : 'Paste API key…'
            }
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          />
          <button
            onClick={() => void onSave()}
            disabled={busy || draft.trim().length === 0}
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            Save
          </button>
          {provider.keySource === 'database' ? (
            <button
              onClick={() => void onRemove()}
              disabled={busy}
              className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:border-red-900 hover:text-red-400 disabled:opacity-40"
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IntegrationRow({
  integration,
  onChanged,
  onError,
}: {
  integration: IntegrationStatus;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSave() {
    const apiKey = draft.trim();
    if (!apiKey) return;
    setBusy(true);
    onError(null);
    try {
      await saveIntegrationKey(integration.id, apiKey);
      setDraft('');
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save key');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    onError(null);
    try {
      await deleteIntegrationKey(integration.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to remove key');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-zinc-200">{integration.label}</span>
          <KeySourceBadge source={integration.keySource} />
        </div>
        <a
          href={integration.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:text-emerald-400"
        >
          Get a key ↗
        </a>
      </div>
      <p className="text-xs text-zinc-500">{integration.description}</p>

      {integration.keySource === 'env' ? (
        <p className="text-xs text-zinc-500">
          Using <code className="rounded bg-zinc-900 px-1 py-0.5">{integration.keyEnvVar}</code>{' '}
          from the environment (overrides any stored key).
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              integration.keySource === 'database' ? 'Replace stored key…' : 'Paste API key…'
            }
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          />
          <button
            onClick={() => void onSave()}
            disabled={busy || draft.trim().length === 0}
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            Save
          </button>
          {integration.keySource === 'database' ? (
            <button
              onClick={() => void onRemove()}
              disabled={busy}
              className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:border-red-900 hover:text-red-400 disabled:opacity-40"
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appSecretMissing, setAppSecretMissing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([listProviders(), listIntegrations()]);
      setProviders(p);
      setIntegrations(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load providers');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleError(message: string | null) {
    setError(message);
    setAppSecretMissing(message !== null && (message.includes('APP_SECRET') || false));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-400">
          Configure provider API keys. Environment variables always win; keys saved here are
          encrypted at rest with AES-256-GCM under your <code>APP_SECRET</code>.
        </p>
      </header>

      {appSecretMissing ? (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-xs leading-relaxed text-amber-300">
          <strong>APP_SECRET is not set.</strong> Add it to your <code>.env</code> to store keys
          here — generate one with <code>openssl rand -hex 32</code>, then restart the server.
        </div>
      ) : null}

      {error && !appSecretMissing ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-300">Model providers</h2>
        {providers === null ? (
          <p className="text-sm text-zinc-600">Loading…</p>
        ) : (
          providers.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              onChanged={() => void refresh()}
              onError={handleError}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-300">Integrations</h2>
        {integrations === null ? (
          <p className="text-sm text-zinc-600">Loading…</p>
        ) : (
          integrations.map((integration) => (
            <IntegrationRow
              key={integration.id}
              integration={integration}
              onChanged={() => void refresh()}
              onError={handleError}
            />
          ))
        )}
      </section>
    </div>
  );
}
