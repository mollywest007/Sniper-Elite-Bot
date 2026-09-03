import asyncio
import httpx
from .logger import logger

SOLANA_RPC = "https://api.mainnet-beta.solana.com"
LAMPORTS_PER_SOL = 1_000_000_000
_client: httpx.AsyncClient | None = None


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


async def fetch_sol_balance(address: str) -> float | None:
    """Fetch the real SOL balance of a wallet from Solana mainnet RPC.
    Returns balance in SOL, or None if the request failed.
    """
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getBalance",
        "params": [address, {"commitment": "confirmed"}],
    }
    try:
        resp = await _http_client().post(SOLANA_RPC, json=payload)
        if resp.status_code != 200:
            logger.warning("Solana RPC returned %s for %s", resp.status_code, address)
            return None
        data = resp.json()
        lamports = data.get("result", {}).get("value")
        if lamports is None:
            logger.warning("Solana RPC missing value for %s: %s", address, data)
            return None
        return lamports / LAMPORTS_PER_SOL
    except Exception as exc:
        logger.error("Solana RPC error for %s: %s", address, exc)
        return None


async def fetch_deposit(
    signature: str, destination_address: str
) -> float | None:
    """Return the SOL received by the shared wallet in a confirmed transaction."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [
            signature,
            {
                "encoding": "jsonParsed",
                "commitment": "confirmed",
                "maxSupportedTransactionVersion": 0,
            },
        ],
    }
    short_signature = f"{signature[:8]}...{signature[-8:]}"
    for attempt in range(3):
        try:
            resp = await _http_client().post(SOLANA_RPC, json=payload)
            if resp.status_code != 200:
                logger.warning(
                    "Deposit lookup returned HTTP %s for %s",
                    resp.status_code,
                    short_signature,
                )
            else:
                data = resp.json()
                if data.get("error"):
                    error = data["error"]
                    logger.warning(
                        "Deposit lookup RPC error for %s: %s",
                        short_signature,
                        error.get("message", "unknown RPC error"),
                    )
                else:
                    result = data.get("result")
                    if not result:
                        logger.info(
                            "Deposit transaction %s is not visible yet (attempt %d)",
                            short_signature,
                            attempt + 1,
                        )
                    elif result.get("meta", {}).get("err") is not None:
                        logger.info(
                            "Deposit transaction %s failed on-chain",
                            short_signature,
                        )
                        return None
                    else:
                        signatures = result.get("transaction", {}).get("signatures", [])
                        if signature not in signatures:
                            logger.warning(
                                "Deposit response did not match requested signature %s",
                                short_signature,
                            )
                            return None
                        account_keys = result.get("transaction", {}).get(
                            "message", {}
                        ).get("accountKeys", [])
                        destination_index = next(
                            (
                                index
                                for index, account in enumerate(account_keys)
                                if (
                                    account.get("pubkey")
                                    if isinstance(account, dict)
                                    else account
                                )
                                == destination_address
                            ),
                            None,
                        )
                        if destination_index is None:
                            logger.info(
                                "Deposit transaction %s did not include the deposit address",
                                short_signature,
                            )
                            return None
                        meta = result.get("meta", {})
                        pre = meta.get("preBalances", [])
                        post = meta.get("postBalances", [])
                        if destination_index >= len(pre) or destination_index >= len(post):
                            logger.warning(
                                "Deposit transaction %s has incomplete balance data",
                                short_signature,
                            )
                            return None
                        lamports = post[destination_index] - pre[destination_index]
                        if lamports <= 0:
                            logger.info(
                                "Deposit transaction %s did not increase the deposit address",
                                short_signature,
                            )
                            return None
                        return lamports / LAMPORTS_PER_SOL
        except Exception as exc:
            logger.error(
                "Solana deposit verification error for %s: %s",
                short_signature,
                exc,
            )
        if attempt < 2:
            await asyncio.sleep(1)
    return None
