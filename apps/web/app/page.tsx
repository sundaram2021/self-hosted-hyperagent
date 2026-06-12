import { ServiceStatus } from '@/components/service-status';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-10 px-8 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
          Phase 2 — Data layer
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Your agent, your machine</h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Create a thread from the sidebar and your messages persist to Postgres. Model responses
          arrive in Phase 3 with the multi-provider agent loop — add your API keys in{' '}
          <a href="/settings" className="text-emerald-400 hover:underline">
            Settings
          </a>{' '}
          to be ready.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-300">Services</h2>
        <ServiceStatus />
      </section>
    </div>
  );
}
