from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from bot.access import check_wallet_access, check_withdrawal_access
from bot.screens import screen_minimum_balance


class WithdrawalMinimumTests(IsolatedAsyncioTestCase):
    async def test_exactly_two_hundred_usd_does_not_qualify(self):
        with (
            patch(
                "bot.access.get_user_balance",
                new_callable=AsyncMock,
                return_value=2.0,
            ),
            patch(
                "bot.access.fetch_sol_usd_price",
                new_callable=AsyncMock,
                return_value=100.0,
            ),
        ):
            result = await check_withdrawal_access(123)

        self.assertFalse(result.allowed)
        self.assertEqual(result.balance_usd, 200.0)

    async def test_balance_above_two_hundred_usd_qualifies(self):
        with (
            patch(
                "bot.access.get_user_balance",
                new_callable=AsyncMock,
                return_value=2.01,
            ),
            patch(
                "bot.access.fetch_sol_usd_price",
                new_callable=AsyncMock,
                return_value=100.0,
            ),
        ):
            result = await check_withdrawal_access(123)

        self.assertTrue(result.allowed)

    async def test_wallet_minimum_remains_inclusive(self):
        with (
            patch(
                "bot.access.get_user_balance",
                new_callable=AsyncMock,
                return_value=0.5,
            ),
            patch(
                "bot.access.fetch_sol_usd_price",
                new_callable=AsyncMock,
                return_value=100.0,
            ),
        ):
            result = await check_wallet_access(123)

        self.assertTrue(result.allowed)

    def test_withdrawal_message_says_balance_must_be_over_threshold(self):
        text = screen_minimum_balance(
            2.0,
            100.0,
            minimum_usd=200.0,
            action="withdraw",
        )

        self.assertIn("more than *$200.00*", text)
