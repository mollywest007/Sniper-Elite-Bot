import { pgTable, serial, text, numeric, boolean, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Enums
export const priorityFeeEnum = pgEnum("priority_fee", ["auto", "low", "medium", "high"]);
export const sniperStatusEnum = pgEnum("sniper_status", ["idle", "monitoring", "sniped", "stopped", "failed"]);
export const copyTradeStatusEnum = pgEnum("copy_trade_status", ["active", "paused", "stopped"]);
export const copyTradeModeEnum = pgEnum("copy_trade_mode", ["fixed", "proportional"]);
export const limitOrderStatusEnum = pgEnum("limit_order_status", ["active", "triggered", "cancelled"]);
export const dcaStatusEnum = pgEnum("dca_status", ["active", "paused", "stopped"]);
export const tradeTypeEnum = pgEnum("trade_type", ["buy", "sell"]);
export const tradeStatusEnum = pgEnum("trade_status", ["pending", "success", "failed"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "buy_success", "sell_success", "sniper_triggered", "sniper_failed",
  "copy_trade", "limit_order", "dca_executed", "wallet_alert"
]);

// Wallets
export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  balanceSol: numeric("balance_sol", { precision: 18, scale: 9 }).notNull().default("0"),
  balanceUsdc: numeric("balance_usdc", { precision: 18, scale: 6 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWalletSchema = createInsertSchema(walletsTable).omit({ id: true, createdAt: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;

// Positions
export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id, { onDelete: "cascade" }),
  tokenSymbol: text("token_symbol").notNull(),
  tokenName: text("token_name").notNull(),
  contractAddress: text("contract_address").notNull(),
  amountTokens: numeric("amount_tokens", { precision: 30, scale: 9 }).notNull(),
  valueSol: numeric("value_sol", { precision: 18, scale: 9 }).notNull(),
  entryPriceSol: numeric("entry_price_sol", { precision: 30, scale: 18 }).notNull(),
  currentPriceSol: numeric("current_price_sol", { precision: 30, scale: 18 }).notNull(),
  pnlPercent: numeric("pnl_percent", { precision: 10, scale: 4 }).notNull().default("0"),
  pnlSol: numeric("pnl_sol", { precision: 18, scale: 9 }).notNull().default("0"),
  marketCapUsd: numeric("market_cap_usd", { precision: 20, scale: 2 }).notNull().default("0"),
  liquidityUsd: numeric("liquidity_usd", { precision: 20, scale: 2 }).notNull().default("0"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({ id: true, openedAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;

// Trades
export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id, { onDelete: "cascade" }),
  type: tradeTypeEnum("type").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  tokenName: text("token_name").notNull(),
  contractAddress: text("contract_address").notNull(),
  amountSol: numeric("amount_sol", { precision: 18, scale: 9 }).notNull(),
  amountTokens: numeric("amount_tokens", { precision: 30, scale: 9 }).notNull().default("0"),
  priceSol: numeric("price_sol", { precision: 30, scale: 18 }).notNull(),
  pnlPercent: numeric("pnl_percent", { precision: 10, scale: 4 }),
  pnlSol: numeric("pnl_sol", { precision: 18, scale: 9 }),
  txHash: text("tx_hash"),
  status: tradeStatusEnum("status").notNull().default("pending"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true, executedAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;

// Snipers
export const snipersTable = pgTable("snipers", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id, { onDelete: "cascade" }),
  tokenSymbol: text("token_symbol"),
  contractAddress: text("contract_address"),
  buyAmountSol: numeric("buy_amount_sol", { precision: 18, scale: 9 }).notNull(),
  slippagePercent: numeric("slippage_percent", { precision: 6, scale: 2 }).notNull(),
  priorityFee: priorityFeeEnum("priority_fee").notNull().default("auto"),
  status: sniperStatusEnum("status").notNull().default("idle"),
  attempts: integer("attempts").notNull().default(0),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSniperSchema = createInsertSchema(snipersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSniper = z.infer<typeof insertSniperSchema>;
export type Sniper = typeof snipersTable.$inferSelect;

// Copy Trades
export const copyTradesTable = pgTable("copy_trades", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id, { onDelete: "cascade" }),
  targetAddress: text("target_address").notNull(),
  targetAlias: text("target_alias"),
  amountSol: numeric("amount_sol", { precision: 18, scale: 9 }).notNull(),
  mode: copyTradeModeEnum("mode").notNull().default("fixed"),
  status: copyTradeStatusEnum("status").notNull().default("active"),
  tradesCopied: integer("trades_copied").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCopyTradeSchema = createInsertSchema(copyTradesTable).omit({ id: true, createdAt: true });
export type InsertCopyTrade = z.infer<typeof insertCopyTradeSchema>;
export type CopyTrade = typeof copyTradesTable.$inferSelect;

// Limit Orders
export const limitOrdersTable = pgTable("limit_orders", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id, { onDelete: "cascade" }),
  tokenSymbol: text("token_symbol").notNull(),
  contractAddress: text("contract_address").notNull(),
  takeProfitPercent: numeric("take_profit_percent", { precision: 8, scale: 2 }),
  stopLossPercent: numeric("stop_loss_percent", { precision: 8, scale: 2 }),
  trailingStopPercent: numeric("trailing_stop_percent", { precision: 8, scale: 2 }),
  autoSell: boolean("auto_sell").notNull().default(false),
  status: limitOrderStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLimitOrderSchema = createInsertSchema(limitOrdersTable).omit({ id: true, createdAt: true });
export type InsertLimitOrder = z.infer<typeof insertLimitOrderSchema>;
export type LimitOrder = typeof limitOrdersTable.$inferSelect;

// DCA Setups
export const dcaSetupsTable = pgTable("dca_setups", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id, { onDelete: "cascade" }),
  tokenSymbol: text("token_symbol").notNull(),
  contractAddress: text("contract_address").notNull(),
  amountSol: numeric("amount_sol", { precision: 18, scale: 9 }).notNull(),
  intervalHours: numeric("interval_hours", { precision: 6, scale: 2 }).notNull(),
  status: dcaStatusEnum("status").notNull().default("active"),
  executionsCount: integer("executions_count").notNull().default(0),
  nextExecutionAt: timestamp("next_execution_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDcaSetupSchema = createInsertSchema(dcaSetupsTable).omit({ id: true, createdAt: true });
export type InsertDcaSetup = z.infer<typeof insertDcaSetupSchema>;
export type DcaSetup = typeof dcaSetupsTable.$inferSelect;

// Settings
export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  defaultBuyAmountSol: numeric("default_buy_amount_sol", { precision: 18, scale: 9 }).notNull().default("1"),
  defaultSlippagePercent: numeric("default_slippage_percent", { precision: 6, scale: 2 }).notNull().default("10"),
  defaultPriorityFee: priorityFeeEnum("default_priority_fee").notNull().default("auto"),
  autoApprove: boolean("auto_approve").notNull().default(false),
  notifyBuy: boolean("notify_buy").notNull().default(true),
  notifySell: boolean("notify_sell").notNull().default(true),
  notifySniper: boolean("notify_sniper").notNull().default(true),
  notifyWallet: boolean("notify_wallet").notNull().default(true),
  pinLockEnabled: boolean("pin_lock_enabled").notNull().default(false),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(30),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;

// Notifications
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  tokenSymbol: text("token_symbol"),
  amountSol: numeric("amount_sol", { precision: 18, scale: 9 }),
  pnlPercent: numeric("pnl_percent", { precision: 10, scale: 4 }),
  txHash: text("tx_hash"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
