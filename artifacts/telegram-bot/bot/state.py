import time
from typing import Any

registered_users: set[int] = set()
alert_subscribers: set[int] = set()
wallet_generated: set[int] = set()
snipe_mode_active: set[int] = set()
pumpfun_monitor_active: set[int] = set()

sniper_configs: dict[int, dict[str, Any]] = {}
pending_flows: dict[int, dict[str, Any]] = {}
cooldowns: dict[int, float] = {}

# wallet address each user wants to track for alerts (set via bot message)
tracked_wallet_address: dict[int, str] = {}
# last known SOL balance per tracked address
last_known_tracked_balance: dict[str, float] = {}

last_known_balance: dict[str, float] = {"sol": 0.0}
last_seen_pumpfun_mint: dict[str, str] = {"mint": ""}


def is_rate_limited(user_id: int, cooldown_ms: int = 800) -> bool:
    now = time.time() * 1000
    last = cooldowns.get(user_id, 0.0)
    if now - last < cooldown_ms:
        return True
    cooldowns[user_id] = now
    return False


def get_sniper_config(user_id: int) -> dict[str, Any]:
    if user_id not in sniper_configs:
        sniper_configs[user_id] = {
            "auto_buy": True,
            "buy_amount": 0.1,
            "slippage": 10,
            "priority_fee": "auto",
            "take_profit_pct": 50,
            "stop_loss_pct": 20,
            "auto_sell": False,
            "sniping": False,
        }
    return sniper_configs[user_id]
