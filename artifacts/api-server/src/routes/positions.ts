import { Router } from "express";
import { db } from "@workspace/db";
import { positionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetPositionParams } from "@workspace/api-zod";

const router = Router();

function mapPosition(p: typeof positionsTable.$inferSelect) {
  return {
    ...p,
    amountTokens: parseFloat(p.amountTokens),
    valueSol: parseFloat(p.valueSol),
    entryPriceSol: parseFloat(p.entryPriceSol),
    currentPriceSol: parseFloat(p.currentPriceSol),
    pnlPercent: parseFloat(p.pnlPercent),
    pnlSol: parseFloat(p.pnlSol),
    marketCapUsd: parseFloat(p.marketCapUsd),
    liquidityUsd: parseFloat(p.liquidityUsd),
  };
}

// GET /api/positions
router.get("/", async (req, res) => {
  const positions = await db.select().from(positionsTable).orderBy(positionsTable.id);
  res.json(positions.map(mapPosition));
});

// GET /api/positions/:id
router.get("/:id", async (req, res) => {
  const { id } = GetPositionParams.parse({ id: parseInt(req.params.id) });
  const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.id, id));
  if (!pos) return res.status(404).json({ error: "Position not found" });
  res.json(mapPosition(pos));
});

export default router;
