import asyncio
from telegram import BotCommand
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    filters,
)
from bot.config import TELEGRAM_BOT_TOKEN
from bot.database import init_pool, close_pool, seed, load_wallet_generated_users
from bot.handlers.commands import cmd_start, cmd_menu, cmd_wallet, cmd_help, cmd_set
from bot.handlers.callbacks import handle_callback
from bot.handlers.messages import handle_message
from bot.handlers.monitors import monitor_wallet
from bot.logger import logger


async def on_error(update: object, context) -> None:
    """Keep polling alive and make handler failures visible in workflow logs."""
    error = context.error
    logger.error(
        "Unhandled Telegram update error for %s: %s",
        type(update).__name__,
        error,
        exc_info=(type(error), error, error.__traceback__) if error else None,
    )


async def post_init(app: Application) -> None:
    from bot.state import wallet_generated
    await init_pool()
    await seed()
    persisted = await load_wallet_generated_users()
    wallet_generated.update(persisted)
    try:
        await app.bot.set_my_short_description("")
    except Exception as e:
        logger.warning("Could not clear short description: %s", e)
    try:
        await app.bot.set_my_description("")
    except Exception as e:
        logger.warning("Could not clear description: %s", e)
    try:
        await app.bot.set_my_commands([
            BotCommand("start", "Open the sniper menu"),
            BotCommand("menu", "Return to the main menu"),
            BotCommand("wallet", "View and manage your wallet"),
            BotCommand("set", "Configure buy amount, slippage or fee"),
            BotCommand("help", "Show help and support info"),
        ])
    except Exception as e:
        logger.warning("Could not set command list: %s", e)
    logger.info("Bot initialized — polling started (%d wallet(s) already generated)", len(persisted))


async def post_shutdown(app: Application) -> None:
    await close_pool()
    from bot.market import close_http_client as close_market_client
    from bot.solana import close_http_client as close_solana_client
    await close_market_client()
    await close_solana_client()
    logger.info("Bot shut down")


def main() -> None:
    app = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .post_init(post_init)
        .post_shutdown(post_shutdown)
        .build()
    )

    app.add_handler(CommandHandler("start",  cmd_start))
    app.add_handler(CommandHandler("menu",   cmd_menu))
    app.add_handler(CommandHandler("wallet", cmd_wallet))
    app.add_handler(CommandHandler("help",   cmd_help))
    app.add_handler(CommandHandler("set",    cmd_set))

    app.add_handler(CallbackQueryHandler(handle_callback))

    app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )
    app.add_error_handler(on_error)

    jq = app.job_queue
    jq.run_repeating(monitor_wallet, interval=15, first=15)

    logger.info("Starting Phase Snipe bot...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
