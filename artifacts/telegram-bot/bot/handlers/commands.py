from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from ..database import get_wallet_valuation, get_or_create_settings, update_settings, touch_bot_user
from ..keyboards import kb_main, kb_back, kb_wallet, kb_wallet_setup
from ..screens import screen_welcome, screen_wallet, screen_wallet_setup
from ..state import registered_users, wallet_generated, is_rate_limited
from ..logger import logger

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not user:
        return
    registered_users.add(user.id)
    await touch_bot_user(user.id)
    wallet_value = None
    if user.id in wallet_generated:
        valuation = await get_wallet_valuation(user.id)
        wallet_value = valuation["total_value"]
    text = screen_welcome(wallet_value)
    await update.message.reply_text(
        text,
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb_main(user.id),
    )
    logger.info("User %s started bot", user.id)


async def cmd_menu(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not user:
        return
    registered_users.add(user.id)
    if is_rate_limited(user.id):
        return
    await touch_bot_user(user.id)
    wallet_value = None
    if user.id in wallet_generated:
        valuation = await get_wallet_valuation(user.id)
        wallet_value = valuation["total_value"]
    await update.message.reply_text(
        screen_welcome(wallet_value),
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb_main(user.id),
    )


async def cmd_wallet(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not user:
        return
    registered_users.add(user.id)
    if is_rate_limited(user.id):
        return
    await touch_bot_user(user.id)
    if user.id not in wallet_generated:
        await update.message.reply_text(
            screen_wallet_setup(),
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=kb_wallet_setup(),
        )
        return
    valuation = await get_wallet_valuation(user.id)
    await update.message.reply_text(
        screen_wallet(
            valuation["cash_balance"],
            valuation["positions_value"],
            valuation["unrealized_pnl"],
        ),
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb_wallet(),
    )


async def cmd_help(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not user:
        return
    if is_rate_limited(user.id):
        return
    text = (
        "❓ *Help*\n\n"
        "`/start`   Main menu\n"
        "`/wallet`  Set up or view your wallet\n"
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
        "[Raydium](https://raydium.io)\n"
        "[Jupiter](https://jup.ag)\n"
        "[Pump fun](https://pump.fun)\n\n"
        "*Support*\n"
        "Contact  t.me/developer9997"
    )
    await update.message.reply_text(
        text,
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=kb_back("menu:home", "◀ Main Menu"),
    )


async def cmd_set(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not user:
        return
    if is_rate_limited(user.id):
        return
    args = ctx.args or []
    if len(args) < 2:
        await update.message.reply_text(
            "Usage:\n`/set buy_amount 0.5`\n`/set slippage 10`\n`/set fee auto|low|medium|high`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    key = args[0].lower()
    val = args[1]
    s = await get_or_create_settings()

    try:
        if key == "buy_amount":
            amount = float(val)
            if amount <= 0:
                raise ValueError
            await update_settings(s["id"], default_buy_amount_sol=f"{amount:.9f}")
            await update.message.reply_text(f"Buy amount set to `{amount:.4f} SOL`", parse_mode=ParseMode.MARKDOWN)
        elif key == "slippage":
            pct = float(val)
            if pct <= 0 or pct > 100:
                raise ValueError
            await update_settings(s["id"], default_slippage_percent=f"{pct:.2f}")
            await update.message.reply_text(f"Slippage set to `{pct:.1f}%`", parse_mode=ParseMode.MARKDOWN)
        elif key == "fee":
            if val not in ("auto", "low", "medium", "high"):
                raise ValueError
            await update_settings(s["id"], default_priority_fee=val)
            await update.message.reply_text(f"Priority fee set to `{val}`", parse_mode=ParseMode.MARKDOWN)
        else:
            await update.message.reply_text(
                "Unknown key. Use `buy_amount`, `slippage`, or `fee`.",
                parse_mode=ParseMode.MARKDOWN,
            )
    except (ValueError, TypeError):
        await update.message.reply_text("Invalid value.", parse_mode=ParseMode.MARKDOWN)
