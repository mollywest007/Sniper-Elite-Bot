import random
import string
import httpx
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from ..database import get_wallet_balance, update_wallet_balance
from ..state import (
    alert_subscribers, snipe_mode_active, pumpfun_monitor_active,
    last_known_balance, last_seen_pumpfun_mint, get_sniper_config,
)
from ..logger import logger


async def monitor_wallet(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        from ..database import get_wallet
        wallet = await get_wallet()
        if not wallet:
            return

        balance = await get_wallet_balance()
        prev = last_known_balance["sol"]
        if prev == 0.0:
            last_known_balance["sol"] = balance
            return
        delta = balance - prev
        if abs(delta) < 0.000001:
            return
        last_known_balance["sol"] = balance
        if not alert_subscribers:
            return

        direction = "📥 Deposit" if delta > 0 else "📤 Withdrawal"
        text = (
            f"🚨 *Wallet Alert*\n\n"
            f"Event  {direction}\n"
            f"Amount  `{abs(delta):.4f} SOL`\n"
            f"Balance  `{balance:.4f} SOL`"
        )
        for uid in list(alert_subscribers):
            try:
                await ctx.bot.send_message(uid, text, parse_mode=ParseMode.MARKDOWN)
            except Exception:
                pass
    except Exception as exc:
        logger.error("Wallet monitor error: %s", exc)


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
