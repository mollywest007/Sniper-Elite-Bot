from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from bot.config import MINIMUM_SNIPE_BALANCE_SOL
from bot.handlers.callbacks import _execute_buy as execute_callback_buy
from bot.handlers.messages import _execute_buy as execute_message_buy


class FakeMessage:
    def __init__(self):
        self.reply_text = AsyncMock()
        self.chat = SimpleNamespace(send_message=AsyncMock())
        self.delete = AsyncMock()


class SnipeBalanceRequirementTests(IsolatedAsyncioTestCase):
    def test_requirement_is_one_sol(self):
        self.assertEqual(MINIMUM_SNIPE_BALANCE_SOL, 1.0)

    async def test_message_flow_shows_requirement_below_one_sol(self):
        message = FakeMessage()
        update = SimpleNamespace(message=message)

        with patch(
            "bot.handlers.messages.get_user_balance",
            new_callable=AsyncMock,
            return_value=0.99,
        ):
            await execute_message_buy(update, 123, "token-address")

        text = message.reply_text.await_args.args[0]
        self.assertIn("Snipe balance requirement", text)
        self.assertIn("1.0000 SOL", text)

    async def test_message_flow_does_not_show_requirement_at_one_sol(self):
        message = FakeMessage()
        update = SimpleNamespace(message=message)

        with (
            patch(
                "bot.handlers.messages.get_user_balance",
                new_callable=AsyncMock,
                return_value=1.0,
            ),
            patch(
                "bot.handlers.messages.get_wallet",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            await execute_message_buy(update, 123, "token-address")

        text = message.reply_text.await_args.args[0]
        self.assertNotIn("Snipe balance requirement", text)
        self.assertIn("shared Solana wallet is not configured yet", text)

    async def test_callback_flow_shows_requirement_below_one_sol(self):
        message = FakeMessage()
        query = SimpleNamespace(message=message)

        with patch(
            "bot.handlers.callbacks.get_user_balance",
            new_callable=AsyncMock,
            return_value=0.99,
        ):
            await execute_callback_buy(query, 123, "token-address")

        text = message.chat.send_message.await_args.args[0]
        self.assertIn("Snipe balance requirement", text)
        self.assertIn("1.0000 SOL", text)

    async def test_callback_flow_does_not_show_requirement_at_one_sol(self):
        message = FakeMessage()
        query = SimpleNamespace(message=message)

        with (
            patch(
                "bot.handlers.callbacks.get_user_balance",
                new_callable=AsyncMock,
                return_value=1.0,
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
