# Agent server — multi-stage build via pnpm deploy (pruned prod node_modules
# with workspace packages' dist included).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@hyperagent/server...
RUN pnpm --filter @hyperagent/server --prod deploy /out --legacy

FROM node:22-slim AS runtime
# npx ships with Node and powers stdio MCP servers. For uvx-based MCP servers,
# extend this image with: pip install uv (see SELF_HOSTING.md).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out .
ENV NODE_ENV=production
ENV SERVER_HOST=0.0.0.0
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:8787/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
