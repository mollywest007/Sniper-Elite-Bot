import { Router } from "express";
import { db } from "@workspace/db";
import { copyTradesTable, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateCopyTradeBody,
  GetCopyTradeParams,
  UpdateCopyTradeParams,
  UpdateCopyTradeBody,
  DeleteCopyTradeParams,
  StartCopyTradeParams,
  PauseCopyTradeParams,
} from "@workspace/api-zod";

const router = Router();

function mapCopyTrade(c: typeof copyTradesTable.$inferSelect) {
  return {
    ...c,
    amountSol: parseFloat(c.amountSol),
  };
}

// GET /api/copy-trades
router.get("/", async (req, res) => {
  const items = await db.select().from(copyTradesTable).orderBy(copyTradesTable.id);
  res.json(items.map(mapCopyTrade));
});

// POST /api/copy-trades
router.post("/", async (req, res) => {
  const body = CreateCopyTradeBody.parse(req.body);
  const [activeWallet] = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  const walletId = activeWallet?.id ?? 1;

  const [item] = await db.insert(copyTradesTable).values({
    walletId,
    targetAddress: body.targetAddress,
    targetAlias: body.targetAlias ?? null,
    amountSol: body.amountSol.toString(),
    mode: body.mode,
    status: "active",
    tradesCopied: 0,
  }).returning();

  res.status(201).json(mapCopyTrade(item));
});

// GET /api/copy-trades/:id
router.get("/:id", async (req, res): Promise<void> => {
  const { id } = GetCopyTradeParams.parse({ id: parseInt(req.params.id) });
  const [item] = await db.select().from(copyTradesTable).where(eq(copyTradesTable.id, id));
  if (!item) { res.status(404).json({ error: "Copy trade not found" }); return; }
  res.json(mapCopyTrade(item));
});

// PATCH /api/copy-trades/:id
router.patch("/:id", async (req, res): Promise<void> => {
  const { id } = UpdateCopyTradeParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateCopyTradeBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.targetAlias !== undefined) updates.targetAlias = body.targetAlias;
  if (body.amountSol !== undefined) updates.amountSol = body.amountSol.toString();
  if (body.mode !== undefined) updates.mode = body.mode;

  const [item] = await db.update(copyTradesTable).set(updates).where(eq(copyTradesTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Copy trade not found" }); return; }
  res.json(mapCopyTrade(item));
});

// DELETE /api/copy-trades/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteCopyTradeParams.parse({ id: parseInt(req.params.id) });
  await db.delete(copyTradesTable).where(eq(copyTradesTable.id, id));
  res.status(204).send();
});

// POST /api/copy-trades/:id/start
router.post("/:id/start", async (req, res): Promise<void> => {
  const { id } = StartCopyTradeParams.parse({ id: parseInt(req.params.id) });
  const [item] = await db.update(copyTradesTable).set({ status: "active" }).where(eq(copyTradesTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Copy trade not found" }); return; }
  res.json(mapCopyTrade(item));
});

// POST /api/copy-trades/:id/pause
router.post("/:id/pause", async (req, res): Promise<void> => {
  const { id } = PauseCopyTradeParams.parse({ id: parseInt(req.params.id) });
  const [item] = await db.update(copyTradesTable).set({ status: "paused" }).where(eq(copyTradesTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Copy trade not found" }); return; }
  res.json(mapCopyTrade(item));
});

export default router;
