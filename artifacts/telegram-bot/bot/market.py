import asyncio
import time
import httpx
from .logger import logger

_BOOSTS_URL = "https://api.dexscreener.com/token-boosts/top/v1"
_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens/{}"
_SOL_MINT = "So11111111111111111111111111111111111111112"
_client: httpx.AsyncClient | None = None
_cache: tuple[float, list[dict]] = (0.0, [])
_sol_price_cache: tuple[float, float] = (0.0, 0.0)
_cache_lock = asyncio.Lock()


def _http_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(4.0, connect=1.5),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _client


async def close_http_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


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


async def _fetch_sol_usd_price(client: httpx.AsyncClient) -> float | None:
    global _sol_price_cache
    now = time.monotonic()
    if now - _sol_price_cache[0] < 30:
        return _sol_price_cache[1] or None
    pair = await _fetch_best_pair(client, _SOL_MINT)
    try:
        price = float(pair.get("priceUsd")) if pair else 0.0
    except (TypeError, ValueError):
        price = 0.0
    _sol_price_cache = (time.monotonic(), price)
    return price or None


async def fetch_token_market(address: str) -> dict | None:
    """Return a live SOL-denominated quote for a Solana token."""
    client = _http_client()
    pair = await _fetch_best_pair(client, address)
    if not pair:
        return None

    try:
        price_usd = float(pair.get("priceUsd") or 0)
    except (TypeError, ValueError):
        price_usd = 0.0

    quote_symbol = str((pair.get("quoteToken") or {}).get("symbol") or "").upper()
    try:
        price_sol = (
            float(pair.get("priceNative") or 0)
            if quote_symbol in {"SOL", "WSOL"}
            else price_usd / (await _fetch_sol_usd_price(client) or 0)
        )
    except (TypeError, ValueError, ZeroDivisionError):
        price_sol = 0.0

    if price_sol <= 0:
        logger.debug("No usable SOL price for token %s", address)
        return None

    base = pair.get("baseToken") or {}
    return {
        "symbol": base.get("symbol") or "TOKEN",
        "name": base.get("name") or "Unknown",
        "address": base.get("address") or address,
        "price_sol": price_sol,
        "price_usd": price_usd,
        "market_cap": float(pair.get("marketCap") or pair.get("fdv") or 0),
        "liquidity": float((pair.get("liquidity") or {}).get("usd") or 0),
    }


async def fetch_recent_solana_gainers(limit: int = 5) -> list[dict]:
    """Fetch real, currently-trending Solana tokens with positive 24h price moves
    from DexScreener's public API. Returns a list of dicts with symbol, address,
    price_change_24h, market_cap, liquidity, price_usd — sorted by biggest gain.

    Returns an empty list if live data can't be fetched; callers must show that
    explicitly rather than falling back to fake numbers.
    """
    global _cache
    now = time.monotonic()
    if now - _cache[0] < 30:
        return _cache[1][:limit]

    async with _cache_lock:
        now = time.monotonic()
        if now - _cache[0] < 30:
            return _cache[1][:limit]

        try:
            client = _http_client()
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
            addrs = list(dict.fromkeys(addrs))[:10]
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
    _cache = (time.monotonic(), gainers)
    return gainers[:limit]
