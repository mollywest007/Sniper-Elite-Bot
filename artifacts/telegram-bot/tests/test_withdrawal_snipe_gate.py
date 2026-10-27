import asyncio
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from bot.handlers.callbacks import handle_callback
from bot.handlers.messages import handle_message
from bot.state import active_screen_messages, pending_flows, wallet_generated


USER_ID = 975318
DESTINATION = "11111111111111111111111111111111"


class WithdrawalSnipeGateTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.previous_screen = active_screen_messages.pop(USER_ID, None)
        self.previous_flow = pending_flows.pop(USER_ID, None)
        self.was_wallet_ready = USER_ID in wallet_generated
        wallet_generated.add(USER_ID)

    def tearDown(self):
        active_screen_messages.pop(USER_ID, None)
        if self.previous_screen is not None:
            active_screen_messages[USER_ID] = self.previous_screen
        pending_flows.pop(USER_ID, None)
        if self.previous_flow is not None:
            pending_flows[USER_ID] = self.previous_flow
        if not self.was_wallet_ready:
            wallet_generated.discard(USER_ID)

    def make_callback_update(self, data):
        user = SimpleNamespace(id=USER_ID)
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
            from_user=user,
            answer=AsyncMock(),
        )
        return SimpleNamespace(
            callback_query=query,
            effective_user=user,
        ), message

    async def dispatch(self, data):
        update, message = self.make_callback_update(data)
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

    async def test_withdrawal_is_blocked_until_five_successful_buys(self):
        with (
            patch(
                "bot.handlers.callbacks.get_successful_snipe_count",
                new_callable=AsyncMock,
                return_value=4,
            ),
            patch(
                "bot.handlers.callbacks.check_withdrawal_access",
                new_callable=AsyncMock,
            ) as check_balance,
        ):
            text, markup = await self.dispatch("withdraw:start")

        self.assertIn("4/5", text)
        self.assertIn("successful bot buy records", text)
        self.assertNotIn(USER_ID, pending_flows)
        check_balance.assert_not_awaited()
        self.assertEqual(
            markup.inline_keyboard[0][0].callback_data,
            "sniper:paste_ca",
        )

    async def test_five_successful_buys_open_destination_address_prompt(self):
        access = SimpleNamespace(allowed=True, balance_sol=5.0, sol_usd=100.0)
        with (
            patch(
                "bot.handlers.callbacks.get_successful_snipe_count",
                new_callable=AsyncMock,
                return_value=5,
            ),
            patch(
                "bot.handlers.callbacks.check_withdrawal_access",
                new_callable=AsyncMock,
                return_value=access,
            ),
        ):
            text, _ = await self.dispatch("withdraw:start")

        self.assertIn("wallet address you want the withdrawal sent to", text)
        self.assertEqual(pending_flows[USER_ID]["type"], "withdraw_address")

    async def test_address_step_rechecks_successful_buy_count(self):
        pending_flows[USER_ID] = {"type": "withdraw_address"}
        message = SimpleNamespace(
            text=DESTINATION,
            reply_text=AsyncMock(),
        )
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=USER_ID),
        )
        with (
            patch("bot.handlers.messages.is_rate_limited", return_value=False),
            patch(
                "bot.handlers.messages.get_successful_snipe_count",
                new_callable=AsyncMock,
                return_value=2,
            ),
            patch(
                "bot.handlers.messages.check_withdrawal_access",
                new_callable=AsyncMock,
            ) as check_balance,
        ):
            await handle_message(update, SimpleNamespace())

        text = message.reply_text.await_args.args[0]
        self.assertIn("2/5", text)
        self.assertNotIn(USER_ID, pending_flows)
        check_balance.assert_not_awaited()

    async def test_submitted_withdrawal_displays_twenty_to_thirty_minute_eta(self):
        pending_flows[USER_ID] = {
            "type": "withdraw_confirm",
            "to_address": DESTINATION,
            "amount": "0.25",
        }
        access = SimpleNamespace(allowed=True, balance_sol=1.0, sol_usd=150.0)
        with (
            patch(
                "bot.handlers.callbacks.get_successful_snipe_count",
                new_callable=AsyncMock,
                return_value=5,
            ),
            patch(
                "bot.handlers.callbacks.check_withdrawal_access",
                new_callable=AsyncMock,
                return_value=access,
            ),
            patch(
                "bot.handlers.callbacks.get_user_balance",
                new_callable=AsyncMock,
                return_value=1.0,
            ),
            patch(
                "bot.handlers.callbacks.normalise_withdrawal_amount",
                return_value=0.25,
            ),
            patch(
                "bot.handlers.callbacks.debit_user_balance",
                new_callable=AsyncMock,
                return_value=0.75,
            ),
            patch(
                "bot.handlers.callbacks.send_sol_transfer",
                new_callable=AsyncMock,
                return_value="signature",
            ) as send_transfer,
        ):
            text, _ = await self.dispatch("withdraw:confirm")

        send_transfer.assert_awaited_once_with(DESTINATION, 0.25)
        self.assertIn("withdrawal was submitted", text)
        self.assertIn("20–30 minutes", text)
        self.assertIn("Please allow", text)
        self.assertNotIn(USER_ID, pending_flows)
