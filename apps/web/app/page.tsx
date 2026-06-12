import { ServiceStatus } from '@/components/service-status';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-10 px-8 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
          Phases 3 & 4 — Agent loop + sandbox
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Your agent, your machine</h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Chat with 11 providers — Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Kimi, Z.ai,
          Qwen, Groq, OpenRouter — with streaming responses and an isolated code sandbox the agent
          can use. Add your API keys in{' '}
          <a href="/settings" className="text-emerald-400 hover:underline">
            Settings
          </a>
          , create a thread, and say hello.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-300">Services</h2>
        <ServiceStatus />
      </section>
    </div>
  );
}
