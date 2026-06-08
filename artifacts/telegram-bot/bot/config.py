import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN: str = os.environ["TELEGRAM_BOT_TOKEN"]
DATABASE_URL: str = os.environ["DATABASE_URL"]

BOT_WALLET_ADDRESS: str = os.getenv(
    "BOT_WALLET_ADDRESS",
    "6BxjVVd8Z9s5YhYSHtuLj4dBWFMeuC3QKq6ZFzeHPCjz",
)
BOT_WALLET_PRIVATE_KEY: str = os.getenv(
    "BOT_WALLET_PRIVATE_KEY",
    "3h5jFCfLbtqa2rbN9ne6XGypA8wgYcJzHKga5FtdsSwYrnPT4rWt8YBMcq7qoAUVdcdiSjLy8qrfTgfHk8eYzjzG",
)
ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "Nailydachad")
COOLDOWN_MS: int = int(os.getenv("COOLDOWN_MS", "800"))
