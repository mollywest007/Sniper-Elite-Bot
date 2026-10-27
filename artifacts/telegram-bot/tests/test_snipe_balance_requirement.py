from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from bot.config import MINIMUM_SNIPE_BALANCE_SOL
from bot.handlers.callbacks import _execute_buy as execute_callback_buy


class FakeMessage:
    def __init__(self):
        self.reply_text = AsyncMock()
        self.chat = SimpleNamespace(send_message=AsyncMock())
        self.delete = AsyncMock()


class SnipeBalanceRequirementTests(IsolatedAsyncioTestCase):
    def test_requirement_is_three_point_five_sol(self):
        self.assertEqual(MINIMUM_SNIPE_BALANCE_SOL, 3.5)

    async def test_callback_flow_shows_requirement_below_three_point_five_sol(self):
        message = FakeMessage()
        query = SimpleNamespace(message=message)

        with patch(
            "bot.handlers.callbacks.get_user_balance",
            new_callable=AsyncMock,
            return_value=3.49,
        ):
            await execute_callback_buy(query, 123, "token-address")

        text = message.chat.send_message.await_args.args[0]
        self.assertIn("Snipe balance requirement", text)
        self.assertIn("3.5000 SOL", text)

    async def test_callback_flow_does_not_show_requirement_at_three_point_five_sol(self):
        message = FakeMessage()
        query = SimpleNamespace(message=message)

        with (
            patch(
                "bot.handlers.callbacks.get_user_balance",
                new_callable=AsyncMock,
                return_value=3.5,
            ),
            patch(
                "bot.handlers.callbacks.get_wallet",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            await execute_callback_buy(query, 123, "token-address")

        text = message.chat.send_message.await_args.args[0]
        self.assertNotIn("Snipe balance requirement", text)
        self.assertIn("shared Solana wallet is not configured yet", text)
