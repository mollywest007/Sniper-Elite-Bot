import asyncio

from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from ..state import (
    alert_subscribers,
    tracked_wallet_address, last_known_tracked_balance,
)
from ..logger import logger


_position_monitor_lock = asyncio.Lock()


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
            direction = "Deposit" if delta > 0 else "Withdrawal"
            text = (
                f"🔔 *Wallet Alert*\n\n"
                f"Event    {'🟢' if delta > 0 else '🔴'} {direction}\n"
                f"Amount   `{abs(delta):.4f} SOL`\n"
                f"Balance  `{balance:.4f} SOL`\n"
                f"Wallet   `{addr[:8]}...`"
            )
            await ctx.bot.send_message(uid, text, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error("Wallet monitor error for uid %s: %s", uid, e)


async def monitor_positions(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Refresh open positions and settle any configured TP/SL triggers."""
    if _position_monitor_lock.locked():
        return

    from ..database import get_positions, settle_position_if_triggered
    from ..market import fetch_token_market

    async with _position_monitor_lock:
        try:
            positions = await get_positions()
            if not positions:
                return

            addresses = list({
                position["contract_address"]
                for position in positions
                if position.get("contract_address")
            })
            quotes = await asyncio.gather(
                *(fetch_token_market(address) for address in addresses),
                return_exceptions=True,
            )
            quote_by_address = {
                address: quote
                for address, quote in zip(addresses, quotes)
                if isinstance(quote, dict)
            }

            for position in positions:
                user_id = position.get("telegram_user_id")
                address = position.get("contract_address")
                quote = quote_by_address.get(address)
                if not user_id or not quote:
                    continue
                try:
                    current_price_sol = float(quote["price_sol"])
                    result = await settle_position_if_triggered(
                        int(position["id"]),
                        current_price_sol,
                        quote,
                    )
                except Exception as exc:
                    logger.error(
                        "Position monitor error for position %s: %s",
                        position.get("id"),
                        exc,
                    )
                    continue

                if not result:
                    continue

                is_profit = result["reason"] == "take_profit"
                title = "Take Profit Hit — Auto Sell" if is_profit else "Stop Loss Hit — Auto Sell"
                pnl_label = "Profit" if is_profit else "Loss"
                pnl_sign = "+" if result["pnl_sol"] >= 0 else ""
                text = (
                    f"{'✅' if is_profit else '🛑'} *{title}*\n\n"
                    f"Token     `{result['symbol']}`\n"
                    f"Exit      `{result['current_price_sol']:.9f} SOL`\n"
                    f"Proceeds  `{result['value_sol']:.4f} SOL`\n"
                    f"{pnl_label}    `{pnl_sign}{result['pnl_sol']:.4f} SOL "
                    f"({pnl_sign}{result['pnl_percent']:.2f}%)`\n"
                    f"Balance   `{result['balance_sol']:.4f} SOL`\n\n"
                    "_The position was closed and the proceeds were added to your bot balance._"
                )
                try:
                    await ctx.bot.send_message(
                        int(user_id),
                        text,
                        parse_mode=ParseMode.MARKDOWN,
                    )
                except Exception as exc:
                    logger.warning(
                        "Could not send auto-sell notification for user %s: %s",
                        user_id,
                        exc,
                    )
        except Exception as exc:
            logger.error("Position monitor cycle failed: %s", exc)
