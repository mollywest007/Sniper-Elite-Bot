import { Router } from "express";
import { db } from "@workspace/db";
import { tradesTable, positionsTable, walletsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ExecuteTradeBody } from "@workspace/api-zod";

const router = Router();

function mapTrade(t: typeof tradesTable.$inferSelect) {
  return {
    ...t,
    amountSol: parseFloat(t.amountSol),
    amountTokens: parseFloat(t.amountTokens),
    priceSol: parseFloat(t.priceSol),
    pnlPercent: t.pnlPercent != null ? parseFloat(t.pnlPercent) : null,
    pnlSol: t.pnlSol != null ? parseFloat(t.pnlSol) : null,
  };
}

// GET /api/trades
router.get("/", async (req, res) => {
  const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.executedAt)).limit(50);
  res.json(trades.map(mapTrade));
});

// POST /api/trades
router.post("/", async (req, res) => {
  const body = ExecuteTradeBody.parse(req.body);

  // Get active wallet
  const [activeWallet] = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  const walletId = activeWallet?.id ?? 1;

  // Simulate trade execution
  const price = Math.random() * 0.0001;
  const amountTokens = body.type === "buy" && body.amountSol
    ? body.amountSol / price
    : 1000000;

  const [trade] = await db.insert(tradesTable).values({
    walletId,
    type: body.type,
    tokenSymbol: "???",
    tokenName: "Unknown Token",
    contractAddress: body.contractAddress,
    amountSol: body.amountSol?.toString() ?? "1",
    amountTokens: amountTokens.toFixed(9),
    priceSol: price.toFixed(18),
    pnlPercent: body.type === "sell" ? (Math.random() * 200 - 50).toFixed(4) : null,
    pnlSol: body.type === "sell" ? (Math.random() * 2 - 0.5).toFixed(9) : null,
    txHash: `${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
    status: "success",
  }).returning();

  res.status(201).json(mapTrade(trade));
});

export default router;
