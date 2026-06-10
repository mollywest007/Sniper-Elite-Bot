import asyncpg
from typing import Any, Optional
from .config import DATABASE_URL, BOT_WALLET_ADDRESS, BOT_WALLET_PRIVATE_KEY
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
                first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )"""
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


async def get_wallet_balance() -> float:
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


async def get_trades(limit: int = 8) -> list[dict[str, Any]]:
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM trades ORDER BY executed_at DESC LIMIT $1", limit
        )
        return [dict(r) for r in rows]


async def insert_trade(
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
               (wallet_id, type, token_symbol, token_name, contract_address,
                amount_sol, price_sol, tx_hash, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::trade_status)""",
            wallet_id, trade_type, token_symbol, token_name, contract_address,
            f"{amount_sol:.9f}", price_sol, tx_hash, status,
        )


async def get_snipers(limit: int = 8) -> list[dict[str, Any]]:
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM snipers ORDER BY created_at DESC LIMIT $1", limit
        )
        return [dict(r) for r in rows]


async def insert_sniper(
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
               (wallet_id, contract_address, buy_amount_sol, slippage_percent,
                priority_fee, status, attempts)
               VALUES ($1,$2,$3,$4,$5::priority_fee,$6::sniper_status,1)""",
            wallet_id, contract_address,
            f"{buy_amount_sol:.9f}", f"{slippage_percent:.2f}",
            priority_fee, status,
        )


async def update_sniper_status(sniper_id: int, status: str) -> None:
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE snipers SET status=$1::sniper_status WHERE id=$2", status, sniper_id
        )


async def get_positions() -> list[dict[str, Any]]:
    async with pool().acquire() as conn:
        rows = await conn.fetch("SELECT * FROM positions")
        return [dict(r) for r in rows]


async def get_copy_trades(limit: int = 5) -> list[dict[str, Any]]:
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM copy_trades ORDER BY created_at DESC LIMIT $1", limit
        )
        return [dict(r) for r in rows]


async def get_limit_orders(limit: int = 5) -> list[dict[str, Any]]:
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM limit_orders ORDER BY created_at DESC LIMIT $1", limit
        )
        return [dict(r) for r in rows]


async def count_table(table: str) -> int:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(f"SELECT COUNT(*) AS n FROM {table}")
        return int(row["n"]) if row else 0
