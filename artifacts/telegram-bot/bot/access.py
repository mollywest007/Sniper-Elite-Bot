from dataclasses import dataclass

from .database import get_user_balance
from .market import fetch_sol_usd_price


MINIMUM_WALLET_USD = 50.0


@dataclass(frozen=True)
class WalletAccess:
    allowed: bool
    balance_sol: float
    sol_usd: float | None

    @property
    def balance_usd(self) -> float | None:
        if self.sol_usd is None:
            return None
        return self.balance_sol * self.sol_usd


async def check_wallet_access(user_id: int) -> WalletAccess:
    """Require a live $50 USD-equivalent balance before bot features run."""
    balance_sol = await get_user_balance(user_id)
    sol_usd = await fetch_sol_usd_price()
    balance_usd = balance_sol * sol_usd if sol_usd is not None else None
    return WalletAccess(
        allowed=balance_usd is not None and balance_usd >= MINIMUM_WALLET_USD,
        balance_sol=balance_sol,
        sol_usd=sol_usd,
    )