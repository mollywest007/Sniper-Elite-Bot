# Phase Snipe Telegram Bot

Phase Snipe is a Telegram-only Solana sniper bot. Users manage wallets, configure
sniping, inspect token markets, and execute trades through Telegram inline menus
and commands. There is no website or browser dashboard.

## Run & Operate

- Telegram Bot workflow: `cd artifacts/telegram-bot && uv run python main.py`
- After changing Python bot code: restart the **Telegram Bot** workflow.
- Required secrets: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`
- Optional environment variables: `BOT_WALLET_ADDRESS`, `BOT_WALLET_PRIVATE_KEY`,
  `ADMIN_USERNAME`, `COOLDOWN_MS`

## Stack

- Python 3.11
- `python-telegram-bot` 21.3 with async job queue
- PostgreSQL via `asyncpg`
- Solana JSON-RPC, Jupiter, Dexscreener, and Pump.fun HTTP integrations

## Where things live

- `artifacts/telegram-bot/main.py` — Telegram polling entry point
- `artifacts/telegram-bot/bot/handlers/commands.py` — slash commands
- `artifacts/telegram-bot/bot/handlers/callbacks.py` — inline-button actions
- `artifacts/telegram-bot/bot/handlers/messages.py` — token-address and settings input
- `artifacts/telegram-bot/bot/handlers/monitors.py` — wallet and market monitors
- `artifacts/telegram-bot/bot/database.py` — async database access
- `artifacts/telegram-bot/bot/keyboards.py` — Telegram inline keyboards
- `artifacts/telegram-bot/bot/screens.py` — Telegram message content
- `lib/db/src/schema/index.ts` — database schema

## Telegram commands

- `/start` — open the main sniper menu
- `/menu` — return to the main menu
- `/wallet` — view and manage the wallet
- `/set` — configure buy amount, slippage, or priority fee
- `/help` — show help and support information

## Setup

After a fresh import:

1. Install the Python dependencies through the Telegram Bot workflow (`uv` does
   this automatically).
2. Ensure `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` are set as Replit Secrets.
3. Start the **Telegram Bot** workflow.
4. Send `/start` to the bot in Telegram.

## Architecture decisions

- Telegram is the only user interface; web frontend and API workflows are not
  part of the runtime.
- The bot uses async polling and an asyncpg connection pool for responsive
  Telegram interactions.
- Solana market and chain access stays in the bot so Telegram actions do not
  require a separate web server.