# Self-Hosting Guide

Run the full stack — web UI, agent server, code sandbox, Postgres — on your own machine with one command.

## One-command deploy (Docker)

```bash
cp .env.example .env                 # set APP_SECRET + the provider keys you use
docker compose -f docker-compose.prod.yml up -d --build
```

Open http://localhost:3000. Everything binds to `127.0.0.1` by default.

| Service  | Port | What it is                             |
| -------- | ---- | -------------------------------------- |
| web      | 3000 | Next.js UI                             |
| server   | 8787 | Agent runtime (API + SSE)              |
| sandbox  | 8788 | Isolated code execution (FastAPI)      |
| postgres | —    | Internal only (pgvector/pgvector:pg16) |

Database migrations run automatically when the server boots.

## Environment variables

| Variable                                          | Required     | Notes                                                                              |
| ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| `APP_SECRET`                                      | Recommended  | Encrypts keys saved via Settings (AES-256-GCM). `openssl rand -hex 32`             |
| `POSTGRES_PASSWORD`                               | Recommended  | Defaults to `hyperagent` for local use                                             |
| `ANTHROPIC_API_KEY` … `OPENROUTER_API_KEY`        | At least one | Or add keys in Settings after boot                                                 |
| `EXA_API_KEY`                                     | Optional     | Enables web search tools                                                           |
| `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Optional     | Also powers memory embeddings (hybrid recall degrades to keyword-only without one) |
| `MEMORY_AUTO_EXTRACT`                             | Optional     | `true` enables post-turn memory extraction (spends tokens; default off)            |
| `GITHUB_TOKEN`                                    | Optional     | Raises rate limits for skill installs                                              |
| `RATE_LIMIT_MAX`                                  | Optional     | API requests/minute (default 600)                                                  |

## Exposing beyond localhost

There is **no authentication in v1**. If you expose the stack, put a reverse proxy with auth in front and keep the service ports bound to localhost. Example with Caddy (basic auth):

```caddy
agent.example.com {
  basic_auth {
    me $2a$14$...   # caddy hash-password
  }
  reverse_proxy localhost:3000
}
```

The browser talks directly to the server (8787) and sandbox (8788), so when exposing remotely:

1. Proxy those too (e.g. `agent-api.example.com` → 8787) behind the same auth.
2. Rebuild web with the public URLs: `NEXT_PUBLIC_SERVER_URL=https://agent-api.example.com docker compose -f docker-compose.prod.yml up -d --build web`
3. Set `WEB_ORIGIN=https://agent.example.com` so CORS allows the UI.

## MCP servers in Docker

stdio MCP servers run **inside the server container**: `npx`-based servers work out of the box. For `uvx`-based servers, extend the image:

```dockerfile
FROM self-hosted-hyperagent-server
RUN apt-get update && apt-get install -y python3-pip && pip install uv --break-system-packages
```

Remote (HTTP/SSE) MCP servers work without changes. Remember: MCP servers run third-party code with the server container's permissions — only add servers you trust.

## Backups

All state lives in Postgres (threads, messages, runs, telemetry, memories, settings, skills, MCP configs):

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U hyperagent hyperagent > backup-$(date +%F).sql
```

Restore with `psql -U hyperagent hyperagent < backup.sql` into a fresh volume. Keys saved via Settings are encrypted with `APP_SECRET` — keep the same secret across restores or re-enter keys.

## Upgrading

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations are append-only and apply automatically on server boot.

## Development (without Docker)

```bash
docker compose up -d postgres        # infra only
pnpm install && pnpm dev             # web :3000 + server :8787
cd apps/sandbox && uv sync && uv run uvicorn app.main:app --port 8788
```

## Troubleshooting

- **Server exits at boot with migration errors** — Postgres not reachable; check `docker compose ps` and `DATABASE_URL`.
- **"No API key configured for …"** — set the provider env var or save a key in Settings (requires `APP_SECRET`).
- **Memory shows "text-only"** — no embedding-capable key (OpenAI or Google); hybrid recall degrades to keyword search.
- **Skill install hits rate limits** — set `GITHUB_TOKEN`.
- **Costs show "—"** — that model has no catalog pricing; tokens are still tracked.
