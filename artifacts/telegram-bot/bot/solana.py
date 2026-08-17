import json
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


async def fetch_attributed_deposit(
    signature: str, destination_address: str, required_memo: str
) -> float | None:
    """Return the SOL received by the shared wallet for a matching memo.

    A shared receiving address cannot identify the sender by itself. Requiring
    an exact user memo gives the internal ledger an explicit ownership signal.
    """
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
    try:
        resp = await _http_client().post(SOLANA_RPC, json=payload)
        if resp.status_code != 200:
            return None
        data = resp.json()
        result = data.get("result")
        if not result or result.get("meta", {}).get("err") is not None:
            return None
        signatures = result.get("transaction", {}).get("signatures", [])
        if signature not in signatures:
            return None
        if required_memo not in json.dumps(result, separators=(",", ":")):
            return None

        account_keys = result.get("transaction", {}).get("message", {}).get(
            "accountKeys", []
        )
        for index, account in enumerate(account_keys):
            address = account.get("pubkey") if isinstance(account, dict) else account
            if address != destination_address:
                continue
            meta = result.get("meta", {})
            pre = meta.get("preBalances", [])
            post = meta.get("postBalances", [])
            if index >= len(pre) or index >= len(post):
                return None
            lamports = post[index] - pre[index]
            return lamports / LAMPORTS_PER_SOL if lamports > 0 else None
    except Exception as exc:
        logger.error("Solana deposit verification error for %s: %s", signature, exc)
    return None
