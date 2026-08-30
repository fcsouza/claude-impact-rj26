# Contexto de build é a raiz do monorepo: as workspaces precisam vir juntas.
# O Bun instala as dependências dentro de cada app, então a instalação acontece
# com o código já no lugar — copiar só o node_modules da raiz deixa a imagem vazia.
FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=bun:bun . .
RUN bun install --frozen-lockfile
USER bun
CMD ["bun", "apps/worker/src/index.ts"]
