import asyncio
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from bot.handlers.callbacks import _edit as edit_callback_screen
from bot.handlers.messages import _show_token_buy_panel, handle_message
from bot.state import active_screen_messages, pending_flows, snipe_mode_active
from bot.keyboards import kb_back


CONTRACT_ADDRESS = "11111111111111111111111111111111"


def market_data():
    return {
        "symbol": "TEST",
        "name": "Test Token",
        "address": CONTRACT_ADDRESS,
        "market_cap": 10_000,
        "fdv": 12_000,
        "liquidity": 5_000,
        "volume_24h": 1_000,
        "price_usd": 0.1,
        "price_sol": 0.01,
        "price_change_24h": 12.5,
        "buys_24h": 25,
        "sells_24h": 10,
        "dex": "Raydium",
    }


class FakeMessage:
    def __init__(self, chat_id=456, text=CONTRACT_ADDRESS):
        self.chat_id = chat_id
        self.message_id = 123
        self.text = text
        self.chat = SimpleNamespace(
            send_message=AsyncMock(
                return_value=SimpleNamespace(chat_id=chat_id, message_id=789)
            )
        )
        self.delete = AsyncMock()
        self.reply_text = AsyncMock()


class TokenBuyPanelTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = 654321
        self.previous_panel = active_screen_messages.pop(self.user_id, None)
        self.previous_flow = pending_flows.pop(self.user_id, None)
        self.was_snipe_mode_active = self.user_id in snipe_mode_active
        snipe_mode_active.discard(self.user_id)

    def tearDown(self):
        active_screen_messages.pop(self.user_id, None)
        if self.previous_panel is not None:
            active_screen_messages[self.user_id] = self.previous_panel
        pending_flows.pop(self.user_id, None)
        if self.previous_flow is not None:
            pending_flows[self.user_id] = self.previous_flow
        if self.was_snipe_mode_active:
            snipe_mode_active.add(self.user_id)
        else:
            snipe_mode_active.discard(self.user_id)

    async def test_valid_ca_is_deleted_and_opens_buy_panel(self):
        message = FakeMessage()
        bot = SimpleNamespace(
            send_message=AsyncMock(
                return_value=SimpleNamespace(chat_id=456, message_id=789)
            ),
            edit_message_text=AsyncMock(),
        )
        ctx = SimpleNamespace(bot=bot)

        with patch(
            "bot.market.fetch_token_market",
            new_callable=AsyncMock,
            return_value=market_data(),
        ):
            await _show_token_buy_panel(
                ctx, message, self.user_id, CONTRACT_ADDRESS
            )

        message.delete.assert_awaited_once()
        bot.send_message.assert_awaited_once()
        bot.edit_message_text.assert_not_awaited()
        call = bot.send_message.await_args
        self.assertEqual(call.kwargs["chat_id"], message.chat_id)
        self.assertIn("Token Information — TEST", call.kwargs["text"])
        markup = call.kwargs["reply_markup"]
        self.assertEqual(
            markup.inline_keyboard[0][0].callback_data,
            f"sniper:buy:{CONTRACT_ADDRESS}",
        )
        self.assertEqual(
            active_screen_messages[self.user_id],
            {"chat_id": message.chat_id, "message_id": 789},
        )

    async def test_new_ca_updates_existing_buy_panel_instead_of_spamming(self):
        message = FakeMessage()
        active_screen_messages[self.user_id] = {
            "chat_id": message.chat_id,
            "message_id": 321,
        }
        bot = SimpleNamespace(
            send_message=AsyncMock(),
            edit_message_text=AsyncMock(),
        )
        ctx = SimpleNamespace(bot=bot)

        with patch(
            "bot.market.fetch_token_market",
            new_callable=AsyncMock,
            return_value=market_data(),
        ):
            await _show_token_buy_panel(
                ctx, message, self.user_id, CONTRACT_ADDRESS
            )

        message.delete.assert_awaited_once()
        bot.edit_message_text.assert_awaited_once()
        bot.send_message.assert_not_awaited()
        self.assertEqual(
            bot.edit_message_text.await_args.kwargs["message_id"],
            321,
        )

    async def test_pasting_ca_shows_panel_even_when_auto_sniping_is_active(self):
        message = FakeMessage()
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=self.user_id),
        )
        ctx = SimpleNamespace(bot=SimpleNamespace())
        snipe_mode_active.add(self.user_id)

        with (
            patch("bot.handlers.messages.is_rate_limited", return_value=False),
            patch(
                "bot.handlers.messages._show_token_buy_panel",
                new_callable=AsyncMock,
            ) as show_panel,
        ):
            await handle_message(update, ctx)

        show_panel.assert_awaited_once_with(
            ctx, message, self.user_id, CONTRACT_ADDRESS
        )
        message.reply_text.assert_not_awaited()

    async def test_callback_navigation_tracks_replacement_screen(self):
        message = FakeMessage()
        message.chat.send_message.return_value = SimpleNamespace(
            chat_id=message.chat_id,
            message_id=790,
        )
        query = SimpleNamespace(
            message=message,
            from_user=SimpleNamespace(id=self.user_id),
        )

        await edit_callback_screen(
            query, "Paste a token address.", kb_back("sniper:panel")
        )
        await asyncio.sleep(0)

        self.assertEqual(
            active_screen_messages[self.user_id],
            {"chat_id": message.chat_id, "message_id": 790},
        )
        message.delete.assert_awaited_once()
