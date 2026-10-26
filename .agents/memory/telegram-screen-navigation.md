---
name: Telegram screen navigation
description: Navigation behavior for first-start onboarding and callback-driven Telegram screens.
---

New users should see the main menu first on `/start`. Selecting Generate Your Wallet opens a shared-address explanation and confirmation; activate their separate ledger only after confirmation.

**Why:** The user chose main-menu-first onboarding and confirmed new accounts should use the existing shared address.

**How to apply:** Do not mark a user wallet-ready on `/start`, ordinary menu use, or merely opening the wallet prompt. Persist readiness only when the user confirms setup.

Callback-driven text screens should edit the existing bot message in place and include a Back or Main Menu button. Screens built from photo messages should use replacement plus deletion because Telegram cannot edit their text content the same way.

**Why:** Sending a new message for every tap makes the chat look noisy and makes returning to a previous screen harder.

**How to apply:** Route panel navigation through the shared callback screen helper and preserve a clear back target on every non-root screen.