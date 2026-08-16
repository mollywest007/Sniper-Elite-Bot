import asyncpg
from typing import Any, Optional
from .config import (
    DATABASE_URL,
    BOT_WALLET_ADDRESS,
)
from .logger import logger

_pool: Optional[asyncpg.Pool] = None


def _dsn() -> str:
    url = DATABASE_URL
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(_dsn(), min_size=4, max_size=15)
    logger.info("Database pool created")


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    assert _pool is not None, "DB pool not initialized"
    return _pool


async def seed() -> None:
    async with pool().acquire() as conn:
        wallets = await conn.fetch("SELECT id, address FROM wallets LIMIT 1")
        if not wallets:
            await conn.execute(
                """INSERT INTO wallets (name, address, private_key, balance_sol, balance_usdc, is_active)
                   VALUES ($1,$2,$3,'0','0',true)""",
                "Bot Wallet", BOT_WALLET_ADDRESS, "",
            )
            logger.info("Seeded bot wallet")
        elif wallets[0]["address"] != BOT_WALLET_ADDRESS:
            await conn.execute(
                "UPDATE wallets SET address=$1, private_key='' WHERE id=$2",
                BOT_WALLET_ADDRESS, wallets[0]["id"],
            )
            logger.info("Updated wallet address to %s", BOT_WALLET_ADDRESS)

        settings = await conn.fetch("SELECT id FROM settings LIMIT 1")
        if not settings:
            await conn.execute("INSERT INTO settings DEFAULT VALUES")
            logger.info("Seeded default settings")

        await conn.execute(
            """CREATE TABLE IF NOT EXISTS bot_users (
                telegram_id BIGINT PRIMARY KEY,
                wallet_generated BOOLEAN NOT NULL DEFAULT FALSE,
                first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )"""
        )
        await conn.execute(
            """ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS
               last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"""
        )
        await conn.execute(
            """CREATE TABLE IF NOT EXISTS bot_accounts (
                telegram_user_id BIGINT PRIMARY KEY REFERENCES bot_users(telegram_id)
                    ON DELETE CASCADE,
                wallet_id INTEGER NOT NULL REFERENCES wallets(id),
                wallet_address TEXT NOT NULL,
                balance_sol NUMERIC(18,9) NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )"""
        )
        await conn.execute(
            """CREATE TABLE IF NOT EXISTS bot_transactions (
                id BIGSERIAL PRIMARY KEY,
                telegram_user_id BIGINT NOT NULL REFERENCES bot_accounts(telegram_user_id)
                    ON DELETE CASCADE,
                transaction_type TEXT NOT NULL CHECK (
                    transaction_type IN ('deposit', 'withdrawal', 'trade')
                ),
                amount_sol NUMERIC(18,9) NOT NULL,
                balance_after NUMERIC(18,9) NOT NULL,
                tx_hash TEXT,
                description TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )"""
        )
        for table in ("positions", "trades", "snipers", "copy_trades", "limit_orders", "dca_setups"):
            await conn.execute(
                f"""ALTER TABLE {table}
                    ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT
                    REFERENCES bot_accounts(telegram_user_id) ON DELETE CASCADE"""
            )
            await conn.execute(
                f"""CREATE INDEX IF NOT EXISTS {table}_telegram_user_id_idx
                    ON {table}(telegram_user_id)"""
            )
        await conn.execute(
            """CREATE INDEX IF NOT EXISTS bot_transactions_user_created_idx
               ON bot_transactions(telegram_user_id, created_at DESC)"""
        )


async def load_wallet_generated_users() -> set[int]:
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT telegram_id FROM bot_users WHERE wallet_generated = TRUE"
        )
        return {int(r["telegram_id"]) for r in rows}


async def mark_wallet_generated(user_id: int) -> None:
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO bot_users (telegram_id, wallet_generated)
               VALUES ($1, TRUE)
               ON CONFLICT (telegram_id)
               DO UPDATE SET wallet_generated = TRUE""",
            user_id,
        )


async def ensure_bot_user(user_id: int) -> None:
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO bot_users (telegram_id)
               VALUES ($1)
               ON CONFLICT DO NOTHING""",
            user_id,
        )
        wallet = await conn.fetchrow(
            "SELECT id, address FROM wallets WHERE address=$1", BOT_WALLET_ADDRESS
        )
        if not wallet:
            raise RuntimeError("Shared bot wallet is not configured")
        await conn.execute(
            """INSERT INTO bot_accounts
                   (telegram_user_id, wallet_id, wallet_address)
               VALUES ($1, $2, $3)
               ON CONFLICT (telegram_user_id) DO NOTHING""",
            user_id, wallet["id"], wallet["address"],
        )


async def touch_bot_user(user_id: int) -> None:
    """Record that this user was active right now (for monthly user counting)."""
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO bot_users (telegram_id, last_seen_at)
               VALUES ($1, NOW())
               ON CONFLICT (telegram_id)
               DO UPDATE SET last_seen_at = NOW()""",
            user_id,
        )
        wallet = await conn.fetchrow(
            "SELECT id, address FROM wallets WHERE address=$1", BOT_WALLET_ADDRESS
        )
        if wallet:
            await conn.execute(
                """INSERT INTO bot_accounts
                       (telegram_user_id, wallet_id, wallet_address)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (telegram_user_id) DO NOTHING""",
                user_id, wallet["id"], wallet["address"],
            )


async def get_monthly_user_count() -> int:
    """Return base (931) + distinct users active in the last 30 days."""
    BASE = 931
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            """SELECT COUNT(*) AS cnt FROM bot_users
               WHERE last_seen_at >= NOW() - INTERVAL '30 days'"""
        )
        return BASE + (int(row["cnt"]) if row else 0)


async def get_wallet_balance() -> float:
    """Read cached balance from DB (fast)."""
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT balance_sol FROM wallets WHERE address=$1", BOT_WALLET_ADDRESS
        )
        return float(row["balance_sol"]) if row else 0.0


async def update_wallet_balance(amount: float) -> None:
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE wallets SET balance_sol=$1 WHERE address=$2",
            f"{amount:.9f}", BOT_WALLET_ADDRESS,
        )


async def sync_wallet_balance(address: str) -> float:
    """Fetch real SOL balance from Solana RPC, save to DB, return it.
    Falls back to cached DB value if RPC is unreachable.
    """
    from .solana import fetch_sol_balance
    live = await fetch_sol_balance(address)
    if live is None:
        return await get_wallet_balance()
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE wallets SET balance_sol=$1 WHERE address=$2",
            f"{live:.9f}", address,
        )
    return live


async def get_user_balance(user_id: int) -> float:
    """Read only this Telegram user's internal ledger balance.

    The shared Solana wallet is deliberately not used here. It is the common
    on-chain address, while balances shown in the bot belong to bot_accounts.
    """
    await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT balance_sol FROM bot_accounts WHERE telegram_user_id=$1",
            user_id,
        )
        return float(row["balance_sol"]) if row else 0.0


async def get_display_balance(user: Any, refresh: bool = False) -> float:
    """Return the authenticated Telegram user's isolated ledger balance."""
    user_id = getattr(user, "id", None)
    if user_id is None:
        return 0.0
    return await get_user_balance(int(user_id))


async def _change_user_balance(
    user_id: int,
    delta: float,
    transaction_type: str,
    *,
    tx_hash: str | None = None,
    description: str | None = None,
) -> float:
    """Atomically update one account and append its ledger entry.

    A conditional debit prevents negative balances and prevents two concurrent
    Telegram updates from spending the same funds.
    """
    if transaction_type not in ("deposit", "withdrawal", "trade"):
        raise ValueError(f"Unsupported transaction type: {transaction_type}")
    await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        async with conn.transaction():
            if delta < 0:
                row = await conn.fetchrow(
                    """UPDATE bot_accounts
                       SET balance_sol = balance_sol + $1, updated_at = NOW()
                       WHERE telegram_user_id=$2 AND balance_sol >= $3
                       RETURNING balance_sol""",
                    f"{delta:.9f}", user_id, f"{abs(delta):.9f}",
                )
            else:
                row = await conn.fetchrow(
                    """UPDATE bot_accounts
                       SET balance_sol = balance_sol + $1, updated_at = NOW()
                       WHERE telegram_user_id=$2
                       RETURNING balance_sol""",
                    f"{delta:.9f}", user_id,
                )
            if not row:
                raise ValueError("Insufficient user balance")
            balance = row["balance_sol"]
            await conn.execute(
                """INSERT INTO bot_transactions
                   (telegram_user_id, transaction_type, amount_sol,
                    balance_after, tx_hash, description)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                user_id, transaction_type, f"{delta:.9f}",
                balance, tx_hash, description,
            )
            return float(balance)


async def credit_user_deposit(
    user_id: int, amount_sol: float, tx_hash: str, description: str = "Verified deposit"
) -> float:
    """Credit a deposit after an external/on-chain verifier attributes it."""
    if amount_sol <= 0 or not tx_hash:
        raise ValueError("Deposit amount and transaction hash are required")
    return await _change_user_balance(
        user_id, amount_sol, "deposit", tx_hash=tx_hash, description=description
    )


async def debit_user_balance(
    user_id: int,
    amount_sol: float,
    transaction_type: str,
    tx_hash: str,
    description: str,
) -> float:
    if amount_sol <= 0:
        raise ValueError("Amount must be positive")
    return await _change_user_balance(
        user_id, -amount_sol, transaction_type,
        tx_hash=tx_hash, description=description,
    )


async def execute_user_trade(
    user_id: int,
    wallet_id: int,
    contract_address: str,
    amount_sol: float,
    slippage_percent: float,
    priority_fee: str,
    tx_hash: str,
) -> None:
    """Debit, ledger, and persist a trade/sniper atomically for one user."""
    if amount_sol <= 0:
        raise ValueError("Amount must be positive")
    await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """UPDATE bot_accounts
                   SET balance_sol = balance_sol - $1, updated_at = NOW()
                   WHERE telegram_user_id=$2 AND balance_sol >= $1
                   RETURNING balance_sol""",
                f"{amount_sol:.9f}", user_id,
            )
            if not row:
                raise ValueError("Insufficient user balance")
            balance = row["balance_sol"]
            await conn.execute(
                """INSERT INTO bot_transactions
                   (telegram_user_id, transaction_type, amount_sol,
                    balance_after, tx_hash, description)
                   VALUES ($1,'trade',$2,$3,$4,$5)""",
                user_id, f"{-amount_sol:.9f}", balance, tx_hash,
                f"Buy {contract_address}",
            )
            await conn.execute(
                """INSERT INTO trades
                   (telegram_user_id, wallet_id, type, token_symbol, token_name,
                    contract_address, amount_sol, amount_tokens, price_sol,
                    tx_hash, status)
                   VALUES ($1,$2,'buy','TOKEN','Unknown',$3,$4,'0','0',$5,
                           'success'::trade_status)""",
                user_id, wallet_id, contract_address, f"{amount_sol:.9f}", tx_hash,
            )
            await conn.execute(
                """INSERT INTO snipers
                   (telegram_user_id, wallet_id, contract_address,
                    buy_amount_sol, slippage_percent, priority_fee, status, attempts)
                   VALUES ($1,$2,$3,$4,$5,$6::priority_fee,'sniped'::sniper_status,1)""",
                user_id, wallet_id, contract_address, f"{amount_sol:.9f}",
                f"{slippage_percent:.2f}", priority_fee,
            )


async def sync_address_balance(address: str) -> float | None:
    """Fetch real SOL balance from Solana RPC for any address (used by monitors)."""
    from .solana import fetch_sol_balance
    return await fetch_sol_balance(address)


async def get_wallet() -> Optional[dict[str, Any]]:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM wallets WHERE address=$1", BOT_WALLET_ADDRESS
        )
        return dict(row) if row else None


async def get_or_create_settings() -> dict[str, Any]:
    async with pool().acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM settings LIMIT 1")
        if row:
            return dict(row)
        row = await conn.fetchrow("INSERT INTO settings DEFAULT VALUES RETURNING *")
        return dict(row)


async def update_settings(settings_id: int, **kwargs: Any) -> None:
    if not kwargs:
        return
    cols = ", ".join(f"{k}=${i+2}" for i, k in enumerate(kwargs))
    vals = list(kwargs.values())
    async with pool().acquire() as conn:
        await conn.execute(
            f"UPDATE settings SET {cols} WHERE id=$1", settings_id, *vals
        )


async def get_trades(limit: int = 8, user_id: int | None = None) -> list[dict[str, Any]]:
    if user_id is not None:
        await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        if user_id is None:
            rows = await conn.fetch(
                "SELECT * FROM trades ORDER BY executed_at DESC LIMIT $1", limit
            )
        else:
            rows = await conn.fetch(
                """SELECT * FROM trades
                   WHERE telegram_user_id=$1
                   ORDER BY executed_at DESC LIMIT $2""",
                user_id, limit,
            )
        return [dict(r) for r in rows]


async def insert_trade(
    telegram_user_id: int,
    wallet_id: int,
    trade_type: str,
    token_symbol: str,
    token_name: str,
    contract_address: str,
    amount_sol: float,
    price_sol: str,
    tx_hash: str,
    status: str = "success",
) -> None:
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO trades
               (telegram_user_id, wallet_id, type, token_symbol, token_name, contract_address,
                amount_sol, price_sol, tx_hash, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::trade_status)""",
            telegram_user_id, wallet_id, trade_type, token_symbol, token_name, contract_address,
            f"{amount_sol:.9f}", price_sol, tx_hash, status,
        )


async def get_snipers(limit: int = 8, user_id: int | None = None) -> list[dict[str, Any]]:
    if user_id is not None:
        await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        if user_id is None:
            rows = await conn.fetch(
                "SELECT * FROM snipers ORDER BY created_at DESC LIMIT $1", limit
            )
        else:
            rows = await conn.fetch(
                """SELECT * FROM snipers
                   WHERE telegram_user_id=$1
                   ORDER BY created_at DESC LIMIT $2""",
                user_id, limit,
            )
        return [dict(r) for r in rows]


async def insert_sniper(
    telegram_user_id: int,
    wallet_id: int,
    contract_address: str,
    buy_amount_sol: float,
    slippage_percent: float,
    priority_fee: str,
    status: str = "monitoring",
) -> None:
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO snipers
               (telegram_user_id, wallet_id, contract_address, buy_amount_sol, slippage_percent,
                priority_fee, status, attempts)
               VALUES ($1,$2,$3,$4,$5,$6::priority_fee,$7::sniper_status,1)""",
            telegram_user_id, wallet_id, contract_address,
            f"{buy_amount_sol:.9f}", f"{slippage_percent:.2f}",
            priority_fee, status,
        )


async def update_sniper_status(
    sniper_id: int, status: str, user_id: int | None = None
) -> None:
    if user_id is not None:
        await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        if user_id is None:
            await conn.execute(
                "UPDATE snipers SET status=$1::sniper_status WHERE id=$2",
                status, sniper_id,
            )
        else:
            await conn.execute(
                """UPDATE snipers SET status=$1::sniper_status
                   WHERE id=$2 AND telegram_user_id=$3""",
                status, sniper_id, user_id,
            )


async def get_positions(user_id: int | None = None) -> list[dict[str, Any]]:
    if user_id is not None:
        await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        if user_id is None:
            rows = await conn.fetch("SELECT * FROM positions")
        else:
            rows = await conn.fetch(
                "SELECT * FROM positions WHERE telegram_user_id=$1", user_id
            )
        return [dict(r) for r in rows]


async def get_copy_trades(limit: int = 5, user_id: int | None = None) -> list[dict[str, Any]]:
    if user_id is not None:
        await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        if user_id is None:
            rows = await conn.fetch(
                "SELECT * FROM copy_trades ORDER BY created_at DESC LIMIT $1", limit
            )
        else:
            rows = await conn.fetch(
                """SELECT * FROM copy_trades WHERE telegram_user_id=$1
                   ORDER BY created_at DESC LIMIT $2""",
                user_id, limit,
            )
        return [dict(r) for r in rows]


async def get_limit_orders(limit: int = 5, user_id: int | None = None) -> list[dict[str, Any]]:
    if user_id is not None:
        await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        if user_id is None:
            rows = await conn.fetch(
                "SELECT * FROM limit_orders ORDER BY created_at DESC LIMIT $1", limit
            )
        else:
            rows = await conn.fetch(
                """SELECT * FROM limit_orders WHERE telegram_user_id=$1
                   ORDER BY created_at DESC LIMIT $2""",
                user_id, limit,
            )
        return [dict(r) for r in rows]


async def get_user_transactions(user_id: int, limit: int = 8) -> list[dict[str, Any]]:
    await ensure_bot_user(user_id)
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """SELECT transaction_type AS type, amount_sol, tx_hash,
                      description, created_at
               FROM bot_transactions
               WHERE telegram_user_id=$1
               ORDER BY created_at DESC LIMIT $2""",
            user_id, limit,
        )
        return [dict(r) for r in rows]


async def count_table(table: str) -> int:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(f"SELECT COUNT(*) AS n FROM {table}")
        return int(row["n"]) if row else 0
