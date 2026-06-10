from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from ..state import (
    alert_subscribers,
    tracked_wallet_address, last_known_tracked_balance,
)
from ..logger import logger


async def monitor_wallet(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Check real on-chain SOL balance for each subscriber's tracked wallet
    and fire an alert if it changed."""
    if not alert_subscribers:
        return

    from ..database import sync_address_balance

    for uid in list(alert_subscribers):
        addr = tracked_wallet_address.get(uid)
        if not addr:
            continue
        try:
            balance = await sync_address_balance(addr)
            if balance is None:
                continue

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
