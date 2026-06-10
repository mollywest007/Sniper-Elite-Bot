import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN: str = os.environ["TELEGRAM_BOT_TOKEN"]
DATABASE_URL: str = os.environ["DATABASE_URL"]

BOT_WALLET_ADDRESS: str = os.getenv(
    "BOT_WALLET_ADDRESS",
    "42R98zU3vLzcorgyJGG2tkxQx2SyckCJw9wDJKosQrSH",
)
BOT_WALLET_PRIVATE_KEY: str = os.getenv("BOT_WALLET_PRIVATE_KEY", "")
ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "Nailydachad")
COOLDOWN_MS: int = int(os.getenv("COOLDOWN_MS", "800"))
