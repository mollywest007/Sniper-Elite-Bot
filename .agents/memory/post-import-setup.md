---
name: Post-import/re-clone setup steps
description: What's needed to get all three workflows (Telegram Bot, Start application, API Server) running after a fresh import or clone.
---

After a fresh GitHub import or clone, all three workflows fail until these steps run, in order:

1. `pnpm install` at the repo root (node_modules is gitignored, so it's always missing post-import).
2. `pnpm --filter @workspace/api-server run build` (dist/ is gitignored; the `start` script only runs the built bundle, it doesn't build).
3. `pnpm --filter @workspace/db run push` (pushes Drizzle schema to whatever Postgres `DATABASE_URL` points at; without it every query fails with `relation "wallets" does not exist` etc.).
4. Ensure `TELEGRAM_BOT_TOKEN` secret is set (bot config does `os.environ["TELEGRAM_BOT_TOKEN"]` with no default — hard KeyError if missing). `DATABASE_URL` is provided by the environment automatically in this repl.

**Why:** None of these are captured in git (build artifacts, node_modules, DB state, secrets), so every fresh import starts from zero on all four even though the workflow commands themselves are already configured correctly in `.replit`.

**How to apply:** Run all four before assuming a workflow failure is a real code bug — check logs first; `MODULE_NOT_FOUND ./dist/...`, `vite: not found`, `KeyError: 'TELEGRAM_BOT_TOKEN'`, and `UndefinedTableError: relation "wallets" does not exist` are all setup-step symptoms, not bugs.
