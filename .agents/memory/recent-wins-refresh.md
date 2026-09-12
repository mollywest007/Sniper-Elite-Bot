---
name: Recent wins refresh
description: The Recent Wins screen needs fresh, varied live candidates on every refresh.
---

Recent Wins refreshes should bypass the short-lived result cache and rotate through a combined pool of live Solana candidates from the provider's top boosts, latest boosts, and latest token profiles. Only tokens with positive live 24-hour movement should be shown.

**Why:** The top-boosts feed can contain only one positive Solana token, which makes a refresh appear broken even when other current live candidates are available.

**How to apply:** Preserve force-refresh behavior for the Refresh callback, keep the candidate rotation deterministic, and never fill missing results with fabricated tokens or metrics.