import asyncio
import httpx
from .logger import logger

_BOOSTS_URL = "https://api.dexscreener.com/token-boosts/top/v1"
_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens/{}"


async def _fetch_best_pair(client: httpx.AsyncClient, address: str) -> dict | None:
    """Fetch the most liquid Solana trading pair for a token address."""
    try:
        resp = await client.get(_TOKEN_URL.format(address))
        if resp.status_code != 200:
            return None
        data = resp.json()
        pairs = data.get("pairs") or []
        sol_pairs = [p for p in pairs if p.get("chainId") == "solana"]
        if not sol_pairs:
            return None
        return max(sol_pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0)
    except Exception as exc:
        logger.debug("DexScreener token fetch failed for %s: %s", address, exc)
        return None


async def fetch_recent_solana_gainers(limit: int = 5) -> list[dict]:
    """Fetch real, currently-trending Solana tokens with positive 24h price moves
    from DexScreener's public API. Returns a list of dicts with symbol, address,
    price_change_24h, market_cap, liquidity, price_usd — sorted by biggest gain.

    Returns an empty list if live data can't be fetched; callers must show that
    explicitly rather than falling back to fake numbers.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(_BOOSTS_URL)
            if resp.status_code != 200:
                logger.warning("DexScreener boosts returned %s", resp.status_code)
                return []
            boosts = resp.json()
            if not isinstance(boosts, list):
                return []
            addrs = [
                b["tokenAddress"] for b in boosts
                if b.get("chainId") == "solana" and b.get("tokenAddress")
            ]
            addrs = list(dict.fromkeys(addrs))[:20]
            if not addrs:
                return []
            pairs = await asyncio.gather(*[_fetch_best_pair(client, a) for a in addrs])
    except Exception as exc:
        logger.error("DexScreener fetch failed: %s", exc)
        return []

    gainers = []
    for p in pairs:
        if not p:
            continue
        change = (p.get("priceChange") or {}).get("h24")
        if change is None or change <= 0:
            continue
        base = p.get("baseToken") or {}
        gainers.append({
            "symbol": base.get("symbol") or "?",
            "address": base.get("address") or "",
            "price_change_24h": float(change),
            "market_cap": p.get("marketCap") or p.get("fdv") or 0,
            "liquidity": (p.get("liquidity") or {}).get("usd") or 0,
            "price_usd": p.get("priceUsd"),
        })

    gainers.sort(key=lambda g: g["price_change_24h"], reverse=True)
    return gainers[:limit]
