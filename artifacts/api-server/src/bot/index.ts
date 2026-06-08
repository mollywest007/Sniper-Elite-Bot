import { Bot, InlineKeyboard, Context } from "grammy";
import { db } from "@workspace/db";
import {
  walletsTable,
  positionsTable,
  snipersTable,
  copyTradesTable,
  limitOrdersTable,
  dcaSetupsTable,
  settingsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const token = process.env["TELEGRAM_BOT_TOKEN"];
export const bot = token ? new Bot(token) : (null as unknown as Bot<Context>);

// ─── helpers ─────────────────────────────────────────────────────────────────
function fSol(v: string | number | null | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return n.toFixed(4);
}
function fUsd(v: string | number | null | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fPct(v: string | number | null | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}
function trunc(addr: string | null | undefined, chars = 4) {
  if (!addr) return "N/A";
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
function isCA(str: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str) && !str.includes(" ");
}

async function getOrCreateSettings() {
  const [s] = await db.select().from(settingsTable).limit(1);
  if (s) return s;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}
async function getActiveWallet() {
  const [w] = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  return w ?? null;
}

// ─── per-user in-memory state ────────────────────────────────────────────────
// Snipe mode: when ON, any CA the user sends is auto-sniped with their config
const snipeModeEnabled = new Set<number>(); // userId

// Pending text-input flows
type PendingKind =
  | { type: "editSniper"; sniperId: number }
  | { type: "snipeConfigAmount" }
  | { type: "snipeConfigSlip" }
  | { type: "buyCA"; amount: number };

const pendingInput = new Map<number, PendingKind>(); // userId → state

// ─── shared keyboard builders ─────────────────────────────────────────────────
function mainMenu() {
  return new InlineKeyboard()
    .text("💰 Buy", "menu:buy").text("📉 Sell", "menu:sell").row()
    .text("🎯 Snipe", "menu:snipe").text("📊 Portfolio", "menu:portfolio").row()
    .text("👛 Wallets", "menu:wallets").text("📋 Copy Trade", "menu:copytrade").row()
    .text("🎚 Limit Orders", "menu:limitorders").text("🔁 DCA", "menu:dca").row()
    .text("🔔 Logs", "menu:logs").text("⚙️ Settings", "menu:settings");
}

async function sendMain(ctx: Context) {
  const wallet = await getActiveWallet();
  const addrLine = wallet
    ? `👛 \`${trunc(wallet.address, 6)}\`  💰 *${fSol(wallet.balanceSol)} SOL*`
    : "👛 No active wallet";
  const text =
    `🎯 *PHASE SNIPE*\n━━━━━━━━━━━━━━━━━━━━\n${addrLine}\n━━━━━━━━━━━━━━━━━━━━\n\nSelect a module:`;
  try {
    if (ctx.callbackQuery) await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: mainMenu() });
    else await ctx.reply(text, { parse_mode: "Markdown", reply_markup: mainMenu() });
  } catch {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: mainMenu() });
  }
}

// ─── snipe menu builder (reused in callbacks) ─────────────────────────────────
async function buildSnipeMenu(userId: number | undefined) {
  const s = await getOrCreateSettings();
  const snipers = await db.select().from(snipersTable).orderBy(desc(snipersTable.createdAt)).limit(6);
  const modeOn = userId ? snipeModeEnabled.has(userId) : false;

  let text =
    `🎯 *Snipe Mode*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Status: ${modeOn ? "🟢 *ON — Ready to snipe!*" : "🔴 *OFF*"}\n\n` +
    `⚙️ *Your Snipe Config:*\n` +
    `💰 Buy Amount: *${fSol(s.defaultBuyAmountSol)} SOL*\n` +
    `📊 Slippage: *${s.defaultSlippagePercent}%*\n` +
    `⚡ Priority Fee: *${s.defaultPriorityFee}*\n\n`;

  if (modeOn) {
    text += `📋 *Snipe mode is ON!*\nJust send any contract address and I'll snipe it instantly with your config.\n\nNo extra steps — just paste the CA.\n`;
  } else {
    text += `📋 *How to use:*\n1️⃣ Set your config below\n2️⃣ Tap *Enable Snipe Mode*\n3️⃣ Send any CA to snipe instantly\n`;
  }

  if (snipers.length > 0) {
    text += `\n━━━━━━━━━━━━━━━━━━━━\n*Recent Snipers:*\n`;
    for (const sn of snipers) {
      const icon = sn.status === "monitoring" ? "🟡" : sn.status === "sniped" ? "🟢" : sn.status === "failed" ? "🔴" : "⬜";
      text += `${icon} ${sn.tokenSymbol ?? "Token"} · ${fSol(sn.buyAmountSol)} SOL · ${sn.status}\n`;
    }
  }

  const kb = new InlineKeyboard();

  // Toggle button
  if (modeOn) {
    kb.text("🔴 Disable Snipe Mode", "snipe:modeoff").row();
  } else {
    kb.text("🟢 Enable Snipe Mode", "snipe:modeon").row();
  }

  // Config edit buttons (always visible)
  kb.text(`💰 Amount: ${fSol(s.defaultBuyAmountSol)} SOL`, "snipeconfig:amount")
    .text(`📊 Slip: ${s.defaultSlippagePercent}%`, "snipeconfig:slip").row();
  kb.text(`⚡ Fee: ${s.defaultPriorityFee} → auto`, "snipeconfig:fee:auto")
    .text(`⚡ Fee: low`, "snipeconfig:fee:low").row();
  kb.text(`⚡ Fee: medium`, "snipeconfig:fee:medium")
    .text(`⚡ Fee: high`, "snipeconfig:fee:high").row();

  // Active sniper controls
  for (const sn of snipers) {
    if (sn.status === "monitoring") {
      kb.text(`⏹ Stop ${sn.tokenSymbol ?? "#" + sn.id}`, `snipe:stop:${sn.id}`)
        .text(`✏️ Edit #${sn.id}`, `snipe:edit:${sn.id}`).row();
    } else if (sn.status === "idle" || sn.status === "stopped" || sn.status === "failed") {
      kb.text(`▶ Start ${sn.tokenSymbol ?? "#" + sn.id}`, `snipe:start:${sn.id}`)
        .text(`✏️ Edit #${sn.id}`, `snipe:edit:${sn.id}`).row();
    }
  }

  kb.text("← Back", "menu:home");
  return { text, kb };
}

// ─── register handlers only when token is present ────────────────────────────
if (token && bot) {

bot.command("start", sendMain);
bot.command("menu", sendMain);

// ─── single callback router ───────────────────────────────────────────────────
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from?.id;
  await ctx.answerCallbackQuery();

  // ── Home ──────────────────────────────────────────────────────────────────
  if (data === "menu:home") return sendMain(ctx);

  // ── BUY ──────────────────────────────────────────────────────────────────
  if (data === "menu:buy") {
    const s = await getOrCreateSettings();
    return ctx.editMessageText(
      `💰 *Buy Token*\n━━━━━━━━━━━━━━━━━━━━\n` +
      `Default: *${fSol(s.defaultBuyAmountSol)} SOL* · Slip: *${s.defaultSlippagePercent}%*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*How to buy:*\n` +
      `Simply paste any token contract address in the chat.\n\n` +
      `Or pick a quick amount first, then paste the CA:`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("0.1 SOL", "quickbuy:0.1").text("0.5 SOL", "quickbuy:0.5")
          .text("1 SOL", "quickbuy:1.0").text("2 SOL", "quickbuy:2.0").row()
          .text("← Back", "menu:home"),
      }
    );
  }

  if (data.startsWith("quickbuy:")) {
    const amt = parseFloat(data.split(":")[1]);
    if (userId) pendingInput.set(userId, { type: "buyCA", amount: amt });
    return ctx.editMessageText(
      `💰 *Quick Buy — ${amt} SOL*\n━━━━━━━━━━━━━━━━━━━━\n\nNow send the contract address:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "menu:buy") }
    );
  }

  if (data.startsWith("autobuy:")) {
    const parts = data.split(":");
    const addr = parts[1];
    const amount = parseFloat(parts[2]);
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.editMessageText("❌ No active wallet. Go to 👛 Wallets first.");
    await db.insert(positionsTable).values({
      walletId: wallet.id, tokenSymbol: "TOKEN", tokenName: "Unknown Token",
      contractAddress: addr, amountTokens: String(Math.floor(Math.random() * 1_000_000)),
      valueSol: String(amount), entryPriceSol: String(amount / 1_000_000),
      currentPriceSol: String(amount / 1_000_000), pnlPercent: "0", pnlSol: "0",
      marketCapUsd: String(Math.random() * 1_000_000), liquidityUsd: String(Math.random() * 100_000),
    });
    return ctx.editMessageText(
      `✅ *Buy Executed!*\n━━━━━━━━━━━━━━━━━━━━\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL*\nWallet: *${wallet.name}*\n\n_Transaction processing..._`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") }
    );
  }

  // ── SELL ─────────────────────────────────────────────────────────────────
  if (data === "menu:sell") {
    const positions = await db.select().from(positionsTable).limit(10);
    if (positions.length === 0) {
      return ctx.editMessageText(
        `📉 *Sell*\n━━━━━━━━━━━━━━━━━━━━\n\nNo open positions. Buy tokens first.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("💰 Buy", "menu:buy").row().text("← Back", "menu:home") }
      );
    }
    const kb = new InlineKeyboard();
    for (const p of positions) {
      const pnl = parseFloat(String(p.pnlPercent));
      kb.text(`${pnl >= 0 ? "🟢" : "🔴"} ${p.tokenSymbol} ${fPct(pnl)} · ${fSol(p.valueSol)} SOL`, `sell:${p.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(`📉 *Sell Position*\n━━━━━━━━━━━━━━━━━━━━\n\nSelect a position:`, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("sell:") && !data.startsWith("sellexec:")) {
    const id = parseInt(data.split(":")[1]);
    const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.id, id));
    if (!pos) return ctx.editMessageText("❌ Position not found.", { reply_markup: new InlineKeyboard().text("← Back", "menu:sell") });
    const pnl = parseFloat(String(pos.pnlPercent));
    const kb = new InlineKeyboard()
      .text("25%", `sellexec:${pos.id}:25`).text("50%", `sellexec:${pos.id}:50`)
      .text("75%", `sellexec:${pos.id}:75`).text("100%", `sellexec:${pos.id}:100`).row()
      .text("← Back", "menu:sell");
    return ctx.editMessageText(
      `📉 *${pos.tokenSymbol}*\n━━━━━━━━━━━━━━━━━━━━\nCA: \`${trunc(pos.contractAddress, 6)}\`\nValue: *${fSol(pos.valueSol)} SOL*\nPnL: *${fPct(pnl)}* ${pnl >= 0 ? "🟢" : "🔴"}\n\nHow much to sell?`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }

  if (data.startsWith("sellexec:")) {
    const [, idStr, pctStr] = data.split(":");
    const id = parseInt(idStr); const pct = parseInt(pctStr);
    const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.id, id));
    if (!pos) return ctx.editMessageText("❌ Position not found.");
    const solOut = (parseFloat(String(pos.valueSol)) * pct / 100).toFixed(4);
    if (pct === 100) await db.delete(positionsTable).where(eq(positionsTable.id, id));
    else {
      const rem = parseFloat(String(pos.amountTokens)) * (1 - pct / 100);
      const remVal = parseFloat(String(pos.valueSol)) * (1 - pct / 100);
      await db.update(positionsTable).set({ amountTokens: rem.toFixed(9), valueSol: remVal.toFixed(9) }).where(eq(positionsTable.id, id));
    }
    return ctx.editMessageText(
      `✅ *Sell Executed!*\n━━━━━━━━━━━━━━━━━━━━\nToken: *${pos.tokenSymbol}*\nSold: *${pct}%*\nReceived: *≈${solOut} SOL*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") }
    );
  }

  // ── PORTFOLIO ────────────────────────────────────────────────────────────
  if (data === "menu:portfolio") {
    const positions = await db.select().from(positionsTable);
    if (positions.length === 0) {
      return ctx.editMessageText(
        `📊 *Portfolio*\n━━━━━━━━━━━━━━━━━━━━\n\nNo open positions.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("💰 Buy", "menu:buy").row().text("← Back", "menu:home") }
      );
    }
    const totalSol = positions.reduce((s, p) => s + parseFloat(String(p.valueSol)), 0);
    let text = `📊 *Portfolio*\n━━━━━━━━━━━━━━━━━━━━\nTotal: *${fSol(totalSol)} SOL*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const p of positions) {
      const pnl = parseFloat(String(p.pnlPercent));
      text += `${pnl >= 0 ? "🟢" : "🔴"} *${p.tokenSymbol}* — ${fSol(p.valueSol)} SOL ${fPct(pnl)}\n\`${trunc(p.contractAddress, 6)}\`\n\n`;
    }
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("📉 Sell", "menu:sell").row().text("← Back", "menu:home"),
    });
  }

  // ── WALLETS ───────────────────────────────────────────────────────────────
  if (data === "menu:wallets") {
    const wallets = await db.select().from(walletsTable);
    if (wallets.length === 0) {
      return ctx.editMessageText(`👛 *Wallets*\n━━━━━━━━━━━━━━━━━━━━\n\nNo wallets. Set one up in the app.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Back", "menu:home") });
    }
    let text = `👛 *Wallets*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const w of wallets) {
      text += `${w.isActive ? "✅" : "⬜"} *${w.name}*  ${fSol(w.balanceSol)} SOL\n\`${trunc(w.address, 8)}\`\n\n`;
    }
    const kb = new InlineKeyboard();
    for (const w of wallets) if (!w.isActive) kb.text(`✅ Activate ${w.name}`, `wallet:activate:${w.id}`).row();
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("wallet:activate:")) {
    const id = parseInt(data.split(":")[2]);
    await db.update(walletsTable).set({ isActive: false });
    const [w] = await db.update(walletsTable).set({ isActive: true }).where(eq(walletsTable.id, id)).returning();
    return ctx.editMessageText(`✅ *${w?.name}* is now active.\n\`${trunc(w?.address, 8)}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Wallets", "menu:wallets").text("🏠 Home", "menu:home") });
  }

  // ── SNIPE MODE ────────────────────────────────────────────────────────────
  if (data === "menu:snipe" || data === "snipe:refresh") {
    const { text, kb } = await buildSnipeMenu(userId);
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
    return;
  }

  if (data === "snipe:modeon") {
    if (userId) snipeModeEnabled.add(userId);
    const s = await getOrCreateSettings();
    const { text, kb } = await buildSnipeMenu(userId);
    await ctx.answerCallbackQuery(`🟢 Snipe Mode ON — send any CA to snipe with ${fSol(s.defaultBuyAmountSol)} SOL`);
    try { await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }); } catch {}
    return;
  }

  if (data === "snipe:modeoff") {
    if (userId) snipeModeEnabled.delete(userId);
    await ctx.answerCallbackQuery("🔴 Snipe Mode OFF");
    const { text, kb } = await buildSnipeMenu(userId);
    try { await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }); } catch {}
    return;
  }

  // ── SNIPE CONFIG — inline fee picker ─────────────────────────────────────
  if (data.startsWith("snipeconfig:fee:")) {
    const fee = data.split(":")[2] as "auto" | "low" | "medium" | "high";
    const s = await getOrCreateSettings();
    await db.update(settingsTable).set({ defaultPriorityFee: fee }).where(eq(settingsTable.id, s.id));
    await ctx.answerCallbackQuery(`⚡ Fee set to ${fee}`);
    const { text, kb } = await buildSnipeMenu(userId);
    try { await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }); } catch {}
    return;
  }

  if (data === "snipeconfig:amount") {
    if (userId) pendingInput.set(userId, { type: "snipeConfigAmount" });
    return ctx.editMessageText(
      `💰 *Set Snipe Buy Amount*\n━━━━━━━━━━━━━━━━━━━━\n\nReply with the SOL amount you want to use per snipe.\n\n*Examples:* \`0.1\` · \`0.5\` · \`1\` · \`2.5\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "menu:snipe") }
    );
  }

  if (data === "snipeconfig:slip") {
    if (userId) pendingInput.set(userId, { type: "snipeConfigSlip" });
    return ctx.editMessageText(
      `📊 *Set Snipe Slippage*\n━━━━━━━━━━━━━━━━━━━━\n\nReply with the slippage % for sniping.\n\nRecommended: \`10\` – \`20\` for new launches.\n\n*Examples:* \`5\` · \`10\` · \`20\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "menu:snipe") }
    );
  }

  // ── SNIPE CONTROLS (start/stop/edit individual snipers) ───────────────────
  if (data.startsWith("snipe:stop:") || data.startsWith("snipe:start:")) {
    const parts = data.split(":");
    const action = parts[1];
    const id = parseInt(parts[2]);
    const newStatus = action === "stop" ? "stopped" : "monitoring";
    const [sn] = await db.update(snipersTable).set({ status: newStatus as any }).where(eq(snipersTable.id, id)).returning();
    await ctx.answerCallbackQuery(`${action === "stop" ? "⏹ Stopped" : "▶ Started"} sniper #${id}`);
    const { text, kb } = await buildSnipeMenu(userId);
    try { await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }); } catch {}
    return;
  }

  if (data.startsWith("snipe:edit:")) {
    const id = parseInt(data.split(":")[2]);
    const [sn] = await db.select().from(snipersTable).where(eq(snipersTable.id, id));
    if (!sn) return ctx.editMessageText("❌ Sniper not found.");
    if (userId) pendingInput.set(userId, { type: "editSniper", sniperId: id });
    return ctx.editMessageText(
      `✏️ *Edit Sniper #${id}*\n━━━━━━━━━━━━━━━━━━━━\nBuy: *${fSol(sn.buyAmountSol)} SOL* · Slip: *${sn.slippagePercent}%* · Fee: *${sn.priorityFee}*\n\n` +
      `Reply with new values:\n\`amount:<sol> slip:<pct> fee:<auto|low|medium|high>\`\n\n` +
      `Example: \`amount:0.5 slip:10 fee:high\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "menu:snipe") }
    );
  }

  // ── COPY TRADE ────────────────────────────────────────────────────────────
  if (data === "menu:copytrade") {
    const cts = await db.select().from(copyTradesTable).orderBy(desc(copyTradesTable.createdAt)).limit(10);
    let text = `📋 *Copy Trade*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (cts.length === 0) {
      text += `No copy trade targets.\n\n📋 *How to add:*\n\`copy <wallet_address> [sol_amount]\`\n\nExample:\n\`copy 9xQeWvG816bUx9EPjH... 0.1\``;
    } else {
      for (const ct of cts) {
        const icon = ct.status === "active" ? "🟢" : ct.status === "paused" ? "🟡" : "⬜";
        text += `${icon} *${ct.targetAlias ?? "Target"}* · ${fSol(ct.amountSol)} SOL · ${ct.tradesCopied} trades\n\`${trunc(ct.targetAddress, 6)}\`\n\n`;
      }
    }
    const kb = new InlineKeyboard();
    for (const ct of cts) {
      if (ct.status === "active") kb.text(`⏸ Pause ${ct.targetAlias ?? ct.id}`, `ct:pause:${ct.id}`).row();
      if (ct.status === "paused") kb.text(`▶ Resume ${ct.targetAlias ?? ct.id}`, `ct:resume:${ct.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("ct:pause:") || data.startsWith("ct:resume:")) {
    const [, action, idStr] = data.split(":");
    const id = parseInt(idStr);
    const newStatus = action === "pause" ? "paused" : "active";
    const [ct] = await db.update(copyTradesTable).set({ status: newStatus as any }).where(eq(copyTradesTable.id, id)).returning();
    await ctx.answerCallbackQuery(`${action === "pause" ? "⏸ Paused" : "▶ Resumed"}`);
    return ctx.editMessageText(`${action === "pause" ? "⏸ Paused" : "▶ Resumed"} copy trade for *${ct?.targetAlias ?? "target"}*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Copy Trade", "menu:copytrade").text("🏠 Home", "menu:home") });
  }

  // ── LIMIT ORDERS ─────────────────────────────────────────────────────────
  if (data === "menu:limitorders") {
    const orders = await db.select().from(limitOrdersTable).orderBy(desc(limitOrdersTable.createdAt)).limit(10);
    let text = `🎚 *Limit Orders*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (orders.length === 0) {
      text += `No limit orders.\n\n📋 *How to add:*\n\`limit <ca> tp:<pct> sl:<pct>\`\n\nExample: \`limit <ca> tp:50 sl:20\``;
    } else {
      for (const o of orders) {
        const icon = o.status === "active" ? "🟡" : o.status === "triggered" ? "🟢" : "⬜";
        text += `${icon} *${o.tokenSymbol}* \`${trunc(o.contractAddress, 6)}\`\n`;
        if (o.takeProfitPercent) text += `   TP: +${o.takeProfitPercent}%`;
        if (o.stopLossPercent) text += `   SL: -${o.stopLossPercent}%`;
        text += `\n\n`;
      }
    }
    const kb = new InlineKeyboard();
    for (const o of orders.filter(o => o.status === "active")) kb.text(`❌ Cancel ${o.tokenSymbol}`, `lo:cancel:${o.id}`).row();
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("lo:cancel:")) {
    const id = parseInt(data.split(":")[2]);
    await db.update(limitOrdersTable).set({ status: "cancelled" }).where(eq(limitOrdersTable.id, id));
    return ctx.editMessageText("✅ Limit order cancelled.", {
      reply_markup: new InlineKeyboard().text("← Limit Orders", "menu:limitorders").text("🏠 Home", "menu:home") });
  }

  // ── DCA ───────────────────────────────────────────────────────────────────
  if (data === "menu:dca") {
    const dcas = await db.select().from(dcaSetupsTable).orderBy(desc(dcaSetupsTable.createdAt)).limit(10);
    let text = `🔁 *DCA*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (dcas.length === 0) {
      text += `No DCA setups.\n\n📋 *How to add:*\n\`dca <ca> <amount_sol> <interval_hours>\`\n\nExample: \`dca <ca> 0.1 24\` (0.1 SOL every 24h)`;
    } else {
      for (const d of dcas) {
        const icon = d.status === "active" ? "🟢" : d.status === "paused" ? "🟡" : "⬜";
        text += `${icon} *${d.tokenSymbol}* · ${fSol(d.amountSol)} SOL / ${d.intervalHours}h · ${d.executionsCount} runs\n\n`;
      }
    }
    const kb = new InlineKeyboard();
    for (const d of dcas) {
      if (d.status === "active") kb.text(`⏸ Pause ${d.tokenSymbol}`, `dca:pause:${d.id}`).row();
      if (d.status === "paused") kb.text(`▶ Resume ${d.tokenSymbol}`, `dca:resume:${d.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("dca:pause:") || data.startsWith("dca:resume:")) {
    const [, action, idStr] = data.split(":");
    const id = parseInt(idStr);
    const [d] = await db.update(dcaSetupsTable).set({ status: (action === "pause" ? "paused" : "active") as any }).where(eq(dcaSetupsTable.id, id)).returning();
    await ctx.answerCallbackQuery(`${action === "pause" ? "⏸ Paused" : "▶ Resumed"}`);
    return ctx.editMessageText(`${action === "pause" ? "⏸ Paused" : "▶ Resumed"} DCA for *${d?.tokenSymbol}*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← DCA", "menu:dca").text("🏠 Home", "menu:home") });
  }

  // ── LOGS ──────────────────────────────────────────────────────────────────
  if (data === "menu:logs") {
    const notifs = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt)).limit(10);
    let text = `🔔 *System Logs*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (notifs.length === 0) text += `No logs yet.`;
    else for (const n of notifs) {
      text += `${n.isRead ? "📩" : "📬"} *${n.title}*\n${n.message}`;
      if (n.amountSol) text += ` · ${fSol(n.amountSol)} SOL`;
      if (n.pnlPercent) text += ` · ${fPct(n.pnlPercent)}`;
      text += `\n_${new Date(n.createdAt).toLocaleString()}_\n\n`;
    }
    await db.update(notificationsTable).set({ isRead: true });
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Back", "menu:home") });
  }

  // ── SETTINGS ─────────────────────────────────────────────────────────────
  if (data === "menu:settings" || data === "settings:refresh") {
    const s = await getOrCreateSettings();
    const text =
      `⚙️ *Settings*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Default Buy: *${fSol(s.defaultBuyAmountSol)} SOL*\n` +
      `📊 Slippage: *${s.defaultSlippagePercent}%*\n` +
      `⚡ Priority Fee: *${s.defaultPriorityFee}*\n\n` +
      `🔔 *Notifications*\n` +
      `Buy: ${s.notifyBuy ? "✅" : "❌"}  Sell: ${s.notifySell ? "✅" : "❌"}  Sniper: ${s.notifySniper ? "✅" : "❌"}  Wallet: ${s.notifyWallet ? "✅" : "❌"}\n\n` +
      `⚡ Auto-Approve TXs: ${s.autoApprove ? "✅ ON" : "❌ OFF"}\n\n` +
      `📝 Change values:\n\`/set buy_amount 0.5\` · \`/set slippage 2\` · \`/set fee high\``;
    const kb = new InlineKeyboard()
      .text(s.notifyBuy ? "🔔 Buy: ON" : "🔔 Buy: OFF", `settings:toggle:notifyBuy:${!s.notifyBuy}`)
      .text(s.notifySell ? "🔔 Sell: ON" : "🔔 Sell: OFF", `settings:toggle:notifySell:${!s.notifySell}`).row()
      .text(s.notifySniper ? "🎯 Sniper: ON" : "🎯 Sniper: OFF", `settings:toggle:notifySniper:${!s.notifySniper}`)
      .text(s.notifyWallet ? "👛 Wallet: ON" : "👛 Wallet: OFF", `settings:toggle:notifyWallet:${!s.notifyWallet}`).row()
      .text(s.autoApprove ? "⚡ Auto-Approve: ON" : "⚡ Auto-Approve: OFF", `settings:toggle:autoApprove:${!s.autoApprove}`).row()
      .text("← Back", "menu:home");
    try { await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }); }
    catch { await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb }); }
    return;
  }

  if (data.startsWith("settings:toggle:")) {
    const parts = data.split(":");
    const field = parts[2];
    const val = parts[3] === "true";
    const allowed = ["notifyBuy", "notifySell", "notifySniper", "notifyWallet", "autoApprove"];
    if (allowed.includes(field)) {
      const s = await getOrCreateSettings();
      await db.update(settingsTable).set({ [field]: val }).where(eq(settingsTable.id, s.id));
    }
    await ctx.answerCallbackQuery(`${field.replace(/([A-Z])/g, " $1")} → ${val ? "ON ✅" : "OFF ❌"}`);
    // re-render
    const s2 = await getOrCreateSettings();
    const text =
      `⚙️ *Settings*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Default Buy: *${fSol(s2.defaultBuyAmountSol)} SOL*\n📊 Slippage: *${s2.defaultSlippagePercent}%*\n⚡ Priority Fee: *${s2.defaultPriorityFee}*\n\n` +
      `🔔 *Notifications*\nBuy: ${s2.notifyBuy ? "✅" : "❌"}  Sell: ${s2.notifySell ? "✅" : "❌"}  Sniper: ${s2.notifySniper ? "✅" : "❌"}  Wallet: ${s2.notifyWallet ? "✅" : "❌"}\n\n` +
      `⚡ Auto-Approve TXs: ${s2.autoApprove ? "✅ ON" : "❌ OFF"}\n\n📝 Change values:\n\`/set buy_amount 0.5\` · \`/set slippage 2\` · \`/set fee high\``;
    const kb = new InlineKeyboard()
      .text(s2.notifyBuy ? "🔔 Buy: ON" : "🔔 Buy: OFF", `settings:toggle:notifyBuy:${!s2.notifyBuy}`)
      .text(s2.notifySell ? "🔔 Sell: ON" : "🔔 Sell: OFF", `settings:toggle:notifySell:${!s2.notifySell}`).row()
      .text(s2.notifySniper ? "🎯 Sniper: ON" : "🎯 Sniper: OFF", `settings:toggle:notifySniper:${!s2.notifySniper}`)
      .text(s2.notifyWallet ? "👛 Wallet: ON" : "👛 Wallet: OFF", `settings:toggle:notifyWallet:${!s2.notifyWallet}`).row()
      .text(s2.autoApprove ? "⚡ Auto-Approve: ON" : "⚡ Auto-Approve: OFF", `settings:toggle:autoApprove:${!s2.autoApprove}`).row()
      .text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }
});

// ─── text / message handler ───────────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  const raw = ctx.message.text.trim();
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const userId = ctx.from?.id;
  const pending = userId ? pendingInput.get(userId) : undefined;

  // ── 1. Pending: edit sniper ──────────────────────────────────────────────
  if (pending?.type === "editSniper") {
    if (userId) pendingInput.delete(userId);
    const sniperId = pending.sniperId;
    const amountMatch = raw.match(/amount:([\d.]+)/i);
    const slipMatch = raw.match(/slip:([\d.]+)/i);
    const feeMatch = raw.match(/fee:(auto|low|medium|high)/i);
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (amountMatch) updateData.buyAmountSol = parseFloat(amountMatch[1]).toString();
    if (slipMatch) updateData.slippagePercent = parseFloat(slipMatch[1]).toString();
    if (feeMatch) updateData.priorityFee = feeMatch[1].toLowerCase();
    if (Object.keys(updateData).length <= 1) {
      return ctx.reply("❌ No valid fields. Use: `amount:0.5 slip:10 fee:high`", { parse_mode: "Markdown" });
    }
    const [sn] = await db.update(snipersTable).set(updateData as any).where(eq(snipersTable.id, sniperId)).returning();
    return ctx.reply(
      `✅ *Sniper #${sniperId} updated!*\nBuy: *${fSol(sn?.buyAmountSol)} SOL* · Slip: *${sn?.slippagePercent}%* · Fee: *${sn?.priorityFee}*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Snipers", "menu:snipe").text("🏠 Home", "menu:home") }
    );
  }

  // ── 2. Pending: snipe config — amount ───────────────────────────────────
  if (pending?.type === "snipeConfigAmount") {
    if (userId) pendingInput.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return ctx.reply("❌ Invalid amount. Enter a number like `0.5`", { parse_mode: "Markdown" });
    const s = await getOrCreateSettings();
    await db.update(settingsTable).set({ defaultBuyAmountSol: n.toString() }).where(eq(settingsTable.id, s.id));
    await ctx.reply(`✅ Snipe amount set to *${fSol(n)} SOL*`, { parse_mode: "Markdown" });
    const { text, kb } = await buildSnipeMenu(userId);
    return ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  // ── 3. Pending: snipe config — slippage ─────────────────────────────────
  if (pending?.type === "snipeConfigSlip") {
    if (userId) pendingInput.delete(userId);
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0 || n > 100) return ctx.reply("❌ Invalid slippage. Enter a number between 1 and 100.", { parse_mode: "Markdown" });
    const s = await getOrCreateSettings();
    await db.update(settingsTable).set({ defaultSlippagePercent: n.toString() }).where(eq(settingsTable.id, s.id));
    await ctx.reply(`✅ Slippage set to *${n}%*`, { parse_mode: "Markdown" });
    const { text, kb } = await buildSnipeMenu(userId);
    return ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  // ── 4. Pending: quick buy — awaiting CA ──────────────────────────────────
  if (pending?.type === "buyCA") {
    if (userId) pendingInput.delete(userId);
    const addr = raw;
    if (!isCA(addr)) return ctx.reply("❌ That doesn't look like a valid contract address. Try again.");
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const amount = pending.amount;
    await db.insert(positionsTable).values({
      walletId: wallet.id, tokenSymbol: "TOKEN", tokenName: "Unknown",
      contractAddress: addr, amountTokens: String(Math.floor(Math.random() * 1_000_000)),
      valueSol: String(amount), entryPriceSol: String(amount / 1_000_000),
      currentPriceSol: String(amount / 1_000_000), pnlPercent: "0", pnlSol: "0",
      marketCapUsd: String(Math.random() * 1_000_000), liquidityUsd: String(Math.random() * 100_000),
    });
    return ctx.reply(
      `✅ *Buy Submitted!*\n\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL*\n_Processing..._`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") }
    );
  }

  // ── 5. CA paste — SNIPE MODE takes priority ───────────────────────────────
  if (isCA(raw)) {
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet. Go to 👛 Wallets first.");

    // Snipe mode ON → auto-snipe immediately, no prompts
    if (userId && snipeModeEnabled.has(userId)) {
      const s = await getOrCreateSettings();
      const [sn] = await db.insert(snipersTable).values({
        walletId: wallet.id,
        contractAddress: raw,
        buyAmountSol: String(s.defaultBuyAmountSol),
        slippagePercent: String(s.defaultSlippagePercent),
        priorityFee: (s.defaultPriorityFee as any),
        status: "monitoring",
        attempts: 0,
      }).returning();
      return ctx.reply(
        `🔫 *Sniping!*\n━━━━━━━━━━━━━━━━━━━━\nCA: \`${trunc(raw, 8)}\`\nAmount: *${fSol(s.defaultBuyAmountSol)} SOL*\nSlippage: *${s.defaultSlippagePercent}%*\nFee: *${s.defaultPriorityFee}*\nStatus: *🟡 Monitoring for liquidity...*\n\nSniper #${sn.id} is live.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎯 View Snipers", "menu:snipe").text("⏹ Stop #" + sn.id, `snipe:stop:${sn.id}`).row().text("🏠 Home", "menu:home") }
      );
    }

    // Snipe mode OFF → offer buy or snipe options
    const s = await getOrCreateSettings();
    return ctx.reply(
      `🔍 *Token Detected*\n━━━━━━━━━━━━━━━━━━━━\nCA: \`${raw}\`\n\nWhat do you want to do?`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("💰 Buy 0.1 SOL", `autobuy:${raw}:0.1`).text("💰 Buy 0.5 SOL", `autobuy:${raw}:0.5`).row()
          .text("💰 Buy 1 SOL", `autobuy:${raw}:1.0`).text(`💰 Buy ${fSol(s.defaultBuyAmountSol)} SOL (default)`, `autobuy:${raw}:${s.defaultBuyAmountSol}`).row()
          .text("🔫 Snipe this CA", `snipe:instant:${raw}`).row()
          .text("❌ Cancel", "menu:home"),
      }
    );
  }

  // ── 6. Snipe instant from CA prompt ──────────────────────────────────────
  // (handled in callback below — but just in case)

  // ── 7. /set command ──────────────────────────────────────────────────────
  if (cmd === "/set") {
    const key = parts[1]?.toLowerCase();
    const val = parts[2];
    if (!key || !val) return ctx.reply(`⚙️ *Usage:*\n\`/set buy_amount 0.5\`\n\`/set slippage 10\`\n\`/set fee auto|low|medium|high\``, { parse_mode: "Markdown" });
    const s = await getOrCreateSettings();
    const updates: Record<string, unknown> = {};
    if (key === "buy_amount") updates.defaultBuyAmountSol = parseFloat(val).toString();
    else if (key === "slippage") updates.defaultSlippagePercent = parseFloat(val).toString();
    else if (key === "fee" && ["auto", "low", "medium", "high"].includes(val)) updates.defaultPriorityFee = val;
    else return ctx.reply("❌ Valid keys: `buy_amount`, `slippage`, `fee`", { parse_mode: "Markdown" });
    await db.update(settingsTable).set(updates).where(eq(settingsTable.id, s.id));
    return ctx.reply(`✅ *${key}* → \`${val}\``, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("⚙️ Settings", "menu:settings").text("🏠 Home", "menu:home") });
  }

  // ── 8. buy command ───────────────────────────────────────────────────────
  if (cmd === "buy") {
    const addr = parts[1];
    if (!addr || !isCA(addr)) return ctx.reply(`💰 *Buy:*\n\`buy <contract_address> [sol_amount]\`\n\nOr just paste a CA directly.`, { parse_mode: "Markdown" });
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const s = await getOrCreateSettings();
    const amount = parseFloat(parts[2] ?? String(s.defaultBuyAmountSol));
    await db.insert(positionsTable).values({
      walletId: wallet.id, tokenSymbol: "TOKEN", tokenName: "Unknown",
      contractAddress: addr, amountTokens: String(Math.floor(Math.random() * 1_000_000)),
      valueSol: String(amount), entryPriceSol: String(amount / 1_000_000),
      currentPriceSol: String(amount / 1_000_000), pnlPercent: "0", pnlSol: "0",
      marketCapUsd: String(Math.random() * 1_000_000), liquidityUsd: String(Math.random() * 100_000),
    });
    return ctx.reply(`✅ *Buy Submitted!*\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL*`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") });
  }

  // ── 9. snipe command (manual) ────────────────────────────────────────────
  if (cmd === "snipe") {
    const addr = parts[1];
    if (!addr || !isCA(addr)) return ctx.reply(`🎯 *Snipe:*\n\`snipe <contract_address> [sol_amount]\`\n\nOr enable Snipe Mode and just paste the CA!`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎯 Snipe Menu", "menu:snipe") });
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const s = await getOrCreateSettings();
    const amount = parseFloat(parts[2] ?? String(s.defaultBuyAmountSol));
    const [sn] = await db.insert(snipersTable).values({
      walletId: wallet.id, contractAddress: addr,
      buyAmountSol: String(amount), slippagePercent: String(s.defaultSlippagePercent),
      priorityFee: (s.defaultPriorityFee as any), status: "monitoring", attempts: 0,
    }).returning();
    return ctx.reply(
      `🔫 *Sniping!*\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL* · Slip: *${s.defaultSlippagePercent}%*\nStatus: *🟡 Monitoring...*\nSniper #${sn.id} is live.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎯 View Snipers", "menu:snipe").text("🏠 Home", "menu:home") }
    );
  }

  // ── 10. copy command ─────────────────────────────────────────────────────
  if (cmd === "copy") {
    const addr = parts[1];
    if (!addr) return ctx.reply(`📋 *Copy Trade:*\n\`copy <wallet_address> [sol_amount]\``, { parse_mode: "Markdown" });
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const amount = parseFloat(parts[2] ?? "0.1");
    await db.insert(copyTradesTable).values({ walletId: wallet.id, targetAddress: addr, amountSol: String(amount), mode: "fixed", status: "active" });
    return ctx.reply(`📋 *Copy Trade Active!*\nTarget: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL* per trade`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📋 Copy Trade", "menu:copytrade").text("🏠 Home", "menu:home") });
  }

  // ── 11. limit command ────────────────────────────────────────────────────
  if (cmd === "limit") {
    const addr = parts[1];
    if (!addr) return ctx.reply(`🎚 *Limit Order:*\n\`limit <ca> tp:<pct> sl:<pct>\`\n\nExample: \`limit <ca> tp:50 sl:20\``, { parse_mode: "Markdown" });
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const tpPart = parts.find(p => p.startsWith("tp:")); const slPart = parts.find(p => p.startsWith("sl:"));
    const tp = tpPart ? parseFloat(tpPart.split(":")[1]) : null;
    const sl = slPart ? parseFloat(slPart.split(":")[1]) : null;
    if (!tp && !sl) return ctx.reply("❌ Provide tp:<pct> or sl:<pct>", { parse_mode: "Markdown" });
    await db.insert(limitOrdersTable).values({ walletId: wallet.id, tokenSymbol: "TOKEN", contractAddress: addr, takeProfitPercent: tp?.toString() ?? null, stopLossPercent: sl?.toString() ?? null, status: "active" });
    return ctx.reply(`🎚 *Limit Order Set!*\nCA: \`${trunc(addr, 8)}\`\n${tp ? `TP: +${tp}%\n` : ""}${sl ? `SL: -${sl}%\n` : ""}Status: Watching`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎚 Limit Orders", "menu:limitorders").text("🏠 Home", "menu:home") });
  }

  // ── 12. dca command ──────────────────────────────────────────────────────
  if (cmd === "dca") {
    const addr = parts[1]; const amount = parseFloat(parts[2] ?? "0.1"); const hours = parseFloat(parts[3] ?? "24");
    if (!addr) return ctx.reply(`🔁 *DCA:*\n\`dca <ca> <sol_amount> <interval_hours>\`\n\nExample: \`dca <ca> 0.1 24\``, { parse_mode: "Markdown" });
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    await db.insert(dcaSetupsTable).values({ walletId: wallet.id, tokenSymbol: "TOKEN", contractAddress: addr, amountSol: String(amount), intervalHours: String(hours), status: "active" });
    return ctx.reply(`🔁 *DCA Started!*\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL* every *${hours}h*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔁 DCA", "menu:dca").text("🏠 Home", "menu:home") });
  }

  // ── 13. Handle "snipe:instant" callback from text chain ──────────────────
  // (This is handled via callback_query, not here)

  // ── 14. Fallback help ─────────────────────────────────────────────────────
  return ctx.reply(
    `ℹ️ *Commands*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 *Quickest way to snipe:*\n1. Tap 🎯 Snipe → Enable Snipe Mode\n2. Paste any CA — bot snipes instantly!\n\n` +
    `*Other commands:*\n\`buy <ca> [sol]\` — Buy a token\n\`snipe <ca> [sol]\` — Manual snipe\n\`copy <wallet> [sol]\` — Copy trade\n\`limit <ca> tp:<pct> sl:<pct>\` — Limit order\n\`dca <ca> <sol> <hours>\` — DCA\n\`/set buy_amount|slippage|fee <val>\` — Settings`,
    { parse_mode: "Markdown", reply_markup: mainMenu() }
  );
});

// ── "Snipe this CA" from the CA-detected prompt ───────────────────────────────
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("snipe:instant:")) return;
  await ctx.answerCallbackQuery();
  const addr = data.replace("snipe:instant:", "");
  const userId = ctx.from?.id;
  const wallet = await getActiveWallet();
  if (!wallet) return ctx.editMessageText("❌ No active wallet.");
  const s = await getOrCreateSettings();
  const [sn] = await db.insert(snipersTable).values({
    walletId: wallet.id, contractAddress: addr,
    buyAmountSol: String(s.defaultBuyAmountSol), slippagePercent: String(s.defaultSlippagePercent),
    priorityFee: (s.defaultPriorityFee as any), status: "monitoring", attempts: 0,
  }).returning();
  return ctx.editMessageText(
    `🔫 *Sniping!*\n━━━━━━━━━━━━━━━━━━━━\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(s.defaultBuyAmountSol)} SOL*\nSlippage: *${s.defaultSlippagePercent}%*\nFee: *${s.defaultPriorityFee}*\nStatus: *🟡 Monitoring...*\nSniper #${sn.id} is live.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎯 View Snipers", "menu:snipe").text("⏹ Stop", `snipe:stop:${sn.id}`).row().text("🏠 Home", "menu:home") }
  );
});

bot.catch((err) => {
  logger.error({ err: err.error, update: err.ctx.update }, "Bot error");
});

} // end if (token && bot)

export async function startBot() {
  if (!token || !bot) { logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled"); return; }
  logger.info("Telegram bot initializing...");
  bot.start({ drop_pending_updates: true }).catch((err) => { logger.error({ err }, "Bot crashed"); });
  const me = await bot.api.getMe();
  logger.info({ username: me.username }, "Telegram bot started");
}
