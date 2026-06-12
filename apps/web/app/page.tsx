import { ServiceStatus } from '@/components/service-status';

const FEATURES = [
  { name: 'Multi-provider chat', phase: 3 },
  { name: 'Code sandbox', phase: 4 },
  { name: 'MCP servers', phase: 5 },
  { name: 'Skills', phase: 6 },
  { name: 'Exa search', phase: 7 },
  { name: 'Memory engine', phase: 8 },
  { name: 'Observability', phase: 9 },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
          Phase 1 — Foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Self-Hosted Hyperagent</h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
          A multi-provider agent platform that runs on your machine: MCP servers, Skills, Exa
          search, a memory engine, and built-in observability. No auth, no billing — just your
          API keys.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-300">Services</h2>
        <ServiceStatus />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-300">Coming up</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li
              key={feature.name}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300"
            >
              <span>{feature.name}</span>
              <span className="text-xs text-zinc-500">Phase {feature.phase}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
