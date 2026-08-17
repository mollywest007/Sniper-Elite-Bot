---
name: Shared wallet attribution
description: The invariant for keeping a common Solana address compatible with isolated Telegram account balances.
---

The bot may keep one shared Solana receiving/execution address, but it must never use that address's on-chain balance as a user's spendable balance. Each Telegram account needs its own database ledger keyed by `telegram_user_id`.

**Why:** A blockchain transfer to a shared address does not identify which Telegram account should receive credit. Crediting by the shared wallet balance would leak funds between users.

**How to apply:** Require an exact per-user memo (or another equally strong attribution signal) when verifying deposits. Record deposits, withdrawals, and trades in the user's ledger with atomic, conditional debits; display only that ledger balance.