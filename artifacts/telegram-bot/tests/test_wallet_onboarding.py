import asyncio
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from bot.handlers.callbacks import handle_callback
from bot.handlers.commands import cmd_start, cmd_wallet
from bot.handlers.messages import handle_message
from bot.keyboards import kb_main
from bot.state import pending_flows, sniper_configs, wallet_generated


class FakeMessage:
    def __init__(self):
        self.reply_text = AsyncMock()
        self.chat = SimpleNamespace(send_message=AsyncMock())
        self.chat_id = 123
        self.message_id = 456
        self.edit_text = AsyncMock()
        self.delete = AsyncMock()


class WalletOnboardingTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = 912345
        self.previous_wallet_state = set(wallet_generated)
        wallet_generated.clear()
        self.previous_pending_flow = pending_flows.pop(self.user_id, None)
        self.previous_sniper_config = sniper_configs.pop(self.user_id, None)

    def tearDown(self):
        wallet_generated.clear()
        wallet_generated.update(self.previous_wallet_state)
        pending_flows.pop(self.user_id, None)
        if self.previous_pending_flow is not None:
            pending_flows[self.user_id] = self.previous_pending_flow
        sniper_configs.pop(self.user_id, None)
        if self.previous_sniper_config is not None:
            sniper_configs[self.user_id] = self.previous_sniper_config

    async def test_start_keeps_new_user_unset_up(self):
        message = FakeMessage()
        update = SimpleNamespace(
            effective_user=SimpleNamespace(id=self.user_id),
            message=message,
        )

        with (
            patch("bot.handlers.commands.touch_bot_user", new_callable=AsyncMock),
            patch(
                "bot.handlers.commands.get_wallet_valuation",
                new_callable=AsyncMock,
            ) as get_valuation,
        ):
            await cmd_start(update, None)

        self.assertNotIn(self.user_id, wallet_generated)
        get_valuation.assert_not_awaited()
        self.assertIn("Wallet Setup", message.reply_text.await_args.args[0])
        button = message.reply_text.await_args.kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(button.text, "💼 Start Your Wallet")
        self.assertEqual(button.callback_data, "wallet:show")

    async def test_wallet_command_prompts_before_activation(self):
        message = FakeMessage()
        update = SimpleNamespace(
            effective_user=SimpleNamespace(id=self.user_id),
            message=message,
        )

        with (
            patch("bot.handlers.commands.touch_bot_user", new_callable=AsyncMock),
            patch("bot.handlers.commands.is_rate_limited", return_value=False),
            patch(
                "bot.handlers.commands.get_wallet_valuation",
                new_callable=AsyncMock,
            ) as get_valuation,
        ):
            await cmd_wallet(update, None)

        get_valuation.assert_not_awaited()
        self.assertEqual(
            message.reply_text.await_args.args[0],
            "💼 *Start Your Wallet*\n\nSet up your wallet to get started.",
        )
        markup = message.reply_text.await_args.kwargs["reply_markup"]
        self.assertEqual(
            markup.inline_keyboard[0][0].callback_data,
            "wallet:setup:confirm",
        )
        self.assertEqual(markup.inline_keyboard[0][0].text, "✅ Start Wallet")
        self.assertNotIn(self.user_id, wallet_generated)

    async def test_confirm_activates_account_and_shows_wallet(self):
        message = FakeMessage()
        query = SimpleNamespace(
            data="wallet:setup:confirm",
            answer=AsyncMock(),
            message=message,
        )
        update = SimpleNamespace(
            callback_query=query,
            effective_user=SimpleNamespace(id=self.user_id),
        )
        valuation = {
            "cash_balance": 0.0,
            "positions_value": 0.0,
            "unrealized_pnl": 0.0,
        }

        with (
            patch(
                "bot.handlers.callbacks._touch_user_in_background",
                new_callable=AsyncMock,
            ),
            patch("bot.handlers.callbacks.is_rate_limited", return_value=False),
            patch(
                "bot.handlers.callbacks.activate_wallet_account",
                new_callable=AsyncMock,
            ) as activate,
            patch(
                "bot.handlers.callbacks.get_wallet_valuation",
                new_callable=AsyncMock,
                return_value=valuation,
            ),
        ):
            await handle_callback(update, None)
            await asyncio.sleep(0)

        activate.assert_awaited_once_with(self.user_id)
        self.assertIn(self.user_id, wallet_generated)
        text = message.chat.send_message.await_args.args[0]
        self.assertIn("Wallet Ready", text)
        self.assertIn("Bot private key", text)
        self.assertIn("stored in the bot", text)
        self.assertIn("Available SOL", text)

    async def test_reopening_wallet_keeps_bot_key_note_visible(self):
        wallet_generated.add(self.user_id)
        message = FakeMessage()
        query = SimpleNamespace(
            data="wallet:show",
            answer=AsyncMock(),
            message=message,
        )
        update = SimpleNamespace(
            callback_query=query,
            effective_user=SimpleNamespace(id=self.user_id),
        )
        valuation = {
            "cash_balance": 0.0,
            "positions_value": 0.0,
            "unrealized_pnl": 0.0,
        }

        with (
            patch(
                "bot.handlers.callbacks._touch_user_in_background",
                new_callable=AsyncMock,
            ),
            patch("bot.handlers.callbacks.is_rate_limited", return_value=False),
            patch(
                "bot.handlers.callbacks.get_wallet_valuation",
                new_callable=AsyncMock,
                return_value=valuation,
            ),
        ):
            await handle_callback(update, None)

        text = message.chat.send_message.await_args.args[0]
        self.assertIn("Wallet Ready", text)
        self.assertIn("Bot private key", text)
        self.assertIn("stored in the bot", text)

    async def test_setting_prompt_reuses_card_and_saves_its_message_id(self):
        message = FakeMessage()
        query = SimpleNamespace(
            data="sniper:set:slippage",
            answer=AsyncMock(),
            message=message,
        )
        update = SimpleNamespace(
            callback_query=query,
            effective_user=SimpleNamespace(id=self.user_id),
        )

        with (
            patch(
                "bot.handlers.callbacks._touch_user_in_background",
                new_callable=AsyncMock,
            ),
            patch("bot.handlers.callbacks.is_rate_limited", return_value=False),
        ):
            await handle_callback(update, None)
            await asyncio.sleep(0)

        message.edit_text.assert_awaited_once()
        self.assertEqual(
            pending_flows[self.user_id]["type"],
            "snipe_set_slippage",
        )
        self.assertEqual(pending_flows[self.user_id]["chat_id"], message.chat_id)
        self.assertEqual(
            pending_flows[self.user_id]["prompt_message_id"],
            message.message_id,
        )

    async def test_setting_text_is_deleted_and_settings_card_is_restored(self):
        cases = (
            ("snipe_set_slippage", "12", "12.0%"),
            ("snipe_set_tp", "65", "65.0%"),
            ("snipe_set_sl", "18", "18.0%"),
        )
        for flow_type, value, expected in cases:
            with self.subTest(flow=flow_type):
                pending_flows[self.user_id] = {
                    "type": flow_type,
                    "chat_id": 123,
                    "prompt_message_id": 456,
                }
                message = FakeMessage()
                message.text = value
                update = SimpleNamespace(
                    message=message,
                    effective_user=SimpleNamespace(id=self.user_id),
                )
                bot = SimpleNamespace(edit_message_text=AsyncMock())
                context = SimpleNamespace(bot=bot)

                with patch(
                    "bot.handlers.messages.is_rate_limited",
                    return_value=False,
                ):
                    await handle_message(update, context)

                message.delete.assert_awaited_once()
                message.reply_text.assert_not_awaited()
                bot.edit_message_text.assert_awaited_once()
                self.assertIn(expected, bot.edit_message_text.await_args.kwargs["text"])
                self.assertNotIn(self.user_id, pending_flows)
