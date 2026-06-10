import httpx
from .logger import logger

SOLANA_RPC = "https://api.mainnet-beta.solana.com"
LAMPORTS_PER_SOL = 1_000_000_000


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
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(SOLANA_RPC, json=payload)
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
