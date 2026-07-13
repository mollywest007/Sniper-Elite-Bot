---
name: Telegram bot branding/legitimacy pass
description: How the Phase Snipe Telegram bot's main menu was redesigned to look more professional/legit, and where the pieces live.
---

The bot's `/start` and `/menu` screens were redesigned to look like established sniper bots (e.g. "Nano Snipe"): a static banner photo sent first, then a text message with a feature-bullet welcome + a clean 2-column inline keyboard.

**Why:** User reported the original single-column, emoji-heavy menu looked "choppy" and people were calling the bot a scam — visual polish reads as legitimacy in this niche.

**How to apply:**
- Banner image lives at `artifacts/telegram-bot/assets/banner.png` (generated art, no baked-in text — AI image generation doesn't render text reliably, so title/tagline stay in the Markdown message instead).
- `bot/handlers/commands.py::_send_banner` sends it via `reply_photo` before the welcome text on `/start` only (not `/menu`, to avoid spamming the banner every time).
- `kb_main()` in `bot/keyboards.py` is a fixed 2-column grid (Wallet/Refresh, AI Sniper/Copy Trade, Buy‑Sell/Positions, Alerts/Settings, Security/Help) — keep new top-level menu items paired, not single-column, to preserve the look.
- "Buy / Sell" quick button reuses the existing `sniper:paste_ca` flow; "Refresh" is a new `menu:refresh` callback that re-syncs balance and redraws the home screen.
