---
name: Telegram screen navigation
description: Navigation behavior for first-start onboarding and callback-driven Telegram screens.
---

New users should see the main menu first on `/start`. Selecting Start Your Wallet opens a concise setup prompt; activate their separate ledger only after they tap Start Wallet.

**Why:** The user chose main-menu-first onboarding and confirmed new accounts should use the existing shared address.

**How to apply:** Keep the wallet setup prompt simple and avoid technical explanations there. Do not mark a user wallet-ready on `/start`, ordinary menu use, or merely opening the prompt; persist readiness only after they tap Start Wallet.

Callback-driven text screens should edit the existing bot message in place and include a Back or Main Menu button. Screens built from photo messages should use replacement plus deletion because Telegram cannot edit their text content the same way.

**Why:** Sending a new message for every tap makes the chat look noisy and makes returning to a previous screen harder.

**How to apply:** Route panel navigation through the shared callback screen helper and preserve a clear back target on every non-root screen.

The Wallet Ready screen should include the short line "Bot private key · stored in the bot"; do not remove it or imply each user gets a unique private key.

**Why:** The user noticed the previous status line was removed and explicitly asked for it to be restored.

**How to apply:** Show this bot-level key note only on Wallet Ready; wallet activation remains an account setup on the shared address.