---
name: Telegram screen navigation
description: Navigation behavior for callback-driven Telegram screens.
---

Callback-driven text screens should edit the existing bot message in place and include a Back or Main Menu button. Screens built from photo messages should use replacement plus deletion because Telegram cannot edit their text content the same way.

**Why:** Sending a new message for every tap makes the chat look noisy and makes returning to a previous screen harder.

**How to apply:** Route panel navigation through the shared callback screen helper and preserve a clear back target on every non-root screen.