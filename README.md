# Self-Hosted Hyperagent

A self-hosted, multi-provider AI agent platform. Bring your own API keys and run the whole stack on your machine — no auth, no billing, no external dependencies beyond the model providers you choose.

## Features (roadmap)

| Phase | Feature                                                                                                                           | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1     | Monorepo foundation — apps, packages, CI, Postgres                                                                                | ✅     |
| 2     | Data layer (Drizzle + Postgres), threads & settings, app shell                                                                    | ✅     |
| 3     | Multi-provider agent loop (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Kimi, Z.ai, Qwen, Groq, OpenRouter), streaming chat | ✅     |
| 4     | Python sandbox — isolated code execution                                                                                          | ✅     |
| 5     | MCP servers — connect any public MCP (stdio / HTTP / SSE)                                                                         | ⬜     |
| 6     | Skills — install any public Agent Skill                                                                                           | ⬜     |
| 7     | Exa web search with citations                                                                                                     | ⬜     |
| 8     | Memory engine — knowledge graph, hybrid recall, consolidation                                                                     | ⬜     |
| 9     | Observability — traces, token/cost analytics, conversation insights                                                               | ⬜     |
| 10    | Production hardening — Docker images, one-command deploy                                                                          | ⬜     |

## Architecture

```
apps/
  web/        Next.js 15 UI (port 3000) — app shell, threads, settings
  server/     Fastify agent runtime — agent loop, SSE, MCP connections (port 8787)
  sandbox/    Python FastAPI executor — skill scripts & generated code (port 8788)
packages/
  shared/     Zod schemas, shared types, API contracts, provider catalog
  db/         Drizzle ORM schema + embedded migrations (threads, messages, runs, settings)
infra:        Postgres 16 + pgvector via docker-compose
```

## Chat & the agent loop

- **11 providers, one loop**: pick any provider/model per thread (or type a custom model id). The agent runs a multi-step tool-calling loop (Vercel AI SDK) with SSE streaming, persisted runs, and telemetry spans (`llm_calls`, `tool_calls`) for the observability tab (Phase 9).
- **execute_code tool**: the agent can run Python 3.12 or Bash in the sandbox service — per-execution temp dirs, minimal env (no secrets inherited), CPU/memory/file rlimits, 64KB output caps, and hard wall-clock timeouts that kill the whole process group.
- Stop generation any time; partial output is persisted so a refresh shows a consistent conversation.

## Data & settings

- **Migrations** run automatically when the server boots (`MIGRATE_ON_START=true`). They are embedded in `@hyperagent/db` — append-only, transactional, tracked in a `_migrations` table.
- **Provider keys** resolve env-first: an environment variable (e.g. `ANTHROPIC_API_KEY`) always beats a key saved in the Settings UI. UI-saved keys are encrypted at rest with AES-256-GCM under `APP_SECRET` and are never returned by the API.
- Supported providers: Anthropic, OpenAI, Google Gemini, xAI, DeepSeek, Mistral, Kimi (Moonshot), Z.ai (GLM), Qwen, Groq, OpenRouter.

## Prerequisites

- Node.js >= 22 and [pnpm](https://pnpm.io) >= 10 (`corepack enable`)
- [uv](https://docs.astral.sh/uv/) for the Python sandbox
- Docker (for Postgres)

## Quickstart

```bash
# 1. Infrastructure
docker compose up -d postgres

# 2. Environment
cp .env.example .env

# 3. TypeScript apps (web + server)
pnpm install
pnpm dev

# 4. Python sandbox (separate terminal)
cd apps/sandbox
uv sync
uv run uvicorn app.main:app --port 8788 --reload
```

Open http://localhost:3000 — the landing page shows live health status for all three services.

## Development

| Command                            | What it does                                   |
| ---------------------------------- | ---------------------------------------------- |
| `pnpm dev`                         | Run web + server in watch mode (via Turborepo) |
| `pnpm build`                       | Build all TypeScript packages and apps         |
| `pnpm typecheck`                   | Type-check the workspace                       |
| `pnpm test`                        | Run vitest suites                              |
| `pnpm lint` / `pnpm format`        | ESLint / Prettier                              |
| `cd apps/sandbox && uv run pytest` | Python tests                                   |

## Security model (v1)

There is no authentication yet. Services bind to `127.0.0.1` by default. If you expose this stack beyond your machine, put a reverse proxy with auth (e.g. Caddy + basic auth) in front of it. Provider API keys are supplied via environment variables; from Phase 2 they can also be stored AES-256-GCM encrypted in Postgres under `APP_SECRET`.
