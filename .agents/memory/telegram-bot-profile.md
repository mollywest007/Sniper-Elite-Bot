---
name: Telegram bot profile description
description: Persistent user requirement for the bot's Telegram profile description.
---

The Telegram bot's short About text must be "The Fastest and Most Advanced On-Chain Trading Bot built to put you in full control." Its long profile description must remain "Your Ultimate Onchain Trading Experience". Do not clear or replace either during startup.

**Why:** The user explicitly asked for both exact profile texts and said they must not be removed.

**How to apply:** Set `set_my_short_description` to the About text and `set_my_description` to the long description whenever bot profile metadata is updated.
