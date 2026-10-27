import asyncio
import random
import string
from decimal import Decimal
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes
from telegram.constants import ParseMode
from telegram.error import BadRequest, TelegramError

from ..database import (
    credit_user_deposit, get_display_balance, get_user_balance, touch_bot_user,
    get_or_create_settings, update_settings,
    get_user_transactions, get_snipers, execute_user_trade, update_sniper_status,
    get_positions, get_copy_trades, get_limit_orders, settle_position_if_triggered,
    get_successful_snipe_count,
    get_wallet, activate_wallet_account, debit_user_balance, get_wallet_valuation,
    InsufficientSnipeBalanceError, normalise_withdrawal_amount,
)
from ..access import (
    MINIMUM_SUCCESSFUL_SNIPES_FOR_WITHDRAWAL,
    MINIMUM_WITHDRAWAL_USD,
    check_withdrawal_access,
)
from ..keyboards import (
    kb_main, kb_back, kb_sniper, kb_wallet, kb_wallet_setup, kb_deposit, kb_sniper_edit,
    kb_alerts, btn, kb,
)
from ..screens import (
    screen_welcome, screen_wallet, screen_wallet_setup, screen_deposit,
    screen_sniper_panel, screen_sniper_edit,
    screen_withdraw_confirm, screen_recent_wins, screen_minimum_balance,
    screen_snipe_minimum_balance, screen_withdrawal_snipe_requirement,
    trunc, f_sol, f_usd, f_pct,
)
from ..state import (
    registered_users, alert_subscribers, wallet_generated, snipe_mode_active,
    pending_flows, is_rate_limited, get_sniper_config,
    tracked_wallet_address, remember_active_screen,
)
from ..market import fetch_recent_solana_gainers, fetch_token_market
from ..solana import WalletTransferError, send_sol_transfer
from ..config import BOT_WALLET_ADDRESS
from ..logger import logger


async def _send_replacement(message, text: str, markup: InlineKeyboardMarkup):
    """Send a new screen so Telegram does not mark the message as edited."""
    try:
        sent_message = await message.chat.send_message(
            text,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=markup,
        )
        return sent_message
    except BadRequest as e:
        # A malformed or stale Markdown fragment should not leave the user
        # without a screen. Telegram's plain-text fallback is still useful.
        logger.debug("Could not send formatted replacement: %s", e)
        return await message.chat.send_message(text, reply_markup=markup)


async def _edit(query, text: str, markup: InlineKeyboardMarkup):
    """Replace the current screen without Telegram marking it as edited."""
    message = query.message
    if not message:
        return

    try:
        sent_message = await _send_replacement(message, text, markup)
        user = getattr(query, "from_user", None)
        if user:
            remember_active_screen(user.id, sent_message)
        asyncio.create_task(_delete_replaced_message(message))
        return sent_message
    except TelegramError as e:
        logger.warning("Could not send Telegram screen replacement: %s", e)


async def _edit_in_place(query, text: str, markup: InlineKeyboardMarkup):
    """Edit a transient setting prompt in place instead of adding another card."""
    message = query.message
    if not message:
        return None

    try:
        await message.edit_text(
            text,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=markup,
        )
        return message
    except TelegramError as e:
        logger.debug("Could not edit setting prompt in place: %s", e)
        return await _edit(query, text, markup)


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


async def _show_wallet_setup(query) -> None:
    return await _edit(query, screen_wallet_setup(), kb_wallet_setup())


async def _show_wallet_panel(query, user_id: int) -> None:
    valuation = await get_wallet_valuation(user_id)
    return await _edit(
        query,
        screen_wallet(
            valuation["cash_balance"],
            valuation["positions_value"],
            valuation["unrealized_pnl"],
            wallet_ready=True,
        ),
        kb_wallet(),
    )


async def _show_main_menu(query, user_id: int) -> None:
    wallet_value = None
    if user_id in wallet_generated:
        valuation = await get_wallet_valuation(user_id)
        wallet_value = valuation["total_value"]
    return await _edit(query, screen_welcome(wallet_value), kb_main(user_id))


async def _show_portfolio(query, user_id: int):
    valuation = await get_wallet_valuation(user_id)
    positions = valuation["positions"]
    text = (
        f"📊 *Portfolio*\n\n"
        f"💰 Available SOL  `{f_sol(valuation['cash_balance'])} SOL`\n"
        f"🪙 Holdings       `{f_sol(valuation['positions_value'])} SOL`\n"
        f"💎 Total Value    `{f_sol(valuation['total_value'])} SOL`\n"
        f"📈 Unrealized P/L `{f_sol(valuation['unrealized_pnl'])} SOL`\n\n"
    )
    rows = []
    if not positions:
        text += "No open positions.\n\nUse the Sniper Panel to start trading."
    else:
        total = sum(float(p["value_sol"]) for p in positions)
        text += f"Positions  {len(positions)}  ·  Value  `{f_sol(total)} SOL`\n\n"
        for position in positions:
            pnl = float(position["pnl_percent"])
            result_label = "Gain" if pnl >= 0 else "Loss"
            text += (
                f"{result_label} {position['token_symbol']}  "
                f"`{f_sol(position['value_sol'])} SOL`  {f_pct(pnl)}\n"
                f"   MC {f_usd(float(position['market_cap_usd']))}\n\n"
            )
            symbol = str(position.get("token_symbol") or "Token")[:18]
            rows.append([
                btn(
                    f"Close {symbol}",
                    f"portfolio:close:{int(position['id'])}",
                )
            ])
        text += "Choose a position below to review a manual close."

    rows.extend([
        [
            btn("Sniper Panel", "sniper:panel"),
            btn("TX History", "wallet:history"),
        ],
        [btn("◀ Main Menu", "menu:home")],
    ])
    return await _edit(query, text, InlineKeyboardMarkup(rows))


async def _get_user_position_and_market(user_id: int, position_id: int):
    positions = await get_positions(user_id)
    position = next(
        (item for item in positions if int(item["id"]) == position_id),
        None,
    )
    if not position:
        return None, None

    try:
        market = await fetch_token_market(position["contract_address"])
        price_sol = float(market["price_sol"]) if market else 0
        if price_sol <= 0:
            return position, None
        return position, market
    except (KeyError, TypeError, ValueError):
        return position, None
    except Exception as exc:
        logger.warning(
            "Could not refresh quote for portfolio position %s: %s",
            position_id,
            exc,
        )
        return position, None


def _rand_tx() -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=64))


async def _execute_buy(query, user_id: int, contract_address: str) -> None:
    balance = await get_user_balance(user_id)
    from ..config import MINIMUM_SNIPE_BALANCE_SOL
    if balance < MINIMUM_SNIPE_BALANCE_SOL:
        return await _edit(
            query,
            screen_snipe_minimum_balance(balance),
            kb(
                [btn("Open Wallet", "wallet:panel")],
                [btn("Deposit", "deposit:show")],
            ),
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
            take_profit_percent=cfg["take_profit_pct"],
            stop_loss_percent=cfg["stop_loss_pct"],
            auto_sell=cfg["auto_sell"],
        )
    except InsufficientSnipeBalanceError:
        balance = await get_user_balance(user_id)
        if balance < MINIMUM_SNIPE_BALANCE_SOL:
            return await _edit(
                query,
                screen_snipe_minimum_balance(balance),
                kb(
                    [btn("Open Wallet", "wallet:panel")],
                    [btn("Deposit", "deposit:show")],
                ),
            )
        return await _edit(
            query,
            f"*Insufficient balance*\n\n"
            f"Available  `{f_sol(balance)} SOL`\n"
            f"Required   `{f_sol(cfg['buy_amount'])} SOL`",
            kb_back("sniper:panel", "◀ Sniper Panel"),
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
    logger.info(
        "Callback received: user=%s data=%s",
        getattr(update.effective_user, "id", "unknown"),
        query.data or "<empty>",
    )
    try:
        await query.answer()
    except BadRequest as e:
        error = str(e).lower()
        if "query is too old" in error or "query id is invalid" in error:
            logger.info(
                "Ignoring expired Telegram callback: user=%s data=%s",
                getattr(update.effective_user, "id", "unknown"),
                query.data or "<empty>",
            )
            return
        raise

    user = update.effective_user
    if not user:
        return
    user_id = user.id
    registered_users.add(user_id)
    asyncio.create_task(_touch_user_in_background(user_id))

    if is_rate_limited(user_id):
        return

    data: str = query.data or ""

    if user_id not in wallet_generated and (
        data in {"wallet:panel", "wallet:refresh", "wallet:history"}
        or data.startswith(("deposit:", "withdraw:"))
    ):
        return await _show_wallet_setup(query)

    if data in {"withdraw:start", "withdraw:confirm"} or data.startswith("withdraw:confirm:"):
        successful_snipes = await get_successful_snipe_count(user_id)
        if successful_snipes < MINIMUM_SUCCESSFUL_SNIPES_FOR_WITHDRAWAL:
            return await _edit(
                query,
                screen_withdrawal_snipe_requirement(
                    successful_snipes,
                    MINIMUM_SUCCESSFUL_SNIPES_FOR_WITHDRAWAL,
                ),
                kb(
                    [btn("🎯 Snipe a Token", "sniper:paste_ca")],
                    [btn("◀️ Wallet", "wallet:panel")],
                ),
            )
        withdrawal_access = await check_withdrawal_access(user_id)
        if not withdrawal_access.allowed:
            return await _edit(
                query,
                screen_minimum_balance(
                    withdrawal_access.balance_sol,
                    withdrawal_access.sol_usd,
                    minimum_usd=MINIMUM_WITHDRAWAL_USD,
                    action="withdraw",
                ),
                kb_back("wallet:panel", "◀️ Wallet"),
            )

    # ── Main Menu ─────────────────────────────────────────────────────────
    if data == "menu:home":
        return await _show_main_menu(query, user_id)

    if data == "menu:refresh":
        return await _show_main_menu(query, user_id)

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
        if user_id in wallet_generated:
            return await _show_wallet_panel(query, user_id)
        return await _show_wallet_setup(query)

    if data == "wallet:setup:confirm":
        needs_activation = user_id not in wallet_generated
        if needs_activation:
            try:
                await activate_wallet_account(user_id)
            except Exception:
                logger.exception("Could not set up wallet for user %s", user_id)
                return await _edit(
                    query,
                    "Wallet setup could not be completed. Please try again.",
                    kb_wallet_setup(),
                )
            wallet_generated.add(user_id)
        return await _show_wallet_panel(query, user_id)

    if data == "wallet:setup:cancel":
        pending_flows.pop(user_id, None)
        return await _show_main_menu(query, user_id)

    if data == "wallet:panel":
        return await _show_wallet_panel(query, user_id)

    if data == "wallet:refresh":
        return await _show_wallet_panel(query, user_id)

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
            "↗️ *Withdraw SOL*\n\n"
            "Enter the Solana wallet address you want the withdrawal sent to:",
            kb_back("withdraw:cancel", "Cancel"),
        )

    if data == "withdraw:cancel":
        pending_flows.pop(user_id, None)
        balance = await get_display_balance(user)
        from ..screens import screen_welcome
        return await _edit(query, screen_welcome(balance), kb_main(user_id))

    if data == "withdraw:confirm" or data.startswith("withdraw:confirm:"):
        if data == "withdraw:confirm":
            flow = pending_flows.get(user_id)
            if not flow or flow.get("type") != "withdraw_confirm":
                return await _edit(
                    query,
                    "This withdrawal confirmation has expired. Please start again.",
                    kb_back("wallet:panel", "◀ Wallet"),
                )
            to_addr = flow["to_address"]
            requested_amount = Decimal(flow["amount"])
        else:
            # Keep old callbacks readable if a previously sent short payload
            # is still pressed, while new buttons use the compact form above.
            parts = data.split(":")
            to_addr = parts[2]
            requested_amount = Decimal(parts[3])
        balance = await get_user_balance(user_id)
        amount = normalise_withdrawal_amount(requested_amount, balance)
        if amount is None:
            return await _edit(
                query,
                f"*Insufficient balance*\n\nAvailable  `{f_sol(balance)} SOL`",
                kb_back("wallet:panel", "◀ Wallet"),
            )
        pending_flows.pop(user_id, None)
        ledger_tx = _rand_tx()
        try:
            remaining_balance = await debit_user_balance(
                user_id, amount, "withdrawal", ledger_tx,
                f"Withdrawal to {to_addr}",
            )
        except ValueError:
            balance = await get_user_balance(user_id)
            return await _edit(
                query,
                f"*Insufficient balance*\n\nAvailable  `{f_sol(balance)} SOL`",
                kb_back("wallet:panel", "◀ Wallet"),
            )
        try:
            tx = await send_sol_transfer(to_addr, amount)
        except WalletTransferError as exc:
            try:
                await credit_user_deposit(
                    user_id,
                    amount,
                    f"withdrawal-refund-{ledger_tx}",
                    "Withdrawal submission failed; balance restored",
                )
            except Exception as refund_error:
                logger.critical(
                    "Could not restore failed withdrawal for user %s: %s",
                    user_id,
                    refund_error,
                )
            logger.error("Withdrawal failed for user %s: %s", user_id, exc)
            return await _edit(
                query,
                "❌ *Withdrawal not submitted*\n\n"
                "Your bot balance was restored because the transfer could not "
                "be submitted. Please try again later.",
                kb_back("wallet:panel", "◀ Wallet"),
            )
        return await _edit(
            query,
            f"✅ *Withdrawal Requested*\n\n"
            f"Amount     `{f_sol(amount)} SOL`\n"
            f"To         `{trunc(to_addr, 10)}`\n"
            f"Remaining  `{f_sol(remaining_balance)} SOL`\n\n"
            f"TX         `{trunc(tx, 10)}`\n\n"
            "Your withdrawal was submitted. Please allow *20–30 minutes* "
            "for the payment to arrive in your selected wallet.",
            kb([btn("💼 Open Wallet", "wallet:panel")],
               [btn("◀️ Main Menu", "menu:home")]),
        )

    # ── Alerts ────────────────────────────────────────────────────────────
    if data == "alerts:menu":
        addr = tracked_wallet_address.get(user_id)
        if not addr:
            return await _edit(
                query,
                "🔔 *Wallet Alerts*\n\n"
                "No wallet set to track yet.\n\n"
                "Send the bot a Solana wallet address first, then come back to enable alerts.",
                kb([btn("Set Wallet to Track", "alerts:set_wallet"), btn("◀ Home", "menu:home")]),
            )
        is_on = user_id in alert_subscribers
        return await _edit(
            query,
            f"🔔 *Wallet Alerts*\n\n"
            f"Status  {'✅ *Active*' if is_on else 'Inactive'}\n\n"
            f"Tracking  `{trunc(addr, 12)}`",
            kb_alerts(user_id),
        )

    if data == "alerts:set_wallet":
        pending_flows[user_id] = {"type": "set_tracked_wallet"}
        return await _edit(
            query,
            "🖊 *Set Wallet to Track*\n\n"
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
                    "🔔 *Wallet Alerts*\n\n"
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
            f"🔔 *Wallet Alerts*\n\n"
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
            f"🔔 *{label} Alerts*\n\n"
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
            "🎯 *Snipe a Token*\n\nPaste the contract address below:",
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
        prompt_message = await _edit_in_place(
            query,
            f"*Edit Setting*\n\nEnter new {labels[field]}:",
            kb_back("sniper:edit", "Cancel"),
        )
        flow = {"type": flow_map[field]}
        if prompt_message:
            flow["chat_id"] = prompt_message.chat_id
            flow["prompt_message_id"] = prompt_message.message_id
        pending_flows[user_id] = flow
        return

    if data.startswith("sniper:fee:"):
        fee = data.split(":")[2]
        if fee in ("auto", "low", "medium", "high"):
            get_sniper_config(user_id)["priority_fee"] = fee
        cfg = get_sniper_config(user_id)
        return await _edit(query, screen_sniper_edit(cfg), kb_sniper_edit(cfg))

    if data == "sniper:list":
        snipers = await get_snipers(8, user_id)
        text = "🗂 *My Snipers*\n\n"
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
            f"🎯 Sniper #{sniper_id} {new_status}.",
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
        return await _show_portfolio(query, user_id)

    if data.startswith(("portfolio:close:", "portfolio:confirm-close:")):
        action, raw_position_id = data.split(":")[1:3]
        try:
            position_id = int(raw_position_id)
            if position_id <= 0:
                raise ValueError
        except ValueError:
            return await _edit(
                query,
                "That portfolio position is not available.",
                kb_back("portfolio", "◀ Portfolio"),
            )

        position, market = await _get_user_position_and_market(
            user_id,
            position_id,
        )
        if not position:
            return await _edit(
                query,
                "This position is no longer open.",
                kb_back("portfolio", "◀ Portfolio"),
            )
        if not market:
            return await _edit(
                query,
                "Could not get a live quote. The position remains open.",
                kb_back("portfolio", "◀ Portfolio"),
            )

        current_price = float(market["price_sol"])
        amount_tokens = float(position["amount_tokens"])
        invested_sol = amount_tokens * float(position["entry_price_sol"])
        proceeds_sol = amount_tokens * current_price
        pnl_sol = proceeds_sol - invested_sol
        pnl_percent = pnl_sol / invested_sol * 100 if invested_sol else 0
        pnl_sign = "+" if pnl_sol >= 0 else ""
        symbol = str(position.get("token_symbol") or "TOKEN").replace("`", "")

        if action == "close":
            return await _edit(
                query,
                f"⚠️ *Confirm Manual Close*\n\n"
                f"Token          `{symbol}`\n"
                f"Live price     `{current_price:.12g} SOL`\n"
                f"Est. proceeds  `{f_sol(proceeds_sol)} SOL`\n"
                f"Est. P/L       `{pnl_sign}{f_sol(pnl_sol)} SOL "
                f"({pnl_sign}{pnl_percent:.2f}%)`\n\n"
                "This closes the position in your bot portfolio and credits "
                "the estimated SOL shown. It does *not* send an on-chain sell "
                "transaction; the final quote may change.",
                kb(
                    [btn("Confirm Close", f"portfolio:confirm-close:{position_id}")],
                    [btn("Cancel", "portfolio")],
                ),
            )

        try:
            result = await settle_position_if_triggered(
                position_id,
                current_price,
                market,
                force=True,
                user_id=user_id,
            )
        except Exception as exc:
            logger.error(
                "Manual portfolio close failed for user %s, position %s: %s",
                user_id,
                position_id,
                exc,
            )
            return await _edit(
                query,
                "Could not close this position. It remains open; please try again.",
                kb_back("portfolio", "◀ Portfolio"),
            )

        if not result:
            return await _edit(
                query,
                "This position was already closed or is no longer available.",
                kb_back("portfolio", "◀ Portfolio"),
            )

        realized_pnl = float(result["pnl_sol"])
        realized_sign = "+" if realized_pnl >= 0 else ""
        return await _edit(
            query,
            f"✅ *Position Closed*\n\n"
            f"Token      `{result['symbol']}`\n"
            f"Proceeds   `{f_sol(result['value_sol'])} SOL`\n"
            f"Realized P/L  `{realized_sign}{f_sol(realized_pnl)} SOL "
            f"({realized_sign}{float(result['pnl_percent']):.2f}%)`\n"
            f"Available  `{f_sol(result['balance_sol'])} SOL`\n\n"
            "This was an internal portfolio close; no on-chain sell "
            "transaction was sent.",
            kb(
                [btn("Portfolio", "portfolio")],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )


    # ── Settings ──────────────────────────────────────────────────────────
    if data == "settings:menu":
        s = await get_or_create_settings()
        return await _edit(
            query,
            f"⚙️ *Settings*\n\n"
            f"💰 Buy Amount  `{f_sol(s['default_buy_amount_sol'])} SOL`\n"
            f"↔️ Slippage    `{s['default_slippage_percent']}%`\n"
            f"⚡ Fee         `{s['default_priority_fee']}`\n"
            f"✅ Auto Approve  {'ON' if s['auto_approve'] else 'OFF'}\n\n"
            f"🔔 Notifications\n"
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
            f"⚙️ *Settings*\n\n"
            f"💰 Buy Amount  `{f_sol(s2['default_buy_amount_sol'])} SOL`\n"
            f"↔️ Slippage    `{s2['default_slippage_percent']}%`\n"
            f"⚡ Fee         `{s2['default_priority_fee']}`\n\n"
            f"🔔 Notifications\n"
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
            f"🔐 *Security*\n\n"
            f"PIN Lock         {'✅ Enabled' if s['pin_lock_enabled'] else 'Disabled'}\n"
            f"Session Timeout  `{s['session_timeout_minutes']} min`\n"
            f"Anti-Spam        ✅ Active\n\n"
            "🛡 Wallet security:\n"
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
        text = "👥 *Copy Trading*\n\n"
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
        text = "📌 *Limit Orders*\n\n"
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
            "❓ *Help*\n\n"
            "`/start`   Main menu\n"
            "`/wallet`  Wallet details\n"
            "`/menu`    Return to menu\n"
            "`/help`    This message\n\n"
            "*Quick Start*\n"
            "1. Open Sniper Panel — set your config\n"
            "2. Paste a CA — review the token and tap Buy Now\n\n"
            "*Commands*\n"
            "`/set buy_amount 0.5`\n"
            "`/set slippage 10`\n"
            "`/set fee auto|low|medium|high`\n\n"
            "*Supported DEXs*\n"
            "[Raydium](https://raydium.io)\n"
            "[Jupiter](https://jup.ag)\n"
            "[Pump fun](https://pump.fun)\n\n"
            "*Support*\n"
             "Contact  t.me/developer9997",
            kb_back("menu:home", "◀ Main Menu"),
        )

    # ── Quick snipe (from pumpfun alert) ─────────────────────────────────
    if data.startswith("snipe:quick:"):
        addr = data.split(":")[2]
        return await _execute_buy(query, user_id, addr)

    logger.warning("Unhandled callback data: %s", data)
    await _edit(
        query,
        "That menu action is no longer available. Please return to the main menu.",
        kb_back("menu:home", "◀ Main Menu"),
    )
