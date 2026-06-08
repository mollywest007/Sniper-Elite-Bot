# Phase Snipe

Solana token sniping bot with a Telegram interface and a React dashboard for managing wallets, trades, snipers, copy trades, limit orders, and DCA setups.

## Run & Operate

- Frontend workflow: `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/phase-snipe run dev` (port 5000, webview)
- API Server workflow: `PORT=8080 pnpm --filter @workspace/api-server run start` (port 8080, console)
- Telegram Bot workflow: `cd artifacts/telegram-bot && python3 main.py` (console, long-polling)
- After changing API server code: run `pnpm --filter @workspace/api-server run build` in bash first, then restart the workflow
- After changing Python bot code: just restart the "Telegram Bot" workflow (no build step needed)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secrets: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Telegram Bot: Python 3.11 + python-telegram-bot 21.3 + asyncpg (long-polling)

## Where things live

- `artifacts/telegram-bot/` — Python Telegram bot (replaces old grammY/Node.js bot)
  - `main.py` — entry point, registers handlers + job queue monitors
  - `bot/config.py` — all env vars (TELEGRAM_BOT_TOKEN, DATABASE_URL, etc.)
  - `bot/handlers/callbacks.py` — all inline-button callback logic
  - `bot/handlers/messages.py` — text message handler (CA paste, pending flows)
  - `bot/handlers/commands.py` — /start /menu /wallet /help /set
  - `bot/handlers/monitors.py` — background jobs: wallet balance watcher + pump.fun stream
  - `bot/keyboards.py` — InlineKeyboardMarkup builders
  - `bot/screens.py` — message text builders
  - `bot/database.py` — asyncpg pool + all DB query functions
  - `bot/state.py` — in-memory state (sets, dicts, rate-limiter)
- `lib/db/src/schema/index.ts` — source of truth for DB schema (Drizzle ORM)
- `artifacts/api-server/src/routes/` — REST API routes for the React dashboard

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing API server code: run `pnpm --filter @workspace/api-server run build` first, then restart the workflow. The `dev` script now skips the build step so it starts instantly.
- The API artifact health check hits `GET /api` — it must return HTTP 200 or Replit kills the process. A root handler in `routes/index.ts` keeps this alive.
- Frontend vite config requires both `PORT` and `BASE_PATH` env vars — injected automatically by Replit's workflow runner.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
