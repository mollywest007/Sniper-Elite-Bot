---
name: Token search data integrity
description: The Telegram token search must report live CA-specific market data rather than placeholders.
---

Token search results must be sourced from a live market lookup for the submitted Solana contract address. If the address is invalid or no live pair exists, show an explicit retry/error state instead of estimated or generated values.

**Why:** Fabricated price, liquidity, market-cap, change, or holder values can mislead users making trading decisions.

**How to apply:** Keep search input restricted to valid Solana CAs, prefer a matching Solana base-token pair, and display missing provider metrics as unavailable rather than zero.