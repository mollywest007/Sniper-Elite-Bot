---
name: Telegram polling ownership
description: Operational constraint for the project's Python and legacy TypeScript Telegram runtimes.
---

Only one Telegram bot runtime may poll with the configured token. The Python bot is the intended runtime; an older TypeScript/grammY deployment can still consume updates and create inconsistent portfolio behavior.

**Why:** Telegram allows only one active `getUpdates` consumer per bot token. Polling conflicts have come from both stale legacy deployments and an older local Python process left alive after a workflow restart; a stale runtime also handled trades through a legacy path that deducted funds without creating an open position.

**How to apply:** On a polling conflict, check the local process list for multiple bot process trees before assuming a remote deployment. Stop only the stale process and confirm one remains. Keep the Telegram Bot workflow as the sole active runtime; if no local duplicate remains, find the legacy deployment, and rotate the token only if it cannot be stopped.