import re
import random
import string
from urllib.parse import urlparse
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from ..database import (
    credit_user_deposit, get_display_balance, get_user_balance, get_wallet,
    execute_user_trade, DepositAlreadyCreditedError,
)
from ..keyboards import kb_main, kb_back, kb_sniper, kb, btn
from ..screens import (
    screen_withdraw_confirm, screen_token_search, screen_sniper_panel, trunc, f_sol
)
from ..state import (
    registered_users, pending_flows, snipe_mode_active,
    is_rate_limited, get_sniper_config, tracked_wallet_address,
    alert_subscribers,
)
from ..logger import logger


_SOLANA_ADDR_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_SOLANA_TX_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{64,128}$")


def _is_valid_ca(text: str) -> bool:
    return bool(_SOLANA_ADDR_RE.match(text.strip()))


def _normalize_tx_hash(text: str) -> str | None:
    """Accept a transaction signature or a Solscan-style transaction URL."""
    candidate = text.strip()
    if candidate.startswith(("http://", "https://")):
        candidate = urlparse(candidate).path.rstrip("/").split("/")[-1]
    return candidate if _SOLANA_TX_RE.fullmatch(candidate) else None


def _rand_tx() -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=64))


async def _execute_buy(update: Update, user_id: int, contract_address: str) -> None:
    cfg = get_sniper_config(user_id)
    tx = _rand_tx()
    w = await get_wallet()
    if not w:
        await update.message.reply_text(
            "The shared Solana wallet is not configured yet.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return
    from ..market import fetch_token_market
    market = await fetch_token_market(contract_address)
    if not market:
        await update.message.reply_text(
            "Could not get a live market price for this token. "
            "No funds were changed; please try again.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return
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
        await update.message.reply_text(
            f"*Insufficient balance*\n\n"
            f"Available  `{f_sol(balance)} SOL`\n"
            f"Required   `{f_sol(cfg['buy_amount'])} SOL`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return
    except Exception as e:
        logger.error("User trade error for %s: %s", user_id, e)
        await update.message.reply_text(
            "Could not record this trade. Your balance was not changed.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    text = (
        f"*Snipe Executed*\n\n"
        f"CA      `{trunc(contract_address, 8)}`\n"
        f"Amount  `{f_sol(cfg['buy_amount'])} SOL`\n"
        f"Slip    `{cfg['slippage']}%`\n"
        f"TX      `{tx[:16]}...`\n\n"
        "_Transaction submitted to Solana_"
    )
    await update.message.reply_text(
        text,
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb(
            [InlineKeyboardButton("My Snipers", callback_data="sniper:list"),
             InlineKeyboardButton("Portfolio",  callback_data="portfolio")],
            [InlineKeyboardButton("◀ Sniper Panel", callback_data="sniper:panel")],
        ),
    )


async def handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if not message or not message.text:
        return
    user = update.effective_user
    if not user:
        return
    user_id = user.id
    raw = message.text.strip()
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
            f"*Deposit Credited*\n\n"
            f"Amount   `{f_sol(amount)} SOL`\n"
            f"Balance  `{f_sol(balance)} SOL`\n"
            f"TX       `{trunc(tx_hash, 8)}`",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb(
                [btn("Open Wallet", "wallet:panel")],
                [btn("TX History", "wallet:history")],
            ),
        )
        return

    # ── Withdraw: step 1 — destination address ────────────────────────────
    if flow and flow["type"] == "withdraw_address":
        if not _is_valid_ca(raw):
            await message.reply_text(
                "Invalid Solana address. Please try again.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        balance = await get_display_balance(user)
        pending_flows[user_id] = {"type": "withdraw_amount", "to_address": raw}
        await message.reply_text(
            f"*Withdraw*\n\n"
            f"To         `{trunc(raw, 10)}`\n"
            f"Available  `{f_sol(balance)} SOL`\n\n"
            "Step 2 of 2 — enter the amount in SOL:",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb_back("withdraw:cancel", "Cancel"),
        )
        return

    # ── Withdraw: step 2 — amount ─────────────────────────────────────────
    if flow and flow["type"] == "withdraw_amount":
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
        if amount > balance:
            await message.reply_text(
                f"Insufficient balance.\n\n"
                f"Have  `{f_sol(balance)} SOL`  ·  Requested  `{f_sol(amount)} SOL`",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        to_address = flow["to_address"]
        pending_flows.pop(user_id, None)
        await message.reply_text(
            screen_withdraw_confirm(to_address, amount),
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton("Confirm", callback_data=f"withdraw:confirm:{to_address}:{amount}"),
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
        from ..market import fetch_token_market
        market = await fetch_token_market(raw)
        if not market:
            await message.reply_text(
                "No live Solana market pair was found for this CA. "
                "Check the address and try again.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb(
                    [btn("Search Again", "search:token")],
                    [btn("◀ Main Menu", "menu:home")],
                ),
            )
            return
        await message.reply_text(
            screen_token_search(market),
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb(
                [btn("Search Again", "search:token")],
                [btn("◀ Main Menu", "menu:home")],
            ),
        )
        return

    # ── Snipe flow — CA from panel ─────────────────────────────────────────
    if flow and flow["type"] == "snipe_ca":
        pending_flows.pop(user_id, None)
        if not _is_valid_ca(raw):
            await message.reply_text("Invalid contract address.", parse_mode=ParseMode.MARKDOWN)
            return
        await _execute_buy(update, user_id, raw)
        return

    # ── Sniper config flows ────────────────────────────────────────────────
    if flow and flow["type"] == "snipe_set_amount":
        pending_flows.pop(user_id, None)
        try:
            v = float(raw)
            if v <= 0:
                raise ValueError
            get_sniper_config(user_id)["buy_amount"] = v
            cfg = get_sniper_config(user_id)
            from ..keyboards import kb_sniper_edit
            from ..screens import screen_sniper_edit
            await message.reply_text(
                f"Buy amount set to `{v:.4f} SOL`",
                parse_mode=ParseMode.MARKDOWN,
            )
            await message.reply_text(
                screen_sniper_edit(cfg),
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb_sniper_edit(cfg),
            )
        except (ValueError, TypeError):
            await message.reply_text("Invalid amount. Enter a positive number (e.g. `0.5`).", parse_mode=ParseMode.MARKDOWN)
        return

    if flow and flow["type"] == "snipe_set_slippage":
        pending_flows.pop(user_id, None)
        try:
            v = float(raw)
            if v <= 0 or v > 100:
                raise ValueError
            get_sniper_config(user_id)["slippage"] = v
            await message.reply_text(f"Slippage set to `{v:.1f}%`", parse_mode=ParseMode.MARKDOWN)
        except (ValueError, TypeError):
            await message.reply_text("Invalid slippage. Enter a value between 1–100 (e.g. `10`).", parse_mode=ParseMode.MARKDOWN)
        return

    if flow and flow["type"] == "snipe_set_tp":
        pending_flows.pop(user_id, None)
        try:
            v = float(raw)
            if v <= 0:
                raise ValueError
            get_sniper_config(user_id)["take_profit_pct"] = v
            cfg = get_sniper_config(user_id)
            await message.reply_text(
                f"Take profit set to `+{v:.1f}%`.\n\n"
                + screen_sniper_panel(cfg),
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb_sniper(cfg),
            )
        except (ValueError, TypeError):
            await message.reply_text("Invalid value.", parse_mode=ParseMode.MARKDOWN)
        return

    if flow and flow["type"] == "snipe_set_sl":
        pending_flows.pop(user_id, None)
        try:
            v = float(raw)
            if v <= 0:
                raise ValueError
            get_sniper_config(user_id)["stop_loss_pct"] = v
            await message.reply_text(f"Stop loss set to `-{v:.1f}%`", parse_mode=ParseMode.MARKDOWN)
        except (ValueError, TypeError):
            await message.reply_text("Invalid value.", parse_mode=ParseMode.MARKDOWN)
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

    # ── CA paste — auto buy if snipe mode active ───────────────────────────
    if _is_valid_ca(raw):
        if user_id in snipe_mode_active:
            await _execute_buy(update, user_id, raw)
        else:
            await message.reply_text(
                f"*Contract Address Detected*\n\n`{raw}`\n\n"
                "Enable sniping in the Sniper Panel to auto-buy:",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("Sniper Panel", callback_data="sniper:panel")],
                    [InlineKeyboardButton(f"Buy now ({f_sol(get_sniper_config(user_id)['buy_amount'])} SOL)",
                                         callback_data=f"sniper:buy:{raw}")],
                ]),
            )
        return

    # ── Unknown text ───────────────────────────────────────────────────────
    balance = await get_display_balance(user)
    from ..screens import screen_welcome
    await message.reply_text(
        screen_welcome(balance),
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb_main(user_id),
    )
