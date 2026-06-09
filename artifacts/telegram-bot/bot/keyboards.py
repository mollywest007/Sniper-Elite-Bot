from telegram import InlineKeyboardMarkup, InlineKeyboardButton
from .state import wallet_generated, alert_subscribers, pumpfun_monitor_active


def btn(text: str, data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text, callback_data=data)


def kb(*rows: list[InlineKeyboardButton]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(list(rows))


def kb_main(user_id: int | None = None) -> InlineKeyboardMarkup:
    rows = []
    if user_id is not None and user_id in wallet_generated:
        rows.append([btn("💰 Wallet Panel", "wallet:panel")])
    else:
        rows.append([btn("🚀 Generate Wallet", "wallet:show")])
    rows += [
        [btn("📥 Deposit", "deposit:show"),      btn("📤 Withdraw", "withdraw:start")],
        [btn("🚨 Alerts", "alerts:menu"),         btn("📈 Sniper Panel", "sniper:panel")],
        [btn("📊 Portfolio", "portfolio"),         btn("🔔 Token Alerts", "token:alerts")],
        [btn("⚙️ Settings", "settings:menu"),     btn("🔒 Security", "security:menu")],
        [btn("👑 Admin Panel", "admin:panel"),     btn("❓ Help", "help:show")],
    ]
    return InlineKeyboardMarkup(rows)


def kb_back(target: str, label: str = "◀ Back") -> InlineKeyboardMarkup:
    return kb([btn(label, target)])


def kb_sniper(cfg: dict) -> InlineKeyboardMarkup:
    return kb(
        [btn(f"💸 Auto Buy: {'✅ ON' if cfg['auto_buy'] else '❌ OFF'}", "sniper:toggle:autoBuy")],
        [
            btn("⏹ Stop Sniping" if cfg["sniping"] else "🚀 Start Sniping",
                "sniper:stop" if cfg["sniping"] else "sniper:start"),
            btn("✏️ Edit Config", "sniper:edit"),
        ],
        [btn("📋 Paste CA to Snipe", "sniper:paste_ca"), btn("📊 My Snipers", "sniper:list")],
        [btn("📋 Copy Trade", "copy:menu"),              btn("🎚 Limit Orders", "limits:menu")],
        [btn("◀ Back", "menu:home")],
    )


def kb_wallet() -> InlineKeyboardMarkup:
    return kb(
        [btn("📥 Deposit", "deposit:show"),  btn("📤 Withdraw", "withdraw:start")],
        [btn("📋 TX History", "wallet:history"), btn("🔄 Refresh", "wallet:refresh")],
        [btn("◀ Main Menu", "menu:home")],
    )


def kb_sniper_edit(cfg: dict) -> InlineKeyboardMarkup:
    f = cfg
    return kb(
        [btn(f"💰 Amount: {f['buy_amount']:.4f} SOL", "sniper:set:amount")],
        [btn(f"📊 Slippage: {f['slippage']}%", "sniper:set:slippage")],
        [btn("⚡ auto", "sniper:fee:auto"),   btn("⚡ low", "sniper:fee:low")],
        [btn("⚡ medium", "sniper:fee:medium"), btn("⚡ high", "sniper:fee:high")],
        [btn(f"🎯 TP: +{f['take_profit_pct']}%", "sniper:set:tp"),
         btn(f"🛑 SL: -{f['stop_loss_pct']}%", "sniper:set:sl")],
        [btn(f"💹 Auto Sell: {'✅ ON' if f['auto_sell'] else '❌ OFF'}", "sniper:toggle:autoSell")],
        [btn("◀ Sniper Panel", "sniper:panel")],
    )


def kb_alerts(user_id: int) -> InlineKeyboardMarkup:
    is_on = user_id in alert_subscribers
    return kb(
        [btn("🔕 Disable Alerts" if is_on else "🔔 Enable Alerts",
             f"alerts:toggle:{'false' if is_on else 'true'}")],
        [btn("💸 Deposit", "alerts:type:deposit"), btn("📤 Withdraw", "alerts:type:withdraw")],
        [btn("🐋 Large TX", "alerts:type:largetx"), btn("🛒 Token Buy", "alerts:type:buy")],
        [btn("💰 Token Sell", "alerts:type:sell")],
        [btn("🔄 Change Wallet", "alerts:set_wallet")],
        [btn("◀ Back", "menu:home")],
    )


def kb_token_alerts(user_id: int) -> InlineKeyboardMarkup:
    pf_active = user_id in pumpfun_monitor_active
    return kb(
        [btn("⏹ Stop Pump.fun Monitor" if pf_active else "🚀 Start Pump.fun Monitor",
             f"pumpfun:toggle:{'false' if pf_active else 'true'}")],
        [btn("◀ Main Menu", "menu:home")],
    )
