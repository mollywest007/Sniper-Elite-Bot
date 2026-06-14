import { Router } from "express";
import { db } from "@workspace/db";
import {
  walletsTable,
  positionsTable,
  tradesTable,
  snipersTable,
  copyTradesTable,
} from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

// GET /api/dashboard
router.get("/", async (req, res) => {
  const [activeWallet] = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));

  const walletBalanceSol = activeWallet ? parseFloat(activeWallet.balanceSol) : 0;
  const walletBalanceUsdc = activeWallet ? parseFloat(activeWallet.balanceUsdc) : 0;

  // Get positions
  const positions = await db.select().from(positionsTable);
  const totalPositionValueSol = positions.reduce((sum, p) => sum + parseFloat(p.valueSol), 0);
  const totalValueSol = walletBalanceSol + totalPositionValueSol;

  // Today's PnL from trades
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = await db.select().from(tradesTable).where(
    and(gte(tradesTable.executedAt, todayStart), eq(tradesTable.status, "success"))
  );
  const pnlTodaySol = todayTrades.reduce((sum, t) => sum + (t.pnlSol ? parseFloat(t.pnlSol) : 0), 0);
  const pnlTodayPercent = totalValueSol > 0 ? (pnlTodaySol / totalValueSol) * 100 : 0;

  // Active snipers count
  const activeSnipers = await db.select().from(snipersTable).where(eq(snipersTable.status, "monitoring"));
  
  // Active copy trades count
  const activeCopyTrades = await db.select().from(copyTradesTable).where(eq(copyTradesTable.status, "active"));

  // Recent trades
  const recentTrades = await db.select().from(tradesTable).orderBy(desc(tradesTable.executedAt)).limit(5);

  // Monthly users: base 931 + distinct users active in last 30 days
  const BASE_USERS = 931;
  let monthlyUsers = BASE_USERS;
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM bot_users WHERE last_seen_at >= NOW() - INTERVAL '30 days'`
    );
    monthlyUsers = BASE_USERS + (Number((result.rows[0] as any)?.cnt ?? 0));
  } catch {
    // bot_users table may not exist yet — fall back to base
  }

  res.json({
    totalValueSol,
    pnlTodaySol,
    pnlTodayPercent,
    walletBalanceSol,
    walletBalanceUsdc,
    activeSnipersCount: activeSnipers.length,
    openPositionsCount: positions.length,
    activeCopyTradesCount: activeCopyTrades.length,
    monthlyUsers,
    recentTrades: recentTrades.map(t => ({
      ...t,
      amountSol: parseFloat(t.amountSol),
      amountTokens: parseFloat(t.amountTokens),
      priceSol: parseFloat(t.priceSol),
      pnlPercent: t.pnlPercent != null ? parseFloat(t.pnlPercent) : null,
      pnlSol: t.pnlSol != null ? parseFloat(t.pnlSol) : null,
    })),
  });
});

export default router;
