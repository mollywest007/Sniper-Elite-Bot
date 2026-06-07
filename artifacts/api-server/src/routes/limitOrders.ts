import { Router } from "express";
import { db } from "@workspace/db";
import { limitOrdersTable, positionsTable, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateLimitOrderBody,
  GetLimitOrderParams,
  UpdateLimitOrderParams,
  UpdateLimitOrderBody,
  DeleteLimitOrderParams,
} from "@workspace/api-zod";

const router = Router();

function mapLimitOrder(o: typeof limitOrdersTable.$inferSelect) {
  return {
    ...o,
    takeProfitPercent: o.takeProfitPercent != null ? parseFloat(o.takeProfitPercent) : null,
    stopLossPercent: o.stopLossPercent != null ? parseFloat(o.stopLossPercent) : null,
    trailingStopPercent: o.trailingStopPercent != null ? parseFloat(o.trailingStopPercent) : null,
  };
}

// GET /api/limit-orders
router.get("/", async (req, res) => {
  const items = await db.select().from(limitOrdersTable).orderBy(limitOrdersTable.id);
  res.json(items.map(mapLimitOrder));
});

// POST /api/limit-orders
router.post("/", async (req, res) => {
  const body = CreateLimitOrderBody.parse(req.body);
  const [activeWallet] = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  const walletId = activeWallet?.id ?? 1;

  // Look up token symbol from positions
  const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.contractAddress, body.contractAddress));

  const [item] = await db.insert(limitOrdersTable).values({
    walletId,
    tokenSymbol: pos?.tokenSymbol ?? "???",
    contractAddress: body.contractAddress,
    takeProfitPercent: body.takeProfitPercent?.toString() ?? null,
    stopLossPercent: body.stopLossPercent?.toString() ?? null,
    trailingStopPercent: body.trailingStopPercent?.toString() ?? null,
    autoSell: body.autoSell,
    status: "active",
  }).returning();

  res.status(201).json(mapLimitOrder(item));
});

// GET /api/limit-orders/:id
router.get("/:id", async (req, res): Promise<void> => {
  const { id } = GetLimitOrderParams.parse({ id: parseInt(req.params.id) });
  const [item] = await db.select().from(limitOrdersTable).where(eq(limitOrdersTable.id, id));
  if (!item) { res.status(404).json({ error: "Limit order not found" }); return; }
  res.json(mapLimitOrder(item));
});

// PATCH /api/limit-orders/:id
router.patch("/:id", async (req, res): Promise<void> => {
  const { id } = UpdateLimitOrderParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateLimitOrderBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.takeProfitPercent !== undefined) updates.takeProfitPercent = body.takeProfitPercent?.toString() ?? null;
  if (body.stopLossPercent !== undefined) updates.stopLossPercent = body.stopLossPercent?.toString() ?? null;
  if (body.trailingStopPercent !== undefined) updates.trailingStopPercent = body.trailingStopPercent?.toString() ?? null;
  if (body.autoSell !== undefined) updates.autoSell = body.autoSell;

  const [item] = await db.update(limitOrdersTable).set(updates).where(eq(limitOrdersTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Limit order not found" }); return; }
  res.json(mapLimitOrder(item));
});

// DELETE /api/limit-orders/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteLimitOrderParams.parse({ id: parseInt(req.params.id) });
  await db.delete(limitOrdersTable).where(eq(limitOrdersTable.id, id));
  res.status(204).send();
});

export default router;
