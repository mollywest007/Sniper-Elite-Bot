---
name: Telegram polling ownership
description: Operational constraint for the project's Python and legacy TypeScript Telegram runtimes.
---

Only one Telegram bot runtime may poll with the configured token. The Python bot is the intended runtime; an older TypeScript/grammY deployment can still consume updates and create inconsistent portfolio behavior.

**Why:** Telegram allows only one active `getUpdates` consumer per bot token. A stale runtime caused polling conflicts while handling trades through a legacy path that deducted funds without creating an open position.

**How to apply:** Rotate the token when an unknown/stale poller cannot be stopped, keep the Telegram Bot workflow as the sole active runtime, and treat any remaining `Conflict: terminated by other getUpdates request` log as a deployment problem before debugging user-level state.