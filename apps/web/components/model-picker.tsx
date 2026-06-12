'use client';

import { useMemo, useState } from 'react';

import type { ProviderModels } from '@hyperagent/shared';

export interface ModelSelection {
  provider: string;
  model: string;
}

const CUSTOM = '__custom__';

export function ModelPicker({
  providers,
  value,
  onChange,
  disabled,
}: {
  providers: ProviderModels[];
  value: ModelSelection;
  onChange: (selection: ModelSelection) => void;
  disabled?: boolean;
}) {
  const current = useMemo(
    () => providers.find((p) => p.id === value.provider),
    [providers, value.provider],
  );
  const isCatalogModel = current?.models.some((m) => m.id === value.model) ?? false;
  const [customMode, setCustomMode] = useState(!isCatalogModel && value.model !== '');

  function selectProvider(providerId: string) {
    const provider = providers.find((p) => p.id === providerId);
    const firstModel = provider?.models[0]?.id ?? '';
    setCustomMode(false);
    onChange({ provider: providerId, model: firstModel });
  }

  function selectModel(modelId: string) {
    if (modelId === CUSTOM) {
      setCustomMode(true);
      onChange({ provider: value.provider, model: '' });
      return;
    }
    setCustomMode(false);
    onChange({ provider: value.provider, model: modelId });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.provider}
        onChange={(e) => selectProvider(e.target.value)}
        disabled={disabled}
        className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500 disabled:opacity-50"
      >
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.label}
            {provider.keySource === 'none' ? ' (no key)' : ''}
          </option>
        ))}
      </select>

      {customMode ? (
        <input
          autoFocus
          value={value.model}
          onChange={(e) => onChange({ provider: value.provider, model: e.target.value })}
          placeholder="custom model id…"
          disabled={disabled}
          className="w-48 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500 disabled:opacity-50"
        />
      ) : (
        <select
          value={value.model}
          onChange={(e) => selectModel(e.target.value)}
          disabled={disabled}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500 disabled:opacity-50"
        >
          {(current?.models ?? []).map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </select>
      )}

      {current?.keySource === 'none' ? (
        <a href="/settings" className="text-[11px] text-amber-400 hover:underline">
          ⚠ add a key in Settings
        </a>
      ) : null}
    </div>
  );
}
