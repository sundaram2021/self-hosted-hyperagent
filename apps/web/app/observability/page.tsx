'use client';

import { useCallback, useEffect, useState } from 'react';

import type {
  ObsInsights,
  ObsModelStat,
  ObsOverview,
  ObsRunSummary,
  ObsTimeseriesPoint,
  ObsTrace,
  ProviderModels,
} from '@hyperagent/shared';

import { ModelPicker, type ModelSelection } from '@/components/model-picker';
import {
  generateObsInsights,
  getObsByModel,
  getObsInsights,
  getObsOverview,
  getObsRuns,
  getObsTimeseries,
  getObsTrace,
  listModels,
} from '@/lib/api';

function formatCost(value: number | null): string {
  if (value === null) return '—';
  return value < 0.01 && value > 0 ? '<$0.01' : `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-xl font-semibold text-zinc-100">{value}</span>
      {hint ? <span className="text-[11px] text-zinc-600">{hint}</span> : null}
    </div>
  );
}

/** Hand-rolled bar chart — no chart dependency needed for daily bars. */
function BarChart({
  points,
  metric,
  color,
}: {
  points: ObsTimeseriesPoint[];
  metric: (p: ObsTimeseriesPoint) => number;
  color: string;
}) {
  const max = Math.max(1, ...points.map(metric));
  return (
    <div className="flex h-24 items-end gap-1">
      {points.map((point) => {
        const value = metric(point);
        return (
          <div key={point.date} className="group relative flex-1">
            <div
              className={`${color} w-full rounded-t`}
              style={{ height: `${Math.max(2, (value / max) * 88)}px` }}
            />
            <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 group-hover:block">
              {point.date.slice(5)}: {formatTokens(value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TraceWaterfall({ trace }: { trace: ObsTrace }) {
  const total = Math.max(
    1,
    ...trace.spans.map((span) => span.startOffsetMs + (span.durationMs ?? 0)),
    trace.run.durationMs ?? 0,
  );

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          {trace.run.provider}/{trace.run.model} · {trace.run.status}
        </span>
        <span>
          {trace.run.durationMs !== null ? `${trace.run.durationMs}ms` : ''}{' '}
          {formatCost(trace.run.estimatedCostUsd)}
        </span>
      </div>
      {trace.spans.length === 0 ? (
        <p className="text-xs text-zinc-600">No spans recorded.</p>
      ) : (
        trace.spans.map((span) => {
          const left = (span.startOffsetMs / total) * 100;
          const width = Math.max(1.5, ((span.durationMs ?? 0) / total) * 100);
          return (
            <div key={span.id} className="flex items-center gap-2">
              <span className="w-44 truncate font-mono text-[11px] text-zinc-400">{span.name}</span>
              <div className="relative h-4 flex-1 rounded bg-zinc-900">
                <div
                  className={`absolute top-0 h-4 rounded ${
                    span.status === 'failed'
                      ? 'bg-red-500/80'
                      : span.kind === 'llm'
                        ? 'bg-emerald-500/80'
                        : 'bg-sky-500/80'
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
              <span className="w-24 text-right text-[11px] text-zinc-500">
                {span.durationMs !== null ? `${span.durationMs}ms` : '—'}
                {span.inputTokens !== null ? ` · ${formatTokens(span.inputTokens)}↑` : ''}
              </span>
            </div>
          );
        })
      )}
      {trace.run.error ? (
        <p className="rounded bg-red-950/40 px-2 py-1.5 text-[11px] text-red-300">
          {trace.run.error}
        </p>
      ) : null}
    </div>
  );
}

function InsightsPanel({ providers }: { providers: ProviderModels[] }) {
  const [insights, setInsights] = useState<ObsInsights | null>(null);
  const [selection, setSelection] = useState<ModelSelection>({ provider: '', model: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getObsInsights().then(setInsights);
  }, []);

  useEffect(() => {
    if (!selection.provider && providers.length > 0) {
      const withKey = providers.find((p) => p.keySource !== 'none');
      const fallback = withKey ?? providers[0]!;
      setSelection({ provider: fallback.id, model: fallback.models[0]?.id ?? '' });
    }
  }, [providers, selection.provider]);

  async function onGenerate() {
    if (!selection.provider || !selection.model) return;
    setBusy(true);
    setError(null);
    try {
      setInsights(await generateObsInsights(selection.provider, selection.model));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights');
    } finally {
      setBusy(false);
    }
  }

  const section = (title: string, items: string[]) =>
    items.length > 0 ? (
      <div className="flex flex-col gap-1">
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{title}</h4>
        <ul className="flex flex-col gap-1">
          {items.map((item, index) => (
            <li key={index} className="text-xs leading-relaxed text-zinc-300">
              • {item}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Conversation insights</h2>
          <p className="text-[11px] text-zinc-500">
            LLM analysis of recent conversations — frustration signals, topics, failure patterns.
            Opt-in: generating spends tokens on the selected model.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ModelPicker
            providers={providers}
            value={selection}
            onChange={setSelection}
            disabled={busy}
          />
          <button
            onClick={() => void onGenerate()}
            disabled={busy || !selection.model}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? 'Analyzing…' : 'Generate'}
          </button>
        </div>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {insights ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-zinc-300">{insights.summary}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {section('Frustration signals', insights.frustrationSignals)}
            {section('Topics', insights.topics)}
            {section('Failure patterns', insights.failurePatterns)}
            {section('Suggestions', insights.suggestions)}
          </div>
          <p className="text-[10px] text-zinc-600">
            Generated {new Date(insights.generatedAt).toLocaleString()} · {insights.analyzedThreads}{' '}
            threads analyzed
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-600">No insights generated yet.</p>
      )}
    </section>
  );
}

export default function ObservabilityPage() {
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState<ObsOverview | null>(null);
  const [timeseries, setTimeseries] = useState<ObsTimeseriesPoint[]>([]);
  const [byModel, setByModel] = useState<ObsModelStat[]>([]);
  const [runs, setRuns] = useState<ObsRunSummary[]>([]);
  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const [trace, setTrace] = useState<ObsTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [o, t, m, r, p] = await Promise.all([
        getObsOverview(days),
        getObsTimeseries(days),
        getObsByModel(days),
        getObsRuns(days),
        listModels(),
      ]);
      setOverview(o);
      setTimeseries(t);
      setByModel(m);
      setRuns(r);
      setProviders(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load observability data');
    }
  }, [days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSelectRun(runId: string) {
    if (trace?.run.id === runId) {
      setTrace(null);
      return;
    }
    try {
      setTrace(await getObsTrace(runId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trace');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-10">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Observability</h1>
          <p className="text-sm text-zinc-400">
            Usage, cost, latency, and traces for every agent run on this machine.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none"
        >
          <option value={1}>24 hours</option>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
        </select>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      {overview ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Runs" value={String(overview.runs)} />
          <StatCard
            label="Success"
            value={
              overview.successRate !== null ? `${Math.round(overview.successRate * 100)}%` : '—'
            }
            hint={`${overview.failedRuns} failed`}
          />
          <StatCard label="Tokens" value={formatTokens(overview.totalTokens)} />
          <StatCard
            label="Est. cost"
            value={formatCost(overview.estimatedCostUsd)}
            hint={overview.unpricedCalls > 0 ? `${overview.unpricedCalls} unpriced` : undefined}
          />
          <StatCard
            label="Latency p50"
            value={overview.latencyP50Ms !== null ? `${overview.latencyP50Ms}ms` : '—'}
            hint={overview.latencyP95Ms !== null ? `p95 ${overview.latencyP95Ms}ms` : undefined}
          />
          <StatCard label="Errors" value={String(overview.errors)} />
        </section>
      ) : (
        <p className="text-sm text-zinc-600">Loading…</p>
      )}

      {timeseries.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="mb-3 text-xs font-medium text-zinc-300">Tokens / day</h3>
            <BarChart points={timeseries} metric={(p) => p.totalTokens} color="bg-emerald-500/70" />
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="mb-3 text-xs font-medium text-zinc-300">LLM calls / day</h3>
            <BarChart points={timeseries} metric={(p) => p.llmCalls} color="bg-sky-500/70" />
          </div>
        </section>
      ) : null}

      {byModel.length > 0 ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-3 text-xs font-medium text-zinc-300">By model</h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-zinc-600">
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium">Calls</th>
                <th className="pb-2 font-medium">Tokens</th>
                <th className="pb-2 font-medium">Cost</th>
                <th className="pb-2 font-medium">Avg latency</th>
                <th className="pb-2 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((stat) => (
                <tr key={`${stat.provider}:${stat.model}`} className="border-t border-zinc-800/60">
                  <td className="py-2 font-mono text-zinc-300">
                    {stat.provider}/{stat.model}
                  </td>
                  <td className="py-2 text-zinc-400">{stat.calls}</td>
                  <td className="py-2 text-zinc-400">
                    {formatTokens(stat.inputTokens + stat.outputTokens)}
                  </td>
                  <td className="py-2 text-zinc-400">{formatCost(stat.estimatedCostUsd)}</td>
                  <td className="py-2 text-zinc-400">
                    {stat.avgLatencyMs !== null ? `${stat.avgLatencyMs}ms` : '—'}
                  </td>
                  <td className={`py-2 ${stat.errors > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                    {stat.errors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-zinc-300">Recent runs</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-600">No runs yet — go chat with the agent.</p>
        ) : (
          runs.slice(0, 25).map((run) => (
            <div key={run.id} className="flex flex-col gap-2">
              <button
                onClick={() => void onSelectRun(run.id)}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left hover:border-zinc-700"
              >
                <span className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      run.status === 'completed'
                        ? 'bg-emerald-400'
                        : run.status === 'failed'
                          ? 'bg-red-400'
                          : 'bg-amber-400'
                    }`}
                  />
                  <span className="text-zinc-300">{run.threadTitle ?? run.threadId}</span>
                  <span className="font-mono text-zinc-600">
                    {run.provider}/{run.model}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-[11px] text-zinc-500">
                  {run.totalTokens !== null ? (
                    <span>{formatTokens(run.totalTokens)} tok</span>
                  ) : null}
                  <span>{formatCost(run.estimatedCostUsd)}</span>
                  {run.durationMs !== null ? (
                    <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                  ) : null}
                  <span>{new Date(run.createdAt).toLocaleTimeString()}</span>
                </span>
              </button>
              {trace?.run.id === run.id ? <TraceWaterfall trace={trace} /> : null}
            </div>
          ))
        )}
      </section>

      <InsightsPanel providers={providers} />
    </div>
  );
}
