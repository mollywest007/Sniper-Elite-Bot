---
name: Telegram update filters
description: Telegram's allowed update types can remain restrictive across webhook-to-polling transitions.
---

When switching a bot from webhook delivery to long polling, pass an explicit `allowed_updates` list that includes `callback_query` and message updates. Do not assume deleting the webhook resets the prior update filter. Preserve pending updates unless dropping them is explicitly intended.

**Why:** The Bot API continued reporting the old webhook filter after webhook removal; it omitted `callback_query`, which prevented inline-button callbacks from reaching the polling handler.

**How to apply:** For this Telegram bot, request `Update.ALL_TYPES` in `run_polling()` and use `drop_pending_updates=False` when taking polling ownership.