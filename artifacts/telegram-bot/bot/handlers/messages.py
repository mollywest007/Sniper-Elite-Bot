import re
import random
import string
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from ..database import get_wallet_balance, get_wallet, insert_sniper
from ..keyboards import kb_main, kb_back, kb_sniper, kb
from ..screens import screen_withdraw_confirm, trunc, f_sol
from ..state import (
    registered_users, pending_flows, snipe_mode_active,
    is_rate_limited, get_sniper_config,
)
from ..logger import logger


_SOLANA_ADDR_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


def _is_valid_ca(text: str) -> bool:
    return bool(_SOLANA_ADDR_RE.match(text.strip()))


def _rand_tx() -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=64))


async def _execute_buy(update: Update, user_id: int, contract_address: str) -> None:
    cfg = get_sniper_config(user_id)
    tx = _rand_tx()
    w = await get_wallet()
    if w:
        try:
            await insert_sniper(
                wallet_id=w["id"],
                contract_address=contract_address,
                buy_amount_sol=cfg["buy_amount"],
                slippage_percent=cfg["slippage"],
                priority_fee=cfg["priority_fee"],
                status="sniped",
            )
        except Exception as e:
            logger.error("insert_sniper error: %s", e)

    text = (
        f"🎯 *Snipe Executed!*\n\n"
        f"CA      `{trunc(contract_address, 8)}`\n"
        f"Amount  `{f_sol(cfg['buy_amount'])} SOL`\n"
        f"Slip    `{cfg['slippage']}%`\n"
        f"TX      `{tx[:16]}...`\n\n"
        "✅ _Transaction submitted to Solana_"
    )
    await update.message.reply_text(
        text,
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb(
            [InlineKeyboardButton("📊 My Snipers", callback_data="sniper:list"),
             InlineKeyboardButton("📊 Portfolio",  callback_data="portfolio")],
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

    # ── Withdraw: step 1 — destination address ────────────────────────────
    if flow and flow["type"] == "withdraw_address":
        if not _is_valid_ca(raw):
            await message.reply_text(
                "❌ Invalid Solana address. Please try again.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        balance = await get_wallet_balance()
        pending_flows[user_id] = {"type": "withdraw_amount", "to_address": raw}
        await message.reply_text(
            f"📤 *Withdraw*\n\n"
            f"To         `{trunc(raw, 10)}`\n"
            f"Available  `{f_sol(balance)} SOL`\n\n"
            "Step 2 of 2 — enter the amount in SOL:",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb_back("withdraw:cancel", "❌ Cancel"),
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
                "❌ Invalid amount. Enter a positive number.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
        balance = await get_wallet_balance()
        if amount > balance:
            await message.reply_text(
                f"❌ Insufficient balance.\n\n"
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
                    InlineKeyboardButton("✅ Confirm", callback_data=f"withdraw:confirm:{to_address}:{amount}"),
                    InlineKeyboardButton("❌ Cancel",  callback_data="withdraw:cancel"),
                ]
            ]),
        )
        return

    # ── Snipe flow — CA from panel ─────────────────────────────────────────
    if flow and flow["type"] == "snipe_ca":
        pending_flows.pop(user_id, None)
        if not _is_valid_ca(raw):
            await message.reply_text("❌ Invalid contract address.", parse_mode=ParseMode.MARKDOWN)
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
                f"✅ Buy amount set to `{v:.4f} SOL`",
                parse_mode=ParseMode.MARKDOWN,
            )
            await message.reply_text(
                screen_sniper_edit(cfg),
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=kb_sniper_edit(cfg),
            )
        except (ValueError, TypeError):
            await message.reply_text("❌ Invalid amount. Enter a positive number (e.g. `0.5`).", parse_mode=ParseMode.MARKDOWN)
        return

    if flow and flow["type"] == "snipe_set_slippage":
        pending_flows.pop(user_id, None)
        try:
            v = float(raw)
            if v <= 0 or v > 100:
                raise ValueError
            get_sniper_config(user_id)["slippage"] = v
            await message.reply_text(f"✅ Slippage set to `{v:.1f}%`", parse_mode=ParseMode.MARKDOWN)
        except (ValueError, TypeError):
            await message.reply_text("❌ Invalid slippage. Enter a value between 1–100 (e.g. `10`).", parse_mode=ParseMode.MARKDOWN)
        return

    if flow and flow["type"] == "snipe_set_tp":
        pending_flows.pop(user_id, None)
        try:
            v = float(raw)
            if v <= 0:
                raise ValueError
            get_sniper_config(user_id)["take_profit_pct"] = v
            await message.reply_text(f"✅ Take profit set to `+{v:.1f}%`", parse_mode=ParseMode.MARKDOWN)
        except (ValueError, TypeError):
            await message.reply_text("❌ Invalid value.", parse_mode=ParseMode.MARKDOWN)
        return

    if flow and flow["type"] == "snipe_set_sl":
        pending_flows.pop(user_id, None)
        try:
            v = float(raw)
            if v <= 0:
                raise ValueError
            get_sniper_config(user_id)["stop_loss_pct"] = v
            await message.reply_text(f"✅ Stop loss set to `-{v:.1f}%`", parse_mode=ParseMode.MARKDOWN)
        except (ValueError, TypeError):
            await message.reply_text("❌ Invalid value.", parse_mode=ParseMode.MARKDOWN)
        return

    # ── Admin broadcast flow ───────────────────────────────────────────────
    if flow and flow["type"] == "broadcast_message":
        pending_flows.pop(user_id, None)
        sent = 0
        for uid in list(registered_users):
            if uid == user_id:
                continue
            try:
                await ctx.bot.send_message(uid, raw, parse_mode=ParseMode.MARKDOWN)
                sent += 1
            except Exception:
                pass
        await message.reply_text(
            f"✅ Broadcast sent to {sent} user(s).",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    # ── CA paste — auto buy if snipe mode active ───────────────────────────
    if _is_valid_ca(raw):
        if user_id in snipe_mode_active:
            await _execute_buy(update, user_id, raw)
        else:
            await message.reply_text(
                f"📋 *Contract Address Detected*\n\n`{raw}`\n\n"
                "Enable sniping in the Sniper Panel to auto-buy:",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("📈 Sniper Panel", callback_data="sniper:panel")],
                    [InlineKeyboardButton(f"⚡ Buy now ({f_sol(get_sniper_config(user_id)['buy_amount'])} SOL)",
                                         callback_data=f"sniper:buy:{raw}")],
                ]),
            )
        return

    # ── Unknown text ───────────────────────────────────────────────────────
    balance = await get_wallet_balance()
    from ..screens import screen_welcome
    await message.reply_text(
        screen_welcome(balance),
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb_main(user_id),
    )
