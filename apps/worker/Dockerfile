# Contexto de build é a raiz do monorepo: as workspaces precisam vir juntas.
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/auth/package.json packages/auth/
COPY packages/channels/package.json packages/channels/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/seed/package.json packages/seed/
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps --chown=bun:bun /app/node_modules node_modules
COPY --chown=bun:bun . .
USER bun

CMD ["bun", "apps/worker/src/index.ts"]
