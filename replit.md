# Phase Snipe

Solana token sniping bot with a Telegram interface and a React dashboard for managing wallets, trades, snipers, copy trades, limit orders, and DCA setups.

## Run & Operate

- Frontend workflow: `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/phase-snipe run dev` (port 5000, webview)
- API Server workflow: `PORT=8080 pnpm --filter @workspace/api-server run start` (port 8080, console)
- After changing API server code: run `pnpm --filter @workspace/api-server run build` in bash first, then restart the workflow
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

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

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
