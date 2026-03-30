# --- build stage ---
FROM oven/bun:1.3 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY src ./src

# --- runtime stage ---
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app

# RUN /bin/sh -c addgroup --system app && adduser --system --ingroup app app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle

USER app
EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]
