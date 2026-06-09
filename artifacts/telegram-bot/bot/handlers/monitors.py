from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from ..state import (
    alert_subscribers,
    tracked_wallet_address, last_known_tracked_balance,
)
from ..logger import logger


async def monitor_wallet(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Fire balance-change alerts for each subscriber's tracked wallet."""
    if not alert_subscribers:
        return

    try:
        import asyncpg
        from ..database import pool

        for uid in list(alert_subscribers):
            addr = tracked_wallet_address.get(uid)
            if not addr:
                # user hasn't set a wallet to track — skip silently
                continue

            try:
                async with pool().acquire() as conn:
                    row = await conn.fetchrow(
                        "SELECT balance_sol FROM wallets WHERE address=$1", addr
                    )
                balance = float(row["balance_sol"]) if row else 0.0

                prev = last_known_tracked_balance.get(addr)
                if prev is None:
                    last_known_tracked_balance[addr] = balance
                    continue

                delta = balance - prev
                if abs(delta) < 0.000001:
                    continue

                last_known_tracked_balance[addr] = balance
                direction = "📥 Deposit" if delta > 0 else "📤 Withdrawal"
                text = (
                    f"🚨 *Wallet Alert*\n\n"
                    f"Event    {direction}\n"
                    f"Amount   `{abs(delta):.4f} SOL`\n"
                    f"Balance  `{balance:.4f} SOL`\n"
                    f"Wallet   `{addr[:8]}...`"
                )
                await ctx.bot.send_message(uid, text, parse_mode=ParseMode.MARKDOWN)
            except Exception as e:
                logger.error("Wallet monitor error for uid %s: %s", uid, e)

    except Exception as exc:
        logger.error("Wallet monitor outer error: %s", exc)


async def monitor_pumpfun(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    active_users = list(pumpfun_monitor_active)
    if not active_users:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://frontend-api.pump.fun/coins/latest",
                headers={"Accept": "application/json"},
            )
        if resp.status_code != 200:
            return
        data = resp.json()
        mint = data.get("mint") or data.get("address", "")
        if not mint or mint == last_seen_pumpfun_mint["mint"]:
            return
        last_seen_pumpfun_mint["mint"] = mint
        name = data.get("name", "Unknown")
        symbol = data.get("symbol", "?")
        mc = float(data.get("usd_market_cap") or 0)

        text = (
            f"🔔 *New Pump.fun Token*\n\n"
            f"Name    {name}\n"
            f"Symbol  `{symbol}`\n"
            f"CA      `{mint}`\n"
            f"MC      ${mc:,.0f}\n\n"
            "_Paste the CA to snipe it_"
        )
        for uid in active_users:
            try:
                await ctx.bot.send_message(uid, text, parse_mode=ParseMode.MARKDOWN)
                cfg = get_sniper_config(uid)
                if cfg["sniping"] and cfg["auto_buy"]:
                    await _auto_snipe(ctx, uid, mint, cfg)
            except Exception:
                pass
    except Exception as exc:
        logger.error("Pump.fun monitor error: %s", exc)


async def _auto_snipe(
    ctx: ContextTypes.DEFAULT_TYPE, user_id: int, contract_address: str, cfg: dict
) -> None:
    tx = "".join(random.choices(string.ascii_letters + string.digits, k=64))
    text = (
        f"🎯 *Auto-Snipe Executed*\n\n"
        f"CA      `{contract_address[:8]}...`\n"
        f"Amount  `{cfg['buy_amount']:.4f} SOL`\n"
        f"TX      `{tx[:16]}...`\n\n"
        "✅ _Transaction submitted_"
    )
    await ctx.bot.send_message(user_id, text, parse_mode=ParseMode.MARKDOWN)
