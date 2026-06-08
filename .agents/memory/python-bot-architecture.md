---
name: Python bot architecture
description: Python Telegram bot replaced Node.js grammY bot; structure and key decisions.
---

The Telegram bot was rebuilt in Python (python-telegram-bot 21.3, asyncpg, httpx) replacing the Node.js grammY implementation. The grammY `startBot()` call was removed from `artifacts/api-server/src/index.ts` — that file now only runs the Express REST API.

**Why:** User requirement: Python, python-telegram-bot, modular architecture, easy VPS deployment.

**How to apply:**
- Bot lives entirely in `artifacts/telegram-bot/` — no bot logic remains in the Node.js server.
- Workflow name: "Telegram Bot", command: `cd artifacts/telegram-bot && python3 main.py`
- No build step needed for the Python bot — just restart the workflow after code changes.
- Packages installed via Replit `installLanguagePackages({ language: "python", ... })`.
- `asyncpg` connects to the same PostgreSQL DB as the Node.js server (same `DATABASE_URL` secret).
- All in-memory state (registered_users, sniper_configs, pending_flows, etc.) lives in `bot/state.py`.
- One `CallbackQueryHandler` routes all inline-button callbacks through `handle_callback()` in `bot/handlers/callbacks.py`.
