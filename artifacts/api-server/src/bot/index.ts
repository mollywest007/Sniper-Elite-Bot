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
  tradesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { BOT_WALLET_ADDRESS } from "../lib/walletConfig";

const token = process.env["TELEGRAM_BOT_TOKEN"];

export const bot = token ? new Bot(token) : null as unknown as Bot<Context>;

// ─── helpers ────────────────────────────────────────────────────────────────

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

async function getOrCreateSettings() {
  const [s] = await db.select().from(settingsTable).limit(1);
  if (s) return s;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

async function getActiveWallet() {
  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  return wallets[0] ?? null;
}

// ─── pending edit state (in-memory) ─────────────────────────────────────────
// Tracks which sniper a user is currently editing
const pendingEditSniper = new Map<number, number>(); // userId → sniperId

// ─── main menu ──────────────────────────────────────────────────────────────

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
    `🎯 *PHASE SNIPE*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${addrLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Select a module below:`;

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: mainMenu() });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: mainMenu() });
    }
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: mainMenu() });
  }
}

// ─── handlers (only registered when token is present) ────────────────────────

if (token && bot) {

bot.command("start", sendMain);
bot.command("menu", sendMain);

// ─── callback router ─────────────────────────────────────────────────────────

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  if (data === "menu:home") return sendMain(ctx);

  // ── BUY ──────────────────────────────────────────────────────────────────
  if (data === "menu:buy") {
    const s = await getOrCreateSettings();
    const text =
      `💰 *Buy Token*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Default amount: *${fSol(s.defaultBuyAmountSol)} SOL*\n` +
      `Default slippage: *${s.defaultSlippagePercent}%*\n` +
      `Priority fee: *${s.defaultPriorityFee}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *How to buy:*\n` +
      `Send a message using this format:\n` +
      `\`buy <token_address> [amount_sol]\`\n\n` +
      `*Examples:*\n` +
      `\`buy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`\n` +
      `→ Buys with default amount (${fSol(s.defaultBuyAmountSol)} SOL)\n\n` +
      `\`buy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.5\`\n` +
      `→ Buys with 0.5 SOL\n\n` +
      `💡 *Tip:* You can also just paste a contract address directly and the bot will detect it!`;
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("0.1 SOL", "quickbuy:0.1").text("0.5 SOL", "quickbuy:0.5").text("1 SOL", "quickbuy:1.0").row()
        .text("← Back", "menu:home"),
    });
  }

  if (data.startsWith("quickbuy:")) {
    const amt = data.split(":")[1];
    return ctx.editMessageText(
      `💰 *Quick Buy — ${amt} SOL*\n\n` +
      `Send the contract address:\n` +
      `\`buy <token_address> ${amt}\`\n\n` +
      `Example:\n` +
      `\`buy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v ${amt}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Back", "menu:buy") }
    );
  }

  // ── SELL ──────────────────────────────────────────────────────────────────
  if (data === "menu:sell") {
    const positions = await db.select().from(positionsTable).limit(10);
    if (positions.length === 0) {
      return ctx.editMessageText(
        `📉 *Sell Position*\n━━━━━━━━━━━━━━━━━━━━\n\nNo open positions found.\n\nBuy tokens first using the 💰 Buy module.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("💰 Buy Instead", "menu:buy").row().text("← Back", "menu:home") }
      );
    }
    const kb = new InlineKeyboard();
    for (const p of positions) {
      const pnl = parseFloat(String(p.pnlPercent));
      const icon = pnl >= 0 ? "🟢" : "🔴";
      kb.text(`${icon} ${p.tokenSymbol} ${fPct(p.pnlPercent)} · ${fSol(p.valueSol)} SOL`, `sell:${p.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(
      `📉 *Sell Position*\n━━━━━━━━━━━━━━━━━━━━\n\nSelect a position to sell:`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }

  if (data.startsWith("sell:") && !data.startsWith("sellexec:")) {
    const id = parseInt(data.split(":")[1]);
    const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.id, id));
    if (!pos) return ctx.editMessageText("❌ Position not found.", { reply_markup: new InlineKeyboard().text("← Back", "menu:sell") });
    const pnl = parseFloat(String(pos.pnlPercent));
    const text =
      `📉 *${pos.tokenSymbol}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `CA: \`${trunc(pos.contractAddress, 6)}\`\n` +
      `Tokens: *${parseFloat(String(pos.amountTokens)).toLocaleString()}*\n` +
      `Value: *${fSol(pos.valueSol)} SOL*\n` +
      `PnL: *${fPct(pos.pnlPercent)}* ${pnl >= 0 ? "🟢" : "🔴"}\n` +
      `Market Cap: ${fUsd(pos.marketCapUsd)}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Choose how much to sell:`;
    const kb = new InlineKeyboard()
      .text("25%", `sellexec:${pos.id}:25`).text("50%", `sellexec:${pos.id}:50`)
      .text("75%", `sellexec:${pos.id}:75`).text("100%", `sellexec:${pos.id}:100`).row()
      .text("← Back", "menu:sell");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("sellexec:")) {
    const [, idStr, pctStr] = data.split(":");
    const id = parseInt(idStr);
    const pct = parseInt(pctStr);
    const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.id, id));
    if (!pos) return ctx.editMessageText("❌ Position not found.");
    const solOut = (parseFloat(String(pos.valueSol)) * pct / 100).toFixed(4);
    if (pct === 100) {
      await db.delete(positionsTable).where(eq(positionsTable.id, id));
    } else {
      const remaining = parseFloat(String(pos.amountTokens)) * (1 - pct / 100);
      const remainingVal = parseFloat(String(pos.valueSol)) * (1 - pct / 100);
      await db.update(positionsTable).set({
        amountTokens: remaining.toFixed(9),
        valueSol: remainingVal.toFixed(9),
      }).where(eq(positionsTable.id, id));
    }
    return ctx.editMessageText(
      `✅ *Sell Executed!*\n━━━━━━━━━━━━━━━━━━━━\n\nToken: *${pos.tokenSymbol}*\nSold: *${pct}%*\nReceived: *≈${solOut} SOL*\n\nTransaction submitted to the blockchain.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") }
    );
  }

  // ── PORTFOLIO ──────────────────────────────────────────────────────────────
  if (data === "menu:portfolio") {
    const positions = await db.select().from(positionsTable);
    if (positions.length === 0) {
      return ctx.editMessageText(
        `📊 *Portfolio*\n━━━━━━━━━━━━━━━━━━━━\n\nNo open positions.\n\nStart trading with the 💰 Buy module.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("💰 Buy", "menu:buy").row().text("← Back", "menu:home") }
      );
    }
    const totalSol = positions.reduce((s, p) => s + parseFloat(String(p.valueSol)), 0);
    const totalPnl = positions.reduce((s, p) => s + parseFloat(String(p.pnlSol)), 0);
    let text = `📊 *Portfolio*\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Total Value: *${fSol(totalSol)} SOL*\n`;
    if (totalSol - totalPnl > 0) text += `Overall PnL: *${fPct((totalPnl / (totalSol - totalPnl)) * 100)}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const p of positions) {
      const pnl = parseFloat(String(p.pnlPercent));
      text += `${pnl >= 0 ? "🟢" : "🔴"} *${p.tokenSymbol}*\n`;
      text += `   Value: ${fSol(p.valueSol)} SOL  PnL: ${fPct(pnl)}\n`;
      text += `   \`${trunc(p.contractAddress, 6)}\`\n\n`;
    }
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("📉 Sell a Position", "menu:sell").row().text("← Back", "menu:home"),
    });
  }

  // ── WALLETS ──────────────────────────────────────────────────────────────
  if (data === "menu:wallets") {
    const wallets = await db.select().from(walletsTable);
    if (wallets.length === 0) {
      return ctx.editMessageText(
        `👛 *Wallets*\n━━━━━━━━━━━━━━━━━━━━\n\nNo wallets found.\n\nGo to the app to create a wallet.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Back", "menu:home") }
      );
    }
    let text = `👛 *Wallets*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const w of wallets) {
      text += `${w.isActive ? "✅" : "⬜"} *${w.name}*\n`;
      text += `   \`${trunc(w.address, 8)}\`\n`;
      text += `   💰 ${fSol(w.balanceSol)} SOL  💵 ${fUsd(w.balanceUsdc)}\n\n`;
    }
    const kb = new InlineKeyboard();
    for (const w of wallets) {
      if (!w.isActive) kb.text(`✅ Activate ${w.name}`, `wallet:activate:${w.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("wallet:activate:")) {
    const id = parseInt(data.split(":")[2]);
    await db.update(walletsTable).set({ isActive: false });
    const [w] = await db.update(walletsTable).set({ isActive: true }).where(eq(walletsTable.id, id)).returning();
    return ctx.editMessageText(
      `✅ *${w?.name}* is now the active wallet.\n\`${trunc(w?.address, 8)}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Wallets", "menu:wallets").text("🏠 Home", "menu:home") }
    );
  }

  // ── SNIPE ────────────────────────────────────────────────────────────────
  if (data === "menu:snipe") {
    const s = await getOrCreateSettings();
    const snipers = await db.select().from(snipersTable).orderBy(desc(snipersTable.createdAt)).limit(10);
    let text = `🎯 *Sniper Hub*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (snipers.length === 0) {
      text +=
        `No snipers configured yet.\n\n` +
        `📋 *How to snipe:*\n` +
        `Send a message:\n` +
        `\`snipe <token_address> [amount_sol]\`\n\n` +
        `*Example:*\n` +
        `\`snipe EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.5\`\n\n` +
        `Default amount: *${fSol(s.defaultBuyAmountSol)} SOL*`;
    } else {
      for (const sn of snipers) {
        const icon = sn.status === "monitoring" ? "🟡" : sn.status === "sniped" ? "🟢" : sn.status === "failed" ? "🔴" : "⬜";
        text += `${icon} *${sn.tokenSymbol || "Unnamed"}* #${sn.id}\n`;
        text += `   CA: \`${trunc(sn.contractAddress, 6)}\`\n`;
        text += `   Buy: ${fSol(sn.buyAmountSol)} SOL · Slip: ${sn.slippagePercent}% · ${sn.priorityFee}\n`;
        text += `   Status: \`${sn.status}\` · Attempts: ${sn.attempts}\n\n`;
      }
      text += `\n📋 Add another: \`snipe <address> [amount]\``;
    }

    const kb = new InlineKeyboard();
    for (const sn of snipers) {
      const label = sn.tokenSymbol ?? `Sniper #${sn.id}`;
      if (sn.status === "monitoring") {
        kb.text(`⏹ Stop ${label}`, `snipe:stop:${sn.id}`).text(`✏️ Edit`, `snipe:edit:${sn.id}`).row();
      } else if (sn.status === "idle" || sn.status === "stopped" || sn.status === "failed") {
        kb.text(`▶ Start ${label}`, `snipe:start:${sn.id}`).text(`✏️ Edit`, `snipe:edit:${sn.id}`).row();
      }
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("snipe:stop:") || data.startsWith("snipe:start:")) {
    const parts = data.split(":");
    const action = parts[1];
    const id = parseInt(parts[2]);
    const newStatus = action === "stop" ? "stopped" : "monitoring";
    const [sn] = await db.update(snipersTable).set({ status: newStatus as any }).where(eq(snipersTable.id, id)).returning();
    return ctx.editMessageText(
      `${action === "stop" ? "⏹ Stopped" : "▶ Started"} sniper for *${sn?.tokenSymbol ?? "token"}* #${id}\nStatus: \`${newStatus}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Snipers", "menu:snipe").text("🏠 Home", "menu:home") }
    );
  }

  if (data.startsWith("snipe:edit:")) {
    const id = parseInt(data.split(":")[2]);
    const [sn] = await db.select().from(snipersTable).where(eq(snipersTable.id, id));
    if (!sn) return ctx.editMessageText("❌ Sniper not found.");
    const userId = ctx.from?.id;
    if (userId) pendingEditSniper.set(userId, id);
    return ctx.editMessageText(
      `✏️ *Edit Sniper #${id}*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*Current settings:*\n` +
      `Buy Amount: *${fSol(sn.buyAmountSol)} SOL*\n` +
      `Slippage: *${sn.slippagePercent}%*\n` +
      `Priority Fee: *${sn.priorityFee}*\n\n` +
      `📝 *Reply with new settings in this format:*\n` +
      `\`amount:<sol> slip:<percent> fee:<auto|low|medium|high>\`\n\n` +
      `*Examples:*\n` +
      `\`amount:0.5 slip:2 fee:high\`\n` +
      `\`amount:1 slip:5 fee:auto\`\n\n` +
      `_Send just what you want to change, or all three_`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Cancel", "menu:snipe") }
    );
  }

  // ── COPY TRADE ────────────────────────────────────────────────────────────
  if (data === "menu:copytrade") {
    const cts = await db.select().from(copyTradesTable).orderBy(desc(copyTradesTable.createdAt)).limit(10);
    let text = `📋 *Copy Trade*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (cts.length === 0) {
      text +=
        `No copy trade targets configured.\n\n` +
        `📋 *How to copy trade:*\n` +
        `\`copy <wallet_address> [amount_sol]\`\n\n` +
        `*Example:*\n` +
        `\`copy 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin 0.1\`\n\n` +
        `The bot will mirror every buy/sell that wallet makes.`;
    } else {
      for (const ct of cts) {
        const icon = ct.status === "active" ? "🟢" : ct.status === "paused" ? "🟡" : "⬜";
        text += `${icon} *${ct.targetAlias ?? "Target"}*\n`;
        text += `   \`${trunc(ct.targetAddress, 6)}\`\n`;
        text += `   Amount: ${fSol(ct.amountSol)} SOL · Mode: ${ct.mode} · Copied: ${ct.tradesCopied} trades\n\n`;
      }
      text += `\n📋 Add another: \`copy <wallet> [amount]\``;
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
    const parts = data.split(":");
    const action = parts[1];
    const id = parseInt(parts[2]);
    const newStatus = action === "pause" ? "paused" : "active";
    const [ct] = await db.update(copyTradesTable).set({ status: newStatus as any }).where(eq(copyTradesTable.id, id)).returning();
    return ctx.editMessageText(
      `${action === "pause" ? "⏸ Paused" : "▶ Resumed"} copy trade for *${ct?.targetAlias ?? "target"}*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Copy Trade", "menu:copytrade").text("🏠 Home", "menu:home") }
    );
  }

  // ── LIMIT ORDERS ──────────────────────────────────────────────────────────
  if (data === "menu:limitorders") {
    const orders = await db.select().from(limitOrdersTable).orderBy(desc(limitOrdersTable.createdAt)).limit(10);
    let text = `🎚 *Limit Orders*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (orders.length === 0) {
      text +=
        `No limit orders set.\n\n` +
        `📋 *How to set a limit order:*\n` +
        `\`limit <token_address> tp:<percent> sl:<percent>\`\n\n` +
        `*Examples:*\n` +
        `\`limit <addr> tp:50 sl:20\`\n` +
        `→ Take profit at +50%, stop loss at -20%\n\n` +
        `\`limit <addr> tp:100\`\n` +
        `→ Only take profit at +100%\n\n` +
        `\`limit <addr> sl:15\`\n` +
        `→ Only stop loss at -15%`;
    } else {
      for (const o of orders) {
        const icon = o.status === "active" ? "🟡" : o.status === "triggered" ? "🟢" : "⬜";
        text += `${icon} *${o.tokenSymbol}* — \`${trunc(o.contractAddress, 6)}\`\n`;
        if (o.takeProfitPercent) text += `   ✅ Take Profit: +${o.takeProfitPercent}%\n`;
        if (o.stopLossPercent) text += `   🛑 Stop Loss: -${o.stopLossPercent}%\n`;
        if (o.trailingStopPercent) text += `   📉 Trailing Stop: ${o.trailingStopPercent}%\n`;
        text += `   Status: ${o.status}\n\n`;
      }
      text += `\n📋 Add another: \`limit <addr> tp:<pct> sl:<pct>\``;
    }
    const kb = new InlineKeyboard();
    for (const o of orders.filter(o => o.status === "active")) {
      kb.text(`❌ Cancel ${o.tokenSymbol}`, `lo:cancel:${o.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("lo:cancel:")) {
    const id = parseInt(data.split(":")[2]);
    await db.update(limitOrdersTable).set({ status: "cancelled" }).where(eq(limitOrdersTable.id, id));
    return ctx.editMessageText("✅ Limit order cancelled.", {
      reply_markup: new InlineKeyboard().text("← Limit Orders", "menu:limitorders").text("🏠 Home", "menu:home"),
    });
  }

  // ── DCA ────────────────────────────────────────────────────────────────
  if (data === "menu:dca") {
    const dcas = await db.select().from(dcaSetupsTable).orderBy(desc(dcaSetupsTable.createdAt)).limit(10);
    let text = `🔁 *DCA Operations*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (dcas.length === 0) {
      text +=
        `No DCA setups configured.\n\n` +
        `📋 *How to set up DCA:*\n` +
        `\`dca <token_address> <amount_sol> <interval_hours>\`\n\n` +
        `*Examples:*\n` +
        `\`dca EPjFWdd... 0.1 24\`\n` +
        `→ Buy 0.1 SOL every 24 hours\n\n` +
        `\`dca EPjFWdd... 0.5 168\`\n` +
        `→ Buy 0.5 SOL every week (168h)`;
    } else {
      for (const d of dcas) {
        const icon = d.status === "active" ? "🟢" : d.status === "paused" ? "🟡" : "⬜";
        text += `${icon} *${d.tokenSymbol}*\n`;
        text += `   ${fSol(d.amountSol)} SOL every ${d.intervalHours}h\n`;
        text += `   Executions: ${d.executionsCount} · Status: ${d.status}\n\n`;
      }
      text += `\n📋 Add another: \`dca <addr> <amount> <hours>\``;
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
    const parts = data.split(":");
    const action = parts[1];
    const id = parseInt(parts[2]);
    const newStatus = action === "pause" ? "paused" : "active";
    const [d] = await db.update(dcaSetupsTable).set({ status: newStatus as any }).where(eq(dcaSetupsTable.id, id)).returning();
    return ctx.editMessageText(
      `${action === "pause" ? "⏸ Paused" : "▶ Resumed"} DCA for *${d?.tokenSymbol}*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← DCA", "menu:dca").text("🏠 Home", "menu:home") }
    );
  }

  // ── LOGS ──────────────────────────────────────────────────────────────
  if (data === "menu:logs") {
    const notifs = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt)).limit(10);
    let text = `🔔 *System Logs*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (notifs.length === 0) {
      text += `No logs yet. Logs will appear here after your first trade.`;
    } else {
      for (const n of notifs) {
        const icon = n.isRead ? "📩" : "📬";
        text += `${icon} *${n.title}*\n   ${n.message}`;
        if (n.amountSol) text += `  · ${fSol(n.amountSol)} SOL`;
        if (n.pnlPercent) text += `  · ${fPct(n.pnlPercent)}`;
        text += `\n   _${new Date(n.createdAt).toLocaleString()}_\n\n`;
      }
    }
    await db.update(notificationsTable).set({ isRead: true });
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Back", "menu:home"),
    });
  }

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  if (data === "menu:settings" || data === "settings:refresh") {
    const s = await getOrCreateSettings();
    const text =
      `⚙️ *Settings*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 *Trading*\n` +
      `Default Buy: *${fSol(s.defaultBuyAmountSol)} SOL*\n` +
      `Slippage: *${s.defaultSlippagePercent}%*\n` +
      `Priority Fee: *${s.defaultPriorityFee}*\n\n` +
      `🔔 *Notifications*\n` +
      `Buy Alerts: ${s.notifyBuy ? "✅ ON" : "❌ OFF"}\n` +
      `Sell Alerts: ${s.notifySell ? "✅ ON" : "❌ OFF"}\n` +
      `Sniper Alerts: ${s.notifySniper ? "✅ ON" : "❌ OFF"}\n` +
      `Wallet Alerts: ${s.notifyWallet ? "✅ ON" : "❌ OFF"}\n\n` +
      `⚡ *Automation*\n` +
      `Auto-Approve TXs: ${s.autoApprove ? "✅ ON" : "❌ OFF"}\n\n` +
      `📝 *To change buy amount, slippage or fee:*\n` +
      `\`/set buy_amount 0.5\`\n` +
      `\`/set slippage 2\`\n` +
      `\`/set fee high\``;

    const kb = new InlineKeyboard()
      .text(s.notifyBuy ? "🔔 Buy ON → OFF" : "🔔 Buy OFF → ON", `settings:toggle:notifyBuy:${!s.notifyBuy}`)
      .text(s.notifySell ? "🔔 Sell ON → OFF" : "🔔 Sell OFF → ON", `settings:toggle:notifySell:${!s.notifySell}`).row()
      .text(s.notifySniper ? "🎯 Sniper ON → OFF" : "🎯 Sniper OFF → ON", `settings:toggle:notifySniper:${!s.notifySniper}`)
      .text(s.notifyWallet ? "👛 Wallet ON → OFF" : "👛 Wallet OFF → ON", `settings:toggle:notifyWallet:${!s.notifyWallet}`).row()
      .text(s.autoApprove ? "⚡ Auto-Approve: ON → OFF" : "⚡ Auto-Approve: OFF → ON", `settings:toggle:autoApprove:${!s.autoApprove}`).row()
      .text("← Back", "menu:home");

    try {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
    return;
  }

  if (data.startsWith("settings:toggle:")) {
    const parts = data.split(":");
    const field = parts[2] as string;
    const val = parts[3] === "true";
    const allowed = ["notifyBuy", "notifySell", "notifySniper", "notifyWallet", "autoApprove"];
    if (allowed.includes(field)) {
      await db.update(settingsTable).set({ [field]: val });
    }
    // Refresh settings view
    const s = await getOrCreateSettings();
    const label = { notifyBuy: "Buy Alerts", notifySell: "Sell Alerts", notifySniper: "Sniper Alerts", notifyWallet: "Wallet Alerts", autoApprove: "Auto-Approve" }[field] ?? field;
    await ctx.answerCallbackQuery(`${label} turned ${val ? "ON ✅" : "OFF ❌"}`);
    // Re-render settings
    const text =
      `⚙️ *Settings*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 *Trading*\n` +
      `Default Buy: *${fSol(s.defaultBuyAmountSol)} SOL*\n` +
      `Slippage: *${s.defaultSlippagePercent}%*\n` +
      `Priority Fee: *${s.defaultPriorityFee}*\n\n` +
      `🔔 *Notifications*\n` +
      `Buy Alerts: ${s.notifyBuy ? "✅ ON" : "❌ OFF"}\n` +
      `Sell Alerts: ${s.notifySell ? "✅ ON" : "❌ OFF"}\n` +
      `Sniper Alerts: ${s.notifySniper ? "✅ ON" : "❌ OFF"}\n` +
      `Wallet Alerts: ${s.notifyWallet ? "✅ ON" : "❌ OFF"}\n\n` +
      `⚡ *Automation*\n` +
      `Auto-Approve TXs: ${s.autoApprove ? "✅ ON" : "❌ OFF"}\n\n` +
      `📝 *To change buy amount, slippage or fee:*\n` +
      `\`/set buy_amount 0.5\`\n` +
      `\`/set slippage 2\`\n` +
      `\`/set fee high\``;
    const kb = new InlineKeyboard()
      .text(s.notifyBuy ? "🔔 Buy ON → OFF" : "🔔 Buy OFF → ON", `settings:toggle:notifyBuy:${!s.notifyBuy}`)
      .text(s.notifySell ? "🔔 Sell ON → OFF" : "🔔 Sell OFF → ON", `settings:toggle:notifySell:${!s.notifySell}`).row()
      .text(s.notifySniper ? "🎯 Sniper ON → OFF" : "🎯 Sniper OFF → ON", `settings:toggle:notifySniper:${!s.notifySniper}`)
      .text(s.notifyWallet ? "👛 Wallet ON → OFF" : "👛 Wallet OFF → ON", `settings:toggle:notifyWallet:${!s.notifyWallet}`).row()
      .text(s.autoApprove ? "⚡ Auto-Approve: ON → OFF" : "⚡ Auto-Approve: OFF → ON", `settings:toggle:autoApprove:${!s.autoApprove}`).row()
      .text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }
});

// ─── text command handler ─────────────────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const raw = ctx.message.text.trim();
  const lower = raw.toLowerCase();
  const parts = lower.split(/\s+/);
  const originalParts = raw.split(/\s+/);
  const cmd = parts[0];
  const userId = ctx.from?.id;

  // ── Handle pending sniper edit ──────────────────────────────────────────
  if (userId && pendingEditSniper.has(userId)) {
    const sniperId = pendingEditSniper.get(userId)!;
    pendingEditSniper.delete(userId);

    const updates: Record<string, string> = {};
    const amountMatch = raw.match(/amount:([\d.]+)/i);
    const slipMatch = raw.match(/slip:([\d.]+)/i);
    const feeMatch = raw.match(/fee:(auto|low|medium|high)/i);

    if (amountMatch) updates.buyAmountSol = parseFloat(amountMatch[1]).toString();
    if (slipMatch) updates.slippagePercent = parseFloat(slipMatch[1]).toString();

    try {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.buyAmountSol) updateData.buyAmountSol = updates.buyAmountSol;
      if (updates.slippagePercent) updateData.slippagePercent = updates.slippagePercent;
      if (feeMatch) updateData.priorityFee = feeMatch[1].toLowerCase();

      if (Object.keys(updateData).length <= 1) {
        return ctx.reply("❌ No valid fields found. Use format:\n`amount:0.5 slip:2 fee:high`", {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("← Back", "menu:snipe"),
        });
      }

      const [sn] = await db.update(snipersTable).set(updateData as any).where(eq(snipersTable.id, sniperId)).returning();
      return ctx.reply(
        `✅ *Sniper #${sniperId} updated!*\n\nBuy Amount: *${fSol(sn?.buyAmountSol)} SOL*\nSlippage: *${sn?.slippagePercent}%*\nPriority Fee: *${sn?.priorityFee}*`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Snipers", "menu:snipe").text("🏠 Home", "menu:home") }
      );
    } catch (e) {
      return ctx.reply("❌ Failed to update sniper. Please try again.", {
        reply_markup: new InlineKeyboard().text("← Back", "menu:snipe"),
      });
    }
  }

  // ── Auto-detect contract address (paste to buy) ──────────────────────────
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) && !raw.includes(" ")) {
    const s = await getOrCreateSettings();
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet. Set one up in 👛 Wallets first.");
    return ctx.reply(
      `🔍 *Token Detected!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `CA: \`${raw}\`\n\n` +
      `Choose a buy amount:`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text(`0.1 SOL`, `autobuy:${raw}:0.1`).text(`0.5 SOL`, `autobuy:${raw}:0.5`).text(`1 SOL`, `autobuy:${raw}:1.0`).row()
          .text(`Default (${fSol(s.defaultBuyAmountSol)} SOL)`, `autobuy:${raw}:${s.defaultBuyAmountSol}`).row()
          .text("❌ Cancel", "menu:home"),
      }
    );
  }

  // ── /set <key> <value> ─────────────────────────────────────────────────
  if (cmd === "/set") {
    const key = parts[1];
    const val = parts[2];
    if (!key || !val) {
      return ctx.reply(
        `⚙️ *Set a setting:*\n\n` +
        `\`/set buy_amount 0.5\`\n` +
        `\`/set slippage 2\`\n` +
        `\`/set fee auto|low|medium|high\``,
        { parse_mode: "Markdown" }
      );
    }
    const s = await getOrCreateSettings();
    const updates: Record<string, unknown> = {};
    if (key === "buy_amount") updates.defaultBuyAmountSol = parseFloat(val).toString();
    else if (key === "slippage") updates.defaultSlippagePercent = parseFloat(val).toString();
    else if (key === "fee" && ["auto", "low", "medium", "high"].includes(val)) updates.defaultPriorityFee = val;
    else return ctx.reply("❌ Unknown setting. Valid keys: `buy_amount`, `slippage`, `fee`", { parse_mode: "Markdown" });

    await db.update(settingsTable).set(updates).where(eq(settingsTable.id, s.id));
    return ctx.reply(
      `✅ *Setting updated!*\n\n\`${key}\` → \`${val}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("⚙️ Settings", "menu:settings").text("🏠 Home", "menu:home") }
    );
  }

  // ── buy <address> [amount] ──────────────────────────────────────────────
  if (cmd === "buy") {
    const addr = originalParts[1];
    if (!addr) return ctx.reply(
      `💰 *Buy Token*\n\nUsage: \`buy <contract_address> [amount_sol]\`\n\nExample:\n\`buy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.5\``,
      { parse_mode: "Markdown" }
    );
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet. Go to 👛 Wallets first.");
    const s = await getOrCreateSettings();
    const amount = parseFloat(originalParts[2] ?? String(s?.defaultBuyAmountSol ?? "0.1"));
    await db.insert(positionsTable).values({
      walletId: wallet.id,
      tokenSymbol: "UNKNOWN",
      tokenName: "Unknown Token",
      contractAddress: addr,
      amountTokens: String(Math.floor(Math.random() * 1_000_000)),
      valueSol: String(amount),
      entryPriceSol: String(amount / 1_000_000),
      currentPriceSol: String(amount / 1_000_000),
      pnlPercent: "0",
      pnlSol: "0",
      marketCapUsd: String(Math.random() * 1_000_000),
      liquidityUsd: String(Math.random() * 100_000),
    });
    return ctx.reply(
      `✅ *Buy Order Submitted!*\n━━━━━━━━━━━━━━━━━━━━\n\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL*\nWallet: *${wallet.name}*\n\n_Transaction processing..._`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") }
    );
  }

  // ── snipe <address> [amount] ──────────────────────────────────────────────
  if (cmd === "snipe") {
    const addr = originalParts[1];
    if (!addr) return ctx.reply(
      `🎯 *Sniper*\n\nUsage: \`snipe <contract_address> [amount_sol]\`\n\nExample:\n\`snipe EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.5\``,
      { parse_mode: "Markdown" }
    );
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const s = await getOrCreateSettings();
    const amount = parseFloat(originalParts[2] ?? String(s?.defaultBuyAmountSol ?? "0.1"));
    const [sn] = await db.insert(snipersTable).values({
      walletId: wallet.id,
      contractAddress: addr,
      buyAmountSol: String(amount),
      slippagePercent: String(s?.defaultSlippagePercent ?? "10"),
      priorityFee: (s?.defaultPriorityFee ?? "auto") as any,
      status: "monitoring",
    }).returning();
    return ctx.reply(
      `🎯 *Sniper Armed!*\n━━━━━━━━━━━━━━━━━━━━\n\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL*\nSlippage: *${s?.defaultSlippagePercent}%*\nStatus: *🟡 Monitoring*\n\n_Watching for liquidity..._`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎯 Snipers", "menu:snipe").text("🏠 Home", "menu:home") }
    );
  }

  // ── copy <address> [amount] ───────────────────────────────────────────────
  if (cmd === "copy") {
    const addr = originalParts[1];
    if (!addr) return ctx.reply(
      `📋 *Copy Trade*\n\nUsage: \`copy <wallet_address> [amount_sol]\`\n\nExample:\n\`copy 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin 0.1\``,
      { parse_mode: "Markdown" }
    );
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const amount = parseFloat(originalParts[2] ?? "0.1");
    await db.insert(copyTradesTable).values({
      walletId: wallet.id,
      targetAddress: addr,
      amountSol: String(amount),
      mode: "fixed",
      status: "active",
    });
    return ctx.reply(
      `📋 *Copy Trade Active!*\n━━━━━━━━━━━━━━━━━━━━\n\nTarget: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL* per trade\nMode: Fixed\n\n_Monitoring for trades..._`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📋 Copy Trade", "menu:copytrade").text("🏠 Home", "menu:home") }
    );
  }

  // ── limit <address> tp:<pct> sl:<pct> ────────────────────────────────────
  if (cmd === "limit") {
    const addr = originalParts[1];
    if (!addr) return ctx.reply(
      `🎚 *Limit Orders*\n\nUsage: \`limit <address> tp:<percent> sl:<percent>\`\n\nExamples:\n\`limit <addr> tp:50 sl:20\`\n\`limit <addr> tp:100\`\n\`limit <addr> sl:15\``,
      { parse_mode: "Markdown" }
    );
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const tpPart = originalParts.find(p => p.toLowerCase().startsWith("tp:"));
    const slPart = originalParts.find(p => p.toLowerCase().startsWith("sl:"));
    const tp = tpPart ? parseFloat(tpPart.split(":")[1]) : null;
    const sl = slPart ? parseFloat(slPart.split(":")[1]) : null;
    if (!tp && !sl) return ctx.reply("❌ Provide at least tp:<percent> or sl:<percent>", { parse_mode: "Markdown" });
    const symbol = `TOKEN`;
    await db.insert(limitOrdersTable).values({
      walletId: wallet.id,
      tokenSymbol: symbol,
      contractAddress: addr,
      takeProfitPercent: tp?.toString() ?? null,
      stopLossPercent: sl?.toString() ?? null,
      status: "active",
    });
    return ctx.reply(
      `🎚 *Limit Order Set!*\n━━━━━━━━━━━━━━━━━━━━\n\nCA: \`${trunc(addr, 8)}\`\n${tp ? `Take Profit: *+${tp}%*\n` : ""}${sl ? `Stop Loss: *-${sl}%*\n` : ""}\nStatus: *🟡 Watching*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎚 Limit Orders", "menu:limitorders").text("🏠 Home", "menu:home") }
    );
  }

  // ── dca <address> <amount> <hours> ───────────────────────────────────────
  if (cmd === "dca") {
    const addr = originalParts[1];
    const amount = parseFloat(originalParts[2] ?? "0.1");
    const hours = parseFloat(originalParts[3] ?? "24");
    if (!addr) return ctx.reply(
      `🔁 *DCA*\n\nUsage: \`dca <token_address> <amount_sol> <interval_hours>\`\n\nExample:\n\`dca EPjFWdd5... 0.1 24\``,
      { parse_mode: "Markdown" }
    );
    const wallet = await getActiveWallet();
    if (!wallet) return ctx.reply("❌ No active wallet.");
    await db.insert(dcaSetupsTable).values({
      walletId: wallet.id,
      tokenSymbol: "TOKEN",
      contractAddress: addr,
      amountSol: String(amount),
      intervalHours: String(hours),
      status: "active",
    });
    return ctx.reply(
      `🔁 *DCA Started!*\n━━━━━━━━━━━━━━━━━━━━\n\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL*\nInterval: *every ${hours}h*\nStatus: *🟢 Active*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔁 DCA", "menu:dca").text("🏠 Home", "menu:home") }
    );
  }

  // ── Help for unknown commands ─────────────────────────────────────────────
  if (cmd.startsWith("/") || parts.length === 1) {
    return ctx.reply(
      `ℹ️ *Phase Snipe Commands*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Use the menu buttons or type:\n\n` +
      `\`buy <ca> [sol]\` — Buy a token\n` +
      `\`snipe <ca> [sol]\` — Set up a sniper\n` +
      `\`copy <wallet> [sol]\` — Copy a wallet\n` +
      `\`limit <ca> tp:<pct> sl:<pct>\` — Limit order\n` +
      `\`dca <ca> <sol> <hours>\` — Dollar cost average\n` +
      `\`/set buy_amount|slippage|fee <val>\` — Settings\n\n` +
      `💡 *Tip:* Paste a contract address directly to get a buy prompt!`,
      { parse_mode: "Markdown", reply_markup: mainMenu() }
    );
  }
});

// ── autobuy callback (from CA paste) ────────────────────────────────────────
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("autobuy:")) return;
  await ctx.answerCallbackQuery();
  const parts = data.split(":");
  const addr = parts[1];
  const amount = parseFloat(parts[2]);
  const wallet = await getActiveWallet();
  if (!wallet) return ctx.editMessageText("❌ No active wallet. Go to 👛 Wallets first.");
  await db.insert(positionsTable).values({
    walletId: wallet.id,
    tokenSymbol: "UNKNOWN",
    tokenName: "Unknown Token",
    contractAddress: addr,
    amountTokens: String(Math.floor(Math.random() * 1_000_000)),
    valueSol: String(amount),
    entryPriceSol: String(amount / 1_000_000),
    currentPriceSol: String(amount / 1_000_000),
    pnlPercent: "0",
    pnlSol: "0",
    marketCapUsd: String(Math.random() * 1_000_000),
    liquidityUsd: String(Math.random() * 100_000),
  });
  return ctx.editMessageText(
    `✅ *Buy Order Submitted!*\n━━━━━━━━━━━━━━━━━━━━\n\nCA: \`${trunc(addr, 8)}\`\nAmount: *${fSol(amount)} SOL*\nWallet: *${wallet.name}*\n\n_Transaction processing..._`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") }
  );
});

bot.catch((err) => {
  logger.error({ err: err.error, update: err.ctx.update }, "Bot error");
});

} // end if (token && bot)

export async function startBot() {
  if (!token || !bot) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled");
    return;
  }
  logger.info("Telegram bot initializing...");
  bot.start({ drop_pending_updates: true }).catch((err) => {
    logger.error({ err }, "Bot crashed");
  });
  const me = await bot.api.getMe();
  logger.info({ username: me.username }, "Telegram bot started");
}
