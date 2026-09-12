import asyncio
import time
import httpx
from .logger import logger

_BOOSTS_URL = "https://api.dexscreener.com/token-boosts/top/v1"
_LATEST_BOOSTS_URL = "https://api.dexscreener.com/token-boosts/latest/v1"
_LATEST_PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1"
_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens/{}"
_SOL_MINT = "So11111111111111111111111111111111111111112"
_client: httpx.AsyncClient | None = None
_cache: tuple[float, list[dict]] = (0.0, [])
_sol_price_cache: tuple[float, float] = (0.0, 0.0)
_gainers_rotation = 0
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
    address = address.strip()
    try:
        resp = await client.get(_TOKEN_URL.format(address))
        if resp.status_code != 200:
            return None
        data = resp.json()
        pairs = data.get("pairs") or []
        sol_pairs = [p for p in pairs if p.get("chainId") == "solana"]
        if not sol_pairs:
            return None
        matching_base_pairs = [
            p for p in sol_pairs
            if str((p.get("baseToken") or {}).get("address") or "") == address
        ]
        candidates = matching_base_pairs or sol_pairs
        return max(candidates, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0)
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
    price_change = (pair.get("priceChange") or {}).get("h24")
    volume_24h = (pair.get("volume") or {}).get("h24")
    txns_24h = (pair.get("txns") or {}).get("h24") or {}
    return {
        "symbol": base.get("symbol") or "TOKEN",
        "name": base.get("name") or "Unknown",
        "address": base.get("address") or address,
        "price_sol": price_sol,
        "price_usd": price_usd,
        "market_cap": float(pair.get("marketCap") or pair.get("fdv") or 0),
        "fdv": float(pair.get("fdv") or 0),
        "liquidity": float((pair.get("liquidity") or {}).get("usd") or 0),
        "price_change_24h": float(price_change or 0),
        "volume_24h": float(volume_24h or 0),
        "buys_24h": int(txns_24h.get("buys") or 0),
        "sells_24h": int(txns_24h.get("sells") or 0),
        "dex": pair.get("dexId") or "Unknown",
        "pair_address": pair.get("pairAddress") or "",
        "pair_url": pair.get("url") or "",
    }


async def fetch_recent_solana_gainers(
    limit: int = 5, force_refresh: bool = False
) -> list[dict]:
    """Fetch real, currently-trending Solana tokens with positive 24h price moves
    from DexScreener's public API. Returns a list of dicts with symbol, address,
    price_change_24h, market_cap, liquidity, price_usd — sorted by biggest gain.

    Returns an empty list if live data can't be fetched; callers must show that
    explicitly rather than falling back to fake numbers.
    """
    global _cache, _gainers_rotation
    now = time.monotonic()
    if not force_refresh and now - _cache[0] < 30:
        return _cache[1][:limit]

    async with _cache_lock:
        now = time.monotonic()
        if not force_refresh and now - _cache[0] < 30:
            return _cache[1][:limit]

        try:
            client = _http_client()
            responses = await asyncio.gather(
                client.get(_BOOSTS_URL),
                client.get(_LATEST_BOOSTS_URL),
                client.get(_LATEST_PROFILES_URL),
                return_exceptions=True,
            )
            addrs = []
            for response in responses:
                if isinstance(response, Exception) or response.status_code != 200:
                    continue
                try:
                    entries = response.json()
                except ValueError:
                    continue
                if not isinstance(entries, list):
                    continue
                for entry in entries:
                    address = entry.get("tokenAddress")
                    if (
                        entry.get("chainId") == "solana"
                        and address
                        and address not in addrs
                    ):
                        addrs.append(address)
            if not addrs:
                logger.warning("DexScreener returned no Solana token candidates")
                return []
            if force_refresh and len(addrs) > limit:
                window_size = min(max(limit * 4, 20), len(addrs))
                start = (_gainers_rotation * max(limit, 1)) % len(addrs)
                _gainers_rotation += 1
                rotated = addrs[start:] + addrs[:start]
                addrs = rotated[:window_size]
            else:
                addrs = addrs[:max(20, limit * 4)]
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
