# AGENTS.md — MindEase API

## Project Overview

MindEase is a mental health backend API built with **Bun** (runtime), **Hono** (HTTP framework), **Drizzle ORM** (PostgreSQL), and **TypeScript** (strict mode). It manages users, mood tracking, journaling, AI chat sessions, meditation content, and session analytics.

## Build / Lint / Test Commands

```bash
# Development server (hot-reload via --watch)
bun run dev

# Type checking (no emit)
npx tsc --noEmit

# Database
bun run db:generate     # drizzle-kit generate — create migration files
bun run db:migrate      # drizzle-kit migrate — apply migrations to DB
bun run db:seed         # bun run src/db/seed.ts — seed data

# Single test (when tests are added)
bun test src/path/to/test.test.ts

# All tests
bun test
```

> **Note:** No linter or formatter is configured yet. When adding one, use Biome or Prettier with 2-space indent, no semicolons, single quotes.

## Project Structure

```
src/
  index.ts          # Hono app entry point — routes, middleware, server export
  db/
    schema.ts       # All Drizzle ORM table definitions
    index.ts        # Drizzle client (re-export `db`)
    seed.ts         # (planned) Database seeder
drizzle/            # Generated migration files (do not edit manually)
drizzle.config.ts   # Drizzle Kit configuration
tsconfig.json       # TypeScript strict config
.env.example        # Required environment variables
```

## Environment Variables

| Variable         | Description                          |
| ---------------- | ------------------------------------ |
| `DATABASE_URL`   | PostgreSQL connection string         |
| `JWT_SECRET`     | Secret for signing JWT tokens (jose) |
| `GEMINI_API_KEY` | Google Generative AI API key         |
| `PORT`           | Server port (default: 4000)          |

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

## Code Style Guidelines

### Imports

- Use **ESM** imports only (`import ... from "..."`). The project uses `"type": "module"`.
- Package imports first, then relative imports, separated by a blank line.
- Use path alias `@/*` → `./src/*` for deep cross-module imports (configured in tsconfig).

```ts
import { Hono } from "hono";
import { logger } from "hono/logger";

import { db } from "@/db";
import * as schema from "./schema";
```

### Formatting

- **2-space indentation**, no semicolons, single quotes for strings.
- Trailing commas in multi-line objects/arrays.
- Max line length: ~100 characters.
- Blank line between logical blocks.

### Naming Conventions

| Concept                   | Convention                    | Example                             |
| ------------------------- | ----------------------------- | ----------------------------------- |
| Files & directories       | `kebab-case`                  | `mood-entries.ts`, `chat-sessions/` |
| Exported tables (Drizzle) | `camelCase` noun              | `moodEntries`, `chatSessions`       |
| DB column names           | `snake_case` string arg       | `varchar("mood_score")`             |
| DB column TS names        | `camelCase` property          | `moodScore`, `createdAt`            |
| Routes / endpoints        | `kebab-case` paths            | `/mood-entries`, `/chat-sessions`   |
| Enums (Drizzle pgEnum)    | `camelCase` + `Enum` suffix   | `moodLabelEnum`                     |
| Variables & functions     | `camelCase`                   | `getUserById`, `port`               |
| Types / Interfaces        | `PascalCase`                  | `CreateUserInput`, `AuthPayload`    |
| Zod schemas               | `camelCase` + `Schema` suffix | `createUserSchema`                  |
| Environment variables     | `UPPER_SNAKE_CASE`            | `DATABASE_URL`                      |

### Types

- TypeScript **strict mode** is enabled — no `any` unless absolutely unavoidable.
- Use Zod schemas for request validation and type inference:
  ```ts
  import { z } from "zod";
  const createUserSchema = z.object({ ... });
  type CreateUserInput = z.infer<typeof createUserSchema>;
  ```
- Use Drizzle's `$type<>()` for JSONB column typing (see `activities` in schema).
- Prefer `interface` for object shapes, `type` for unions/intersections/utility types.

### Error Handling

- Use Hono's `HTTPException` for API errors:
  ```ts
  import { HTTPException } from "hono/http-exception";
  throw new HTTPException(404, { message: "User not found" });
  ```
- Add a global error handler in `src/index.ts`:
  ```ts
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "Internal Server Error" }, 500);
  });
  ```
- Always return errors as JSON: `{ error: string }` or `{ error: string, details?: ... }`.
- Never expose stack traces or internal messages in production responses.

### Database (Drizzle ORM)

- All tables live in `src/db/schema.ts` — one export per table.
- Every table must have: `id` (uuid defaultRandom PK), `createdAt`, `updatedAt` (timestamps with timezone).
- Foreign keys use callback references `() => table.id` and `onDelete: "cascade"` for owned entities.
- Use `pgEnum` for constrained string columns (e.g., mood labels).
- Column DB names are `snake_case`, TS property names are `camelCase`.
- Import `db` from `src/db/index.ts` — never instantiate the client elsewhere.
- Use Drizzle query builder or relational queries; avoid raw SQL unless necessary.

### Authentication & Security

- Use `bcryptjs` for password hashing (`hashSync` / `compareSync` or async variants).
- Use `jose` for JWT sign/verify (ESM-compatible, no native deps).
- Extract user from `Authorization: Bearer <token>` via Hono middleware.
- Never log or expose passwords, tokens, or secrets.

### Hono Routes

- Group related routes under a Hono instance and mount via `app.route("/path", subApp)`.
- Use Hono middleware for cross-cutting concerns (auth, validation, logging).
- Validate request bodies with Zod before accessing data.
- Return `c.json()` for all API responses with appropriate HTTP status codes.
- Follow REST conventions: GET (list/get), POST (create), PUT/PATCH (update), DELETE (remove).

### General

- Do not add comments unless requested — code should be self-documenting.
- Keep files focused — one concern per file.
- When adding a new domain feature, follow the existing pattern: schema → routes → middleware.
- Run `tsc --noEmit` after making changes to verify type correctness.
