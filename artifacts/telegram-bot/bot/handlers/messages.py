import re
from urllib.parse import urlparse
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes
from telegram.constants import ParseMode
from telegram.error import BadRequest, TelegramError

from ..database import (
    credit_user_deposit, get_display_balance,
    DepositAlreadyCreditedError,
    normalise_withdrawal_amount,
)
from ..access import (
    MINIMUM_WITHDRAWAL_USD,
    check_withdrawal_access,
)
from ..keyboards import kb_main, kb_back, kb_sniper, kb_sniper_edit, kb, btn
from ..screens import (
    screen_withdraw_confirm, screen_token_search, screen_sniper_panel,
    screen_sniper_edit, screen_minimum_balance,
    trunc, f_sol
)
from ..state import (
    registered_users, pending_flows,
    is_rate_limited, get_sniper_config, tracked_wallet_address,
    alert_subscribers, wallet_generated, active_screen_messages,
    remember_active_screen,
)
from ..logger import logger


_SOLANA_ADDR_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_SOLANA_TX_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{64,128}$")
_SNIPE_SETTING_FIELDS = {
    "snipe_set_amount": "buy_amount",
    "snipe_set_slippage": "slippage",
    "snipe_set_tp": "take_profit_pct",
    "snipe_set_sl": "stop_loss_pct",
}


async def _delete_user_input(message) -> None:
    try:
        await message.delete()
    except TelegramError as exc:
        logger.debug("Could not delete user input message: %s", exc)


async def _show_current_buy_panel(
    ctx: ContextTypes.DEFAULT_TYPE,
    message,
    user_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup,
) -> None:
    panel = active_screen_messages.get(user_id)
    if panel:
        try:
            await ctx.bot.edit_message_text(
                chat_id=panel["chat_id"],
                message_id=panel["message_id"],
                text=text,
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=reply_markup,
                disable_web_page_preview=True,
            )
            return
        except BadRequest as exc:
            if "message is not modified" in str(exc).lower():
                return
            logger.debug("Could not update the current buy panel: %s", exc)
        except TelegramError as exc:
            logger.debug("Could not update the current buy panel: %s", exc)

    sent = await ctx.bot.send_message(
        chat_id=message.chat_id,
        text=text,
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=reply_markup,
        disable_web_page_preview=True,
    )
    remember_active_screen(user_id, sent)


async def _show_token_buy_panel(
    ctx: ContextTypes.DEFAULT_TYPE,
    message,
    user_id: int,
    contract_address: str,
) -> None:
    await _delete_user_input(message)

    from ..market import fetch_token_market
    market = await fetch_token_market(contract_address)
    if not market:
        await _show_current_buy_panel(
            ctx,
            message,
            user_id,
            "No live Solana market pair was found for this CA. "
            "Check the address and try again.",
            kb(
                [btn("Search Again", "search:token")],
                [btn("◀️ Sniper Panel", "sniper:panel")],
            ),
        )
        return

    market = {**market, "address": market.get("address") or contract_address}
    buy_amount = get_sniper_config(user_id)["buy_amount"]
    await _show_current_buy_panel(
        ctx,
        message,
        user_id,
        screen_token_search(market),
        kb(
            [btn(f"Buy Now ({f_sol(buy_amount)} SOL)", f"sniper:buy:{contract_address}")],
            [btn("Search Another Token", "search:token")],
            [btn("◀️ Sniper Panel", "sniper:panel")],
        ),
    )


async def _edit_setting_prompt(ctx, flow: dict, text: str, reply_markup) -> bool:
    chat_id = flow.get("chat_id")
    prompt_message_id = flow.get("prompt_message_id")
    if chat_id is None or prompt_message_id is None:
        return False
    try:
        await ctx.bot.edit_message_text(
            chat_id=chat_id,
            message_id=prompt_message_id,
            text=text,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=reply_markup,
        )
        return True
    except TelegramError as exc:
        logger.debug("Could not restore sniper settings card in place: %s", exc)
        return False


def _is_valid_ca(text: str) -> bool:
    return bool(_SOLANA_ADDR_RE.match(text.strip()))


def _normalize_tx_hash(text: str) -> str | None:
    """Accept a transaction signature or a Solscan-style transaction URL."""
    candidate = text.strip()
    if candidate.startswith(("http://", "https://")):
        candidate = urlparse(candidate).path.rstrip("/").split("/")[-1]
    return candidate if _SOLANA_TX_RE.fullmatch(candidate) else None


async def handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if not message or not message.text:
        return
    user = update.effective_user
    if not user:
        return
    user_id = user.id
    raw = message.text.strip()
    logger.info("Message received: user=%s text=%s", user_id, raw[:80])
    registered_users.add(user_id)

    if is_rate_limited(user_id):
        return

    flow = pending_flows.get(user_id)

    # ── Deposit verification — transaction signature ───────────────────────
    if flow and flow["type"] == "deposit_tx_hash":
        tx_hash = _normalize_tx_hash(raw)
        if not tx_hash:
            await message.reply_text(
                "Invalid transaction hash. Send the Solana signature or a Solscan "
                "transaction link.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        from ..config import BOT_WALLET_ADDRESS
        from ..solana import fetch_deposit
        amount = await fetch_deposit(tx_hash, BOT_WALLET_ADDRESS)
        if amount is None:
            await message.reply_text(
                "Deposit not verified.\n\n"
                "Make sure the transaction is confirmed and sends SOL to the "
                "shared deposit address. You can send the hash again after it "
                "confirms.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb([btn("Deposit Instructions", "deposit:show")]),
            )
            return
        try:
            balance = await credit_user_deposit(user_id, amount, tx_hash)
        except DepositAlreadyCreditedError:
            pending_flows.pop(user_id, None)
            await message.reply_text(
                "This transaction hash has already been used to credit an account.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        except Exception as exc:
            logger.warning(
                "Could not credit deposit %s for user %s: %s", raw, user_id, exc
            )
            await message.reply_text(
                "This deposit was already credited or could not be recorded.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        pending_flows.pop(user_id, None)
        await message.reply_text(
                f"✅ *Deposit Credited*\n\n"
                f"💰 Amount   `{f_sol(amount)} SOL`\n"
                f"💼 Balance  `{f_sol(balance)} SOL`\n"
                f"🧾 TX       `{trunc(tx_hash, 8)}`",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb(
                [btn("Open Wallet", "wallet:panel")],
                [btn("TX History", "wallet:history")],
            ),
        )
        return

    # ── Withdraw: step 1 — destination address ────────────────────────────
    if flow and flow["type"] == "withdraw_address":
        withdrawal_access = await check_withdrawal_access(user_id)
        if not withdrawal_access.allowed:
            pending_flows.pop(user_id, None)
            await message.reply_text(
                screen_minimum_balance(
                    withdrawal_access.balance_sol,
                    withdrawal_access.sol_usd,
                    minimum_usd=MINIMUM_WITHDRAWAL_USD,
                    action="withdraw",
                ),
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb_back("wallet:panel", "◀️ Wallet"),
            )
            return
        if not _is_valid_ca(raw):
            await message.reply_text(
                "Invalid Solana address. Please try again.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        balance = await get_display_balance(user)
        pending_flows[user_id] = {"type": "withdraw_amount", "to_address": raw}
        await message.reply_text(
            f"↗️ *Withdraw*\n\n"
            f"📍 To         `{trunc(raw, 10)}`\n"
            f"💰 Available  `{f_sol(balance)} SOL`\n\n"
            "Step 2 of 2 — enter the amount in SOL:",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb_back("withdraw:cancel", "Cancel"),
        )
        return

    # ── Withdraw: step 2 — amount ─────────────────────────────────────────
    if flow and flow["type"] == "withdraw_amount":
        withdrawal_access = await check_withdrawal_access(user_id)
        if not withdrawal_access.allowed:
            pending_flows.pop(user_id, None)
            await message.reply_text(
                screen_minimum_balance(
                    withdrawal_access.balance_sol,
                    withdrawal_access.sol_usd,
                    minimum_usd=MINIMUM_WITHDRAWAL_USD,
                    action="withdraw",
                ),
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb_back("wallet:panel", "◀️ Wallet"),
            )
            return
        try:
            amount = float(raw)
            if amount <= 0:
                raise ValueError
        except (ValueError, TypeError):
            await message.reply_text(
                "Invalid amount. Enter a positive number.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        balance = await get_display_balance(user)
        safe_amount = normalise_withdrawal_amount(raw, balance)
        if safe_amount is None:
            await message.reply_text(
                f"Insufficient balance.\n\n"
                f"Have  `{f_sol(balance)} SOL`  ·  Requested  `{f_sol(amount)} SOL`",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        amount = safe_amount
        to_address = flow["to_address"]
        pending_flows[user_id] = {
            "type": "withdraw_confirm",
            "to_address": to_address,
            "amount": str(amount),
        }
        await message.reply_text(
            screen_withdraw_confirm(to_address, amount),
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton("Confirm", callback_data="withdraw:confirm"),
                    InlineKeyboardButton("Cancel",  callback_data="withdraw:cancel"),
                ]
            ]),
        )
        return

    # ── Search Token ────────────────────────────────────────────────────────
    if flow and flow["type"] == "search_token":
        pending_flows.pop(user_id, None)
        if not raw:
            await message.reply_text("Please enter a token address or symbol.", parse_mode=ParseMode.MARKDOWN)
            return
        if not _is_valid_ca(raw):
            await message.reply_text(
                "Please send a valid Solana contract address (CA).",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb(
                    [btn("Search Again", "search:token")],
                    [btn("◀ Main Menu", "menu:home")],
                ),
            )
            return
        await _show_token_buy_panel(ctx, message, user_id, raw)
        return

    # ── Snipe flow — CA from panel ─────────────────────────────────────────
    if flow and flow["type"] == "snipe_ca":
        pending_flows.pop(user_id, None)
        if not _is_valid_ca(raw):
            await message.reply_text("Invalid contract address.", parse_mode=ParseMode.MARKDOWN)
            return
        await _show_token_buy_panel(ctx, message, user_id, raw)
        return

    # ── Sniper config flows ────────────────────────────────────────────────
    if flow and flow["type"] in _SNIPE_SETTING_FIELDS:
        flow_type = flow["type"]
        field = _SNIPE_SETTING_FIELDS[flow_type]
        cfg = get_sniper_config(user_id)
        examples = {
            "snipe_set_amount": ("buy amount in SOL", "`0.5`"),
            "snipe_set_slippage": ("slippage percent (1–100)", "`10`"),
            "snipe_set_tp": ("take-profit percent", "`50`"),
            "snipe_set_sl": ("stop-loss percent", "`20`"),
        }
        label, example = examples[flow_type]
        try:
            value = float(raw)
            if value <= 0 or (
                flow_type == "snipe_set_slippage" and value > 100
            ):
                raise ValueError
        except (ValueError, TypeError):
            await _delete_user_input(message)
            error = (
                "Invalid slippage. Use a value from 1 to 100."
                if flow_type == "snipe_set_slippage"
                else f"Invalid value. Enter a positive {label}."
            )
            prompt = f"⚠️ {error}\n\nEnter new {label} (e.g. {example}):"
            if not await _edit_setting_prompt(
                ctx, flow, prompt, kb_back("sniper:edit", "Cancel")
            ):
                await message.reply_text(
                    prompt,
                    parse_mode=ParseMode.MARKDOWN,
                    reply_markup=kb_back("sniper:edit", "Cancel"),
                )
            return

        cfg[field] = value
        pending_flows.pop(user_id, None)
        await _delete_user_input(message)
        if not await _edit_setting_prompt(
            ctx, flow, screen_sniper_edit(cfg), kb_sniper_edit(cfg)
        ):
            await message.reply_text(
                screen_sniper_edit(cfg),
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb_sniper_edit(cfg),
            )
        return

    # ── Set tracked wallet for alerts ─────────────────────────────────────
    if flow and flow["type"] == "set_tracked_wallet":
        pending_flows.pop(user_id, None)
        if not _is_valid_ca(raw):
            await message.reply_text(
                "That doesn't look like a valid Solana address. Please try again.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb([btn("◀ Alerts", "alerts:menu")]),
            )
            return
        tracked_wallet_address[user_id] = raw
        alert_subscribers.discard(user_id)
        await message.reply_text(
            f"*Wallet set for tracking*\n\n"
            f"`{raw}`\n\n"
            "Alerts have been reset. Go back to the Alerts menu to enable them.",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb(
                [btn("Go to Alerts", "alerts:menu")],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )
        return

    # ── CA paste — show a confirmation panel before any buy ─────────────────
    if _is_valid_ca(raw):
        await _show_token_buy_panel(ctx, message, user_id, raw)
        return

    # ── Unknown text ───────────────────────────────────────────────────────
    balance = await get_display_balance(user) if user_id in wallet_generated else None
    from ..screens import screen_welcome
    await message.reply_text(
        screen_welcome(balance),
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb_main(user_id),
    )
