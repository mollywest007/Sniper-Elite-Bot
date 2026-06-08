import asyncio
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    filters,
)
from bot.config import TELEGRAM_BOT_TOKEN
from bot.database import init_pool, close_pool, seed
from bot.handlers.commands import cmd_start, cmd_menu, cmd_wallet, cmd_help, cmd_set
from bot.handlers.callbacks import handle_callback
from bot.handlers.messages import handle_message
from bot.handlers.monitors import monitor_wallet, monitor_pumpfun
from bot.logger import logger


async def post_init(app: Application) -> None:
    await init_pool()
    await seed()
    logger.info("Bot initialized — polling started")


async def post_shutdown(app: Application) -> None:
    await close_pool()
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

    jq = app.job_queue
    jq.run_repeating(monitor_wallet,  interval=15, first=15)
    jq.run_repeating(monitor_pumpfun, interval=30, first=30)

    logger.info("Starting Phase Snipe bot...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
