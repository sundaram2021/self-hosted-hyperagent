# Web UI — Next.js standalone output.
# NEXT_PUBLIC_* values are baked at build time (they run in the browser):
# point them at the host-published server/sandbox ports.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:8787
ARG NEXT_PUBLIC_SANDBOX_URL=http://localhost:8788
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SANDBOX_URL=$NEXT_PUBLIC_SANDBOX_URL
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@hyperagent/web

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:3000').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
