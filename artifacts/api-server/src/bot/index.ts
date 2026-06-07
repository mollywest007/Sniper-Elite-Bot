import { Bot, InlineKeyboard, Context } from "grammy";
import { db } from "@workspace/db";
import {
  walletsTable,
  positionsTable,
  tradesTable,
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

// Create a placeholder bot — handlers below are only registered if token exists,
// and startBot() is a no-op when the token is missing.
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
function trunc(addr: string, chars = 4) {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

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
  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  const active = wallets[0];
  const header = active
    ? `🟢 *PHASE SNIPE*\n\`${active.name}\` — ${fSol(active.balanceSol)} SOL`
    : "🔴 *PHASE SNIPE*\nNo active wallet";

  await ctx.reply(header + "\n\nChoose a module:", {
    parse_mode: "Markdown",
    reply_markup: mainMenu(),
  });
}

// ─── handlers (only registered when token is present) ────────────────────────

if (token && bot) {

// ─── /start ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  await sendMain(ctx);
});

bot.command("menu", async (ctx) => {
  await sendMain(ctx);
});

// ─── callback router ─────────────────────────────────────────────────────────

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  if (data === "menu:home") return sendMain(ctx);

  // ── BUY ──
  if (data === "menu:buy") {
    const settings = await db.select().from(settingsTable).limit(1);
    const s = settings[0];
    const text =
      `💰 *Buy Token*\n\n` +
      `Default amount: *${fSol(s?.defaultBuyAmountSol ?? "0.1")} SOL*\n` +
      `Default slippage: *${s?.defaultSlippagePercent ?? "10"}%*\n` +
      `Priority fee: *${s?.defaultPriorityFee ?? "auto"}*\n\n` +
      `Send a message in the format:\n` +
      `\`buy <contract_address> [amount_sol]\`\n\n` +
      `Example:\n\`buy 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 0.5\``;
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Back", "menu:home"),
    });
  }

  // ── SELL ──
  if (data === "menu:sell") {
    const positions = await db.select().from(positionsTable).limit(10);
    if (positions.length === 0) {
      return ctx.editMessageText("📉 *Sell Position*\n\nNo open positions.", {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("← Back", "menu:home"),
      });
    }
    const kb = new InlineKeyboard();
    for (const p of positions) {
      const pnl = parseFloat(String(p.pnlPercent));
      const icon = pnl >= 0 ? "🟢" : "🔴";
      kb.text(`${icon} ${p.tokenSymbol} ${fPct(p.pnlPercent)}`, `sell:${p.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText("📉 *Sell Position*\n\nSelect a position:", {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  }

  if (data.startsWith("sell:")) {
    const id = parseInt(data.split(":")[1]);
    const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.id, id));
    if (!pos) return ctx.editMessageText("Position not found.", { reply_markup: new InlineKeyboard().text("← Back", "menu:sell") });
    const text =
      `📉 *Sell ${pos.tokenSymbol}*\n\n` +
      `Contract: \`${trunc(pos.contractAddress)}\`\n` +
      `Tokens: *${parseFloat(String(pos.amountTokens)).toLocaleString()}*\n` +
      `Value: *${fSol(pos.valueSol)} SOL*\n` +
      `PnL: *${fPct(pos.pnlPercent)}*\n\n` +
      `Send: \`sell ${pos.contractAddress} <percent>\`\n` +
      `Example: \`sell ${pos.contractAddress} 100\``;
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
    if (!pos) return ctx.editMessageText("Position not found.");
    // Simulate execution: remove position if 100%
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
      `✅ *Sell executed*\n\nSold *${pct}%* of ${pos.tokenSymbol}\nEstimated: *${(parseFloat(String(pos.valueSol)) * pct / 100).toFixed(4)} SOL*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("← Back", "menu:home") }
    );
  }

  // ── PORTFOLIO ──
  if (data === "menu:portfolio") {
    const positions = await db.select().from(positionsTable);
    if (positions.length === 0) {
      return ctx.editMessageText("📊 *Portfolio*\n\nNo open positions.", {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("← Back", "menu:home"),
      });
    }
    const totalSol = positions.reduce((s, p) => s + parseFloat(String(p.valueSol)), 0);
    const totalPnl = positions.reduce((s, p) => s + parseFloat(String(p.pnlSol)), 0);
    let text = `📊 *Portfolio*\n\nTotal: *${fSol(totalSol)} SOL*  PnL: *${fPct((totalPnl / (totalSol - totalPnl)) * 100)}*\n\n`;
    for (const p of positions) {
      const pnl = parseFloat(String(p.pnlPercent));
      text += `${pnl >= 0 ? "🟢" : "🔴"} *${p.tokenSymbol}* — ${fSol(p.valueSol)} SOL (${fPct(pnl)})\n`;
      text += `   \`${trunc(p.contractAddress)}\`\n`;
    }
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Back", "menu:home"),
    });
  }

  // ── WALLETS ──
  if (data === "menu:wallets") {
    const wallets = await db.select().from(walletsTable);
    if (wallets.length === 0) {
      return ctx.editMessageText("👛 *Wallets*\n\nNo wallets found.\n\nSend \`/newwallet <name>\` to create one.", {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("← Back", "menu:home"),
      });
    }
    let text = "👛 *Wallets*\n\n";
    for (const w of wallets) {
      text += `${w.isActive ? "✅" : "⬜"} *${w.name}*\n`;
      text += `   \`${trunc(w.address)}\`\n`;
      text += `   ${fSol(w.balanceSol)} SOL · ${fUsd(w.balanceUsdc)}\n\n`;
    }
    const kb = new InlineKeyboard();
    for (const w of wallets) {
      if (!w.isActive) kb.text(`Activate ${w.name}`, `wallet:activate:${w.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("wallet:activate:")) {
    const id = parseInt(data.split(":")[2]);
    await db.update(walletsTable).set({ isActive: false });
    const [w] = await db.update(walletsTable).set({ isActive: true }).where(eq(walletsTable.id, id)).returning();
    return ctx.editMessageText(`✅ *${w?.name}* is now the active wallet.\n\`${w?.address}\``, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Wallets", "menu:wallets").text("🏠 Home", "menu:home"),
    });
  }

  // ── SNIPE ──
  if (data === "menu:snipe") {
    const snipers = await db.select().from(snipersTable).orderBy(desc(snipersTable.createdAt)).limit(5);
    let text = "🎯 *Sniper Hub*\n\n";
    if (snipers.length === 0) {
      text += "No snipers configured.\n\n";
    } else {
      for (const s of snipers) {
        const icon = s.status === "monitoring" ? "🟡" : s.status === "sniped" ? "🟢" : s.status === "failed" ? "🔴" : "⬜";
        text += `${icon} *${s.tokenSymbol || "Unknown"}* — ${fSol(s.buyAmountSol)} SOL\n`;
        text += `   Status: \`${s.status}\`  Attempts: ${s.attempts}\n`;
        text += `   \`${trunc(s.contractAddress ?? "")}\`\n\n`;
      }
    }
    text += "Send: \`snipe <contract_address> [amount_sol]\`";
    const kb = new InlineKeyboard();
    for (const s of snipers) {
      if (s.status === "monitoring") kb.text(`⏹ Stop ${s.tokenSymbol ?? "sniper"}`, `snipe:stop:${s.id}`).row();
      if (s.status === "idle" || s.status === "stopped" || s.status === "failed")
        kb.text(`▶ Start ${s.tokenSymbol ?? "sniper"}`, `snipe:start:${s.id}`).row();
    }
    kb.text("← Back", "menu:home");
    return ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  }

  if (data.startsWith("snipe:stop:") || data.startsWith("snipe:start:")) {
    const [, action, idStr] = data.split(":");
    const id = parseInt(idStr);
    const newStatus = action === "stop" ? "stopped" : "monitoring";
    const [s] = await db.update(snipersTable).set({ status: newStatus as any }).where(eq(snipersTable.id, id)).returning();
    await ctx.editMessageText(`${action === "stop" ? "⏹ Stopped" : "▶ Started"} sniper for *${s?.tokenSymbol ?? "token"}*`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Snipe", "menu:snipe").text("🏠 Home", "menu:home"),
    });
    return;
  }

  // ── COPY TRADE ──
  if (data === "menu:copytrade") {
    const cts = await db.select().from(copyTradesTable).orderBy(desc(copyTradesTable.createdAt)).limit(10);
    let text = "📋 *Copy Trade*\n\n";
    if (cts.length === 0) {
      text += "No targets configured.\n\n";
    } else {
      for (const ct of cts) {
        const icon = ct.status === "active" ? "🟢" : ct.status === "paused" ? "🟡" : "⬜";
        text += `${icon} *${ct.targetAlias ?? "Unnamed"}* — ${fSol(ct.amountSol)} SOL\n`;
        text += `   \`${trunc(ct.targetAddress)}\`  Mode: ${ct.mode}  Copied: ${ct.tradesCopied}\n\n`;
      }
    }
    text += "Send: \`copy <target_wallet_address> [amount_sol]\`";
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
    await ctx.editMessageText(`${action === "pause" ? "⏸ Paused" : "▶ Resumed"} copy trade for *${ct?.targetAlias ?? "target"}*`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Copy Trade", "menu:copytrade").text("🏠 Home", "menu:home"),
    });
    return;
  }

  // ── LIMIT ORDERS ──
  if (data === "menu:limitorders") {
    const orders = await db.select().from(limitOrdersTable).orderBy(desc(limitOrdersTable.createdAt)).limit(10);
    let text = "🎚 *Limit Orders*\n\n";
    if (orders.length === 0) {
      text += "No orders set.\n\n";
    } else {
      for (const o of orders) {
        const icon = o.status === "active" ? "🟡" : o.status === "triggered" ? "🟢" : "⬜";
        text += `${icon} *${o.tokenSymbol}* — \`${trunc(o.contractAddress)}\`\n`;
        if (o.takeProfitPercent) text += `   TP: +${o.takeProfitPercent}%`;
        if (o.stopLossPercent) text += `  SL: -${o.stopLossPercent}%`;
        if (o.trailingStopPercent) text += `  Trail: ${o.trailingStopPercent}%`;
        text += `\n   Auto-sell: ${o.autoSell ? "Yes" : "No"}  Status: ${o.status}\n\n`;
      }
    }
    text += "Send: \`limit <contract_address> tp:<percent> sl:<percent>\`\nExample: \`limit <addr> tp:50 sl:20\`";
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

  // ── DCA ──
  if (data === "menu:dca") {
    const dcas = await db.select().from(dcaSetupsTable).orderBy(desc(dcaSetupsTable.createdAt)).limit(10);
    let text = "🔁 *DCA Operations*\n\n";
    if (dcas.length === 0) {
      text += "No DCA setups.\n\n";
    } else {
      for (const d of dcas) {
        const icon = d.status === "active" ? "🟢" : d.status === "paused" ? "🟡" : "⬜";
        text += `${icon} *${d.tokenSymbol}* — ${fSol(d.amountSol)} SOL every ${d.intervalHours}h\n`;
        text += `   Executions: ${d.executionsCount}  Status: ${d.status}\n\n`;
      }
    }
    text += "Send: \`dca <contract_address> <amount_sol> <interval_hours>\`\nExample: \`dca <addr> 0.1 24\`";
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
    const newStatus = action === "pause" ? "paused" : "active";
    const [d] = await db.update(dcaSetupsTable).set({ status: newStatus as any }).where(eq(dcaSetupsTable.id, id)).returning();
    await ctx.editMessageText(`${action === "pause" ? "⏸ Paused" : "▶ Resumed"} DCA for *${d?.tokenSymbol}*`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← DCA", "menu:dca").text("🏠 Home", "menu:home"),
    });
    return;
  }

  // ── LOGS / NOTIFICATIONS ──
  if (data === "menu:logs") {
    const notifs = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt)).limit(10);
    let text = "🔔 *System Logs*\n\n";
    if (notifs.length === 0) {
      text += "No logs yet.";
    } else {
      for (const n of notifs) {
        const icon = n.isRead ? "📩" : "📬";
        text += `${icon} *${n.title}*\n`;
        text += `   ${n.message}\n`;
        if (n.amountSol) text += `   Amount: ${fSol(n.amountSol)} SOL`;
        if (n.pnlPercent) text += `  PnL: ${fPct(n.pnlPercent)}`;
        text += `\n   _${new Date(n.createdAt).toLocaleString()}_\n\n`;
      }
    }
    // Mark all as read
    await db.update(notificationsTable).set({ isRead: true });
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Back", "menu:home"),
    });
  }

  // ── SETTINGS ──
  if (data === "menu:settings") {
    const [s] = await db.select().from(settingsTable).limit(1);
    if (!s) return ctx.editMessageText("No settings found.", { reply_markup: new InlineKeyboard().text("← Back", "menu:home") });
    const text =
      `⚙️ *Settings*\n\n` +
      `Default buy: *${fSol(s.defaultBuyAmountSol)} SOL*\n` +
      `Default slippage: *${s.defaultSlippagePercent}%*\n` +
      `Priority fee: *${s.defaultPriorityFee}*\n` +
      `Auto-approve: *${s.autoApprove ? "ON" : "OFF"}*\n\n` +
      `*Notifications*\n` +
      `Buy: ${s.notifyBuy ? "✅" : "❌"}  Sell: ${s.notifySell ? "✅" : "❌"}  Sniper: ${s.notifySniper ? "✅" : "❌"}  Wallet: ${s.notifyWallet ? "✅" : "❌"}\n\n` +
      `*Security*\n` +
      `PIN lock: ${s.pinLockEnabled ? "✅" : "❌"}  Session timeout: ${s.sessionTimeoutMinutes}min\n\n` +
      `Send \`/set <key> <value>\` to change a setting.\n` +
      `Keys: \`buy_amount\`, \`slippage\`, \`priority\``;
    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text(s.autoApprove ? "🔴 Disable Auto-Approve" : "🟢 Enable Auto-Approve", `settings:autoapprove:${!s.autoApprove}`)
        .row()
        .text("← Back", "menu:home"),
    });
  }

  if (data.startsWith("settings:autoapprove:")) {
    const val = data.split(":")[2] === "true";
    await db.update(settingsTable).set({ autoApprove: val });
    return ctx.editMessageText(`✅ Auto-approve *${val ? "enabled" : "disabled"}*.`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("← Settings", "menu:settings").text("🏠 Home", "menu:home"),
    });
  }
});

// ─── text command handler ────────────────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim().toLowerCase();
  const parts = text.split(/\s+/);
  const cmd = parts[0];

  // buy <address> [amount]
  if (cmd === "buy") {
    const addr = parts[1];
    if (!addr) return ctx.reply("Usage: `buy <contract_address> [amount_sol]`", { parse_mode: "Markdown" });
    const wallets = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
    const wallet = wallets[0];
    if (!wallet) return ctx.reply("❌ No active wallet. Go to 👛 Wallets first.");
    const [s] = await db.select().from(settingsTable).limit(1);
    const amount = parseFloat(parts[2] ?? String(s?.defaultBuyAmountSol ?? "0.1"));
    // Simulate buy: create a position
    await db.insert(positionsTable).values({
      walletId: wallet.id,
      tokenSymbol: "???",
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
      `✅ *Buy executed*\n\nContract: \`${trunc(addr)}\`\nAmount: *${fSol(amount)} SOL*\nWallet: ${wallet.name}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📊 Portfolio", "menu:portfolio").text("🏠 Home", "menu:home") }
    );
  }

  // snipe <address> [amount]
  if (cmd === "snipe") {
    const addr = parts[1];
    if (!addr) return ctx.reply("Usage: `snipe <contract_address> [amount_sol]`", { parse_mode: "Markdown" });
    const wallets = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
    const wallet = wallets[0];
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const [s] = await db.select().from(settingsTable).limit(1);
    const amount = parseFloat(parts[2] ?? String(s?.defaultBuyAmountSol ?? "0.1"));
    await db.insert(snipersTable).values({
      walletId: wallet.id,
      contractAddress: addr,
      buyAmountSol: String(amount),
      slippagePercent: String(s?.defaultSlippagePercent ?? "10"),
      priorityFee: (s?.defaultPriorityFee ?? "auto") as any,
      status: "monitoring",
    });
    return ctx.reply(
      `🎯 *Sniper armed*\n\nContract: \`${trunc(addr)}\`\nAmount: *${fSol(amount)} SOL*\nStatus: *Monitoring*`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎯 Snipers", "menu:snipe").text("🏠 Home", "menu:home") }
    );
  }

  // copy <address> [amount]
  if (cmd === "copy") {
    const addr = parts[1];
    if (!addr) return ctx.reply("Usage: `copy <wallet_address> [amount_sol]`", { parse_mode: "Markdown" });
    const wallets = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
    const wallet = wallets[0];
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const amount = parseFloat(parts[2] ?? "0.1");
    await db.insert(copyTradesTable).values({
      walletId: wallet.id,
      targetAddress: addr,
      amountSol: String(amount),
      mode: "fixed",
      status: "active",
    });
    return ctx.reply(
      `📋 *Copy trade started*\n\nTarget: \`${trunc(addr)}\`\nAmount: *${fSol(amount)} SOL* per trade`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📋 Copy Trade", "menu:copytrade").text("🏠 Home", "menu:home") }
    );
  }

  // limit <address> tp:<pct> sl:<pct>
  if (cmd === "limit") {
    const addr = parts[1];
    if (!addr) return ctx.reply("Usage: `limit <address> tp:<percent> sl:<percent>`", { parse_mode: "Markdown" });
    const wallets = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
    const wallet = wallets[0];
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const tpPart = parts.find(p => p.startsWith("tp:"));
    const slPart = parts.find(p => p.startsWith("sl:"));
    const tp = tpPart ? parseFloat(tpPart.split(":")[1]) : null;
    const sl = slPart ? parseFloat(slPart.split(":")[1]) : null;
    await db.insert(limitOrdersTable).values({
      walletId: wallet.id,
      tokenSymbol: "???",
      contractAddress: addr,
      takeProfitPercent: tp !== null ? String(tp) : null,
      stopLossPercent: sl !== null ? String(sl) : null,
      autoSell: true,
      status: "active",
    });
    return ctx.reply(
      `🎚 *Limit order set*\n\nContract: \`${trunc(addr)}\`\n${tp != null ? `TP: +${tp}%\n` : ""}${sl != null ? `SL: -${sl}%\n` : ""}Auto-sell: ON`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎚 Limit Orders", "menu:limitorders").text("🏠 Home", "menu:home") }
    );
  }

  // dca <address> <amount> <interval_hours>
  if (cmd === "dca") {
    const addr = parts[1];
    if (!addr || !parts[2]) return ctx.reply("Usage: `dca <address> <amount_sol> <interval_hours>`", { parse_mode: "Markdown" });
    const wallets = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
    const wallet = wallets[0];
    if (!wallet) return ctx.reply("❌ No active wallet.");
    const amount = parseFloat(parts[2]);
    const interval = parseFloat(parts[3] ?? "24");
    const nextExec = new Date(Date.now() + interval * 3_600_000);
    await db.insert(dcaSetupsTable).values({
      walletId: wallet.id,
      tokenSymbol: "???",
      contractAddress: addr,
      amountSol: String(amount),
      intervalHours: String(interval),
      status: "active",
      nextExecutionAt: nextExec,
    });
    return ctx.reply(
      `🔁 *DCA setup created*\n\nContract: \`${trunc(addr)}\`\nAmount: *${fSol(amount)} SOL* every *${interval}h*\nNext run: ${nextExec.toLocaleString()}`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🔁 DCA", "menu:dca").text("🏠 Home", "menu:home") }
    );
  }

  // /set key value
  if (ctx.message.text.startsWith("/set ")) {
    const [, key, ...valParts] = ctx.message.text.split(" ");
    const val = valParts.join(" ");
    const [s] = await db.select().from(settingsTable).limit(1);
    if (!s) return ctx.reply("No settings found.");
    if (key === "buy_amount") {
      await db.update(settingsTable).set({ defaultBuyAmountSol: val });
      return ctx.reply(`✅ Default buy amount set to *${val} SOL*`, { parse_mode: "Markdown" });
    }
    if (key === "slippage") {
      await db.update(settingsTable).set({ defaultSlippagePercent: val });
      return ctx.reply(`✅ Default slippage set to *${val}%*`, { parse_mode: "Markdown" });
    }
    if (key === "priority") {
      if (!["auto", "low", "medium", "high"].includes(val)) return ctx.reply("Priority must be: auto, low, medium, high");
      await db.update(settingsTable).set({ defaultPriorityFee: val as any });
      return ctx.reply(`✅ Priority fee set to *${val}*`, { parse_mode: "Markdown" });
    }
    return ctx.reply("Unknown key. Use: `buy_amount`, `slippage`, `priority`", { parse_mode: "Markdown" });
  }

  // fallback — show main menu for unrecognized input
  if (!["buy", "sell", "snipe", "copy", "limit", "dca"].includes(cmd)) {
    await sendMain(ctx);
  }
  return;
});

// ─── error handler ───────────────────────────────────────────────────────────

bot.catch((err) => {
  logger.error({ err: err.error, ctx: err.ctx?.update }, "Bot error");
});

} // end if (token && bot)

export function startBot() {
  if (!process.env["TELEGRAM_BOT_TOKEN"]) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }
  bot.start({
    onStart: (info) => logger.info({ username: info.username }, "Telegram bot started"),
  });
  logger.info("Telegram bot initializing...");
}
