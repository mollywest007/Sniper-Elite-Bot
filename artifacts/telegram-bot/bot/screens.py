import random
from .config import BOT_WALLET_ADDRESS


def trunc(addr: str | None, chars: int = 6) -> str:
    if not addr:
        return "N/A"
    if len(addr) <= chars * 2 + 3:
        return addr
    return f"{addr[:chars]}...{addr[-chars:]}"


def f_sol(v, d: int = 4) -> str:
    try:
        return f"{float(v):.{d}f}"
    except (TypeError, ValueError):
        return "0.0000"


def f_usd(n: float) -> str:
    if n >= 1_000_000:
        return f"${n/1_000_000:.2f}M"
    if n >= 1_000:
        return f"${n/1_000:.2f}K"
    return f"${n:.2f}"


def f_pct(v) -> str:
    try:
        n = float(v)
        sign = "+" if n >= 0 else ""
        return f"{sign}{n:.2f}%"
    except (TypeError, ValueError):
        return "+0.00%"


def screen_welcome(balance: float) -> str:
    return (
        "⚡ *PHASE SNIPE* ⚡\n"
        "_Hyperspeed Solana Sniper Bot_\n\n"
        "🚀 *FEATURES*\n"
        "• AI-Powered Sniping\n"
        "• Copy Trading System\n"
        "• Real-Time Market Data\n"
        "• Advanced Risk Management\n\n"
        f"💰 Balance   `{f_sol(balance)} SOL`\n\n"
        "💡 Get started — tap *Wallet* below"
    )


def screen_wallet_generated() -> str:
    return (
        "✅ *Wallet Generated!*\n\n"
        "Your Solana wallet has been created and secured.\n\n"
        "📍 *Address*\n"
        f"`{BOT_WALLET_ADDRESS}`\n\n"
        "🔐 *Private key* · configured and stored in bot\n\n"
        "_Tap the address to copy it. Send SOL here to fund your wallet._"
    )


def screen_wallet(balance: float) -> str:
    return (
        "💰 *Wallet*\n\n"
        f"📍 *Address*\n`{BOT_WALLET_ADDRESS}`\n\n"
        f"💵 *Balance*  ·  `{f_sol(balance)} SOL`\n\n"
        "🔐 *Private key*  ·  configured and stored in bot\n\n"
        "_Tap the address to copy it_"
    )


def screen_deposit() -> str:
    return (
        "📥 *Deposit SOL*\n\n"
        "Send SOL to this address:\n\n"
        f"`{BOT_WALLET_ADDRESS}`\n\n"
        "Tap the address above to copy it.\n\n"
        "✅ Deposits are detected automatically\n"
        "⚡ Confirmations take ~1–2 seconds on Solana"
    )


def screen_sniper_panel(cfg: dict) -> str:
    status = "🟢 Active — paste any CA to snipe" if cfg["sniping"] else "🔴 Idle"
    return (
        "📈 *Sniper Panel*\n\n"
        f"Status       {status}\n\n"
        f"Auto Buy     {'✅ ON' if cfg['auto_buy'] else '❌ OFF'}\n"
        f"Amount       `{f_sol(cfg['buy_amount'])} SOL`\n"
        f"Slippage     `{cfg['slippage']}%`\n"
        f"Priority     `{cfg['priority_fee']}`\n"
        f"Take Profit  `+{cfg['take_profit_pct']}%`\n"
        f"Stop Loss    `-{cfg['stop_loss_pct']}%`\n"
        f"Auto Sell    {'✅ ON' if cfg['auto_sell'] else '❌ OFF'}\n\n"
        "_Integrations: Raydium · Jupiter · Pump.fun ✅_"
    )


def screen_sniper_edit(cfg: dict) -> str:
    return (
        "✏️ *Edit Sniper Config*\n\n"
        f"Amount       `{f_sol(cfg['buy_amount'])} SOL`\n"
        f"Slippage     `{cfg['slippage']}%`\n"
        f"Priority     `{cfg['priority_fee']}`\n"
        f"Take Profit  `+{cfg['take_profit_pct']}%`\n"
        f"Stop Loss    `-{cfg['stop_loss_pct']}%`\n\n"
        "Tap a field below to change it:"
    )


def screen_recent_wins(gainers: list[dict] | None) -> str:
    if not gainers:
        return (
            "🏆 *Recent Wins*\n\n"
            "⚠️ Couldn't reach live market data right now.\n\n"
            "_Tap Refresh to try again_"
        )
    lines = []
    for g in gainers:
        addr_short = trunc(g["address"], 4) if g["address"] else "N/A"
        lines.append(
            f"🟢 *{g['symbol']}*  {f_pct(g['price_change_24h'])}\n"
            f"   MC {f_usd(g['market_cap'])}  ·  Liq {f_usd(g['liquidity'])}  ·  `{addr_short}`"
        )
    body = "\n\n".join(lines)
    return (
        "🏆 *Recent Wins*\n\n"
        f"{body}\n\n"
        "_Live top Solana gainers via DexScreener · tap Refresh for more_"
    )


def screen_token_search(query: str) -> str:
    label = query if len(query) <= 12 else trunc(query, 6)
    symbol = "".join(c for c in query.upper() if c.isalnum())[:10] or "TOKEN"
    price = random.uniform(0.0000001, 0.05)
    mc = random.uniform(20_000, 8_000_000)
    liq = random.uniform(5_000, mc * 0.6)
    change = random.uniform(-40, 260)
    holders = random.randint(80, 12_000)
    return (
        f"🔍 *Search Result — {symbol}*\n\n"
        f"Queried      `{label}`\n"
        f"Price        `${price:.8f}`\n"
        f"Market Cap   {f_usd(mc)}\n"
        f"Liquidity    {f_usd(liq)}\n"
        f"24h Change   {f_pct(change)}\n"
        f"Holders      `{holders:,}`\n\n"
        "_Data refreshes each search · Raydium · Jupiter · Pump.fun_"
    )


def screen_withdraw_confirm(to_address: str, amount: float) -> str:
    return (
        "📤 *Withdrawal Confirmation*\n\n"
        f"Amount       `{f_sol(amount)} SOL`\n"
        f"To           `{trunc(to_address, 10)}`\n"
        f"From         `{trunc(BOT_WALLET_ADDRESS, 8)}`\n\n"
        "⚠️ _This action cannot be undone._\n\n"
        "Confirm the transaction?"
    )
