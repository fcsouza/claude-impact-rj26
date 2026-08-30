FROM oven/bun:1.3.14 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN bun install --frozen-lockfile
RUN cd apps/web && bun run build

FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
# A saída standalone do Next já traz o que o servidor precisa.
COPY --from=build --chown=bun:bun /app/apps/web/.next/standalone ./
COPY --from=build --chown=bun:bun /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=bun:bun /app/apps/web/public ./apps/web/public
USER bun
EXPOSE 3000
CMD ["bun", "apps/web/server.js"]
