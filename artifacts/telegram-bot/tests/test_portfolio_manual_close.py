import asyncio
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from bot.handlers.callbacks import handle_callback
from bot.state import active_screen_messages


USER_ID = 246810
POSITION_ID = 41


def make_position():
    return {
        "id": POSITION_ID,
        "telegram_user_id": USER_ID,
        "token_symbol": "TEST",
        "token_name": "Test Token",
        "contract_address": "11111111111111111111111111111111",
        "amount_tokens": 1000.0,
        "entry_price_sol": 0.01,
        "value_sol": 12.0,
        "pnl_sol": 2.0,
        "pnl_percent": 20.0,
        "market_cap_usd": 10000.0,
    }


def make_market():
    return {
        "symbol": "TEST",
        "name": "Test Token",
        "price_sol": 0.012,
        "market_cap": 10000,
        "liquidity": 5000,
    }


class ManualPortfolioCloseTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.previous_screen = active_screen_messages.pop(USER_ID, None)

    def tearDown(self):
        active_screen_messages.pop(USER_ID, None)
        if self.previous_screen is not None:
            active_screen_messages[USER_ID] = self.previous_screen

    def make_update(self, data):
        message = SimpleNamespace(
            chat_id=123,
            message_id=10,
            chat=SimpleNamespace(
                send_message=AsyncMock(
                    return_value=SimpleNamespace(chat_id=123, message_id=11)
                )
            ),
            delete=AsyncMock(),
        )
        query = SimpleNamespace(
            data=data,
            message=message,
            from_user=SimpleNamespace(id=USER_ID),
            answer=AsyncMock(),
        )
        return SimpleNamespace(
            callback_query=query,
            effective_user=SimpleNamespace(id=USER_ID),
        ), message

    async def dispatch(self, data):
        update, message = self.make_update(data)
        with (
            patch("bot.handlers.callbacks.is_rate_limited", return_value=False),
            patch(
                "bot.handlers.callbacks._touch_user_in_background",
                new_callable=AsyncMock,
            ),
        ):
            await handle_callback(update, SimpleNamespace())
            await asyncio.sleep(0)
        sent = message.chat.send_message.await_args
        return sent.args[0], sent.kwargs["reply_markup"]

    async def test_portfolio_displays_close_button_for_each_position(self):
        valuation = {
            "positions": [make_position()],
            "cash_balance": 5.0,
            "positions_value": 12.0,
            "total_value": 17.0,
            "unrealized_pnl": 2.0,
        }
        update, message = self.make_update("portfolio")
        with (
            patch("bot.handlers.callbacks.is_rate_limited", return_value=False),
            patch(
                "bot.handlers.callbacks._touch_user_in_background",
                new_callable=AsyncMock,
            ),
            patch(
                "bot.handlers.callbacks.get_wallet_valuation",
                new_callable=AsyncMock,
                return_value=valuation,
            ),
        ):
            await handle_callback(update, SimpleNamespace())
            await asyncio.sleep(0)

        markup = message.chat.send_message.await_args.kwargs["reply_markup"]
        self.assertEqual(
            markup.inline_keyboard[0][0].callback_data,
            f"portfolio:close:{POSITION_ID}",
        )

    async def test_close_button_shows_live_quote_and_internal_close_warning(self):
        with (
            patch(
                "bot.handlers.callbacks.get_positions",
                new_callable=AsyncMock,
                return_value=[make_position()],
            ),
            patch(
                "bot.handlers.callbacks.fetch_token_market",
                new_callable=AsyncMock,
                return_value=make_market(),
            ),
        ):
            text, markup = await self.dispatch(f"portfolio:close:{POSITION_ID}")

        self.assertIn("Confirm Manual Close", text)
        self.assertIn("0.012 SOL", text)
        self.assertIn("does *not* send an on-chain sell transaction", text)
        self.assertEqual(
            markup.inline_keyboard[0][0].callback_data,
            f"portfolio:confirm-close:{POSITION_ID}",
        )
        self.assertEqual(markup.inline_keyboard[1][0].callback_data, "portfolio")

    async def test_confirmation_closes_only_the_users_open_position(self):
        position = make_position()
        market = make_market()
        settled = {
            "symbol": "TEST",
            "value_sol": 12.0,
            "pnl_sol": 2.0,
            "pnl_percent": 20.0,
            "balance_sol": 17.0,
        }
        with (
            patch(
                "bot.handlers.callbacks.get_positions",
                new_callable=AsyncMock,
                return_value=[position],
            ),
            patch(
                "bot.handlers.callbacks.fetch_token_market",
                new_callable=AsyncMock,
                return_value=market,
            ),
            patch(
                "bot.handlers.callbacks.settle_position_if_triggered",
                new_callable=AsyncMock,
                return_value=settled,
            ) as settle,
        ):
            text, markup = await self.dispatch(
                f"portfolio:confirm-close:{POSITION_ID}"
            )

        settle.assert_awaited_once_with(
            POSITION_ID,
            market["price_sol"],
            market,
            force=True,
            user_id=USER_ID,
        )
        self.assertIn("Position Closed", text)
        self.assertIn("internal portfolio close", text)
        self.assertEqual(markup.inline_keyboard[0][0].callback_data, "portfolio")

    async def test_missing_live_quote_leaves_position_open(self):
        with (
            patch(
                "bot.handlers.callbacks.get_positions",
                new_callable=AsyncMock,
                return_value=[make_position()],
            ),
            patch(
                "bot.handlers.callbacks.fetch_token_market",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "bot.handlers.callbacks.settle_position_if_triggered",
                new_callable=AsyncMock,
            ) as settle,
        ):
            text, _ = await self.dispatch(f"portfolio:confirm-close:{POSITION_ID}")

        self.assertIn("position remains open", text)
        settle.assert_not_awaited()
