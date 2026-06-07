import { Router } from "express";
import { db } from "@workspace/db";
import { snipersTable, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateSniperBody,
  GetSniperParams,
  UpdateSniperParams,
  UpdateSniperBody,
  DeleteSniperParams,
  StartSniperParams,
  StopSniperParams,
} from "@workspace/api-zod";

const router = Router();

function mapSniper(s: typeof snipersTable.$inferSelect) {
  return {
    ...s,
    buyAmountSol: parseFloat(s.buyAmountSol),
    slippagePercent: parseFloat(s.slippagePercent),
  };
}

// GET /api/snipers
router.get("/", async (req, res) => {
  const snipers = await db.select().from(snipersTable).orderBy(snipersTable.id);
  res.json(snipers.map(mapSniper));
});

// POST /api/snipers
router.post("/", async (req, res) => {
  const body = CreateSniperBody.parse(req.body);
  const [activeWallet] = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  const walletId = activeWallet?.id ?? 1;

  const [sniper] = await db.insert(snipersTable).values({
    walletId,
    contractAddress: body.contractAddress ?? null,
    buyAmountSol: body.buyAmountSol.toString(),
    slippagePercent: body.slippagePercent.toString(),
    priorityFee: body.priorityFee,
    status: "idle",
    attempts: 0,
  }).returning();

  res.status(201).json(mapSniper(sniper));
});

// GET /api/snipers/:id
router.get("/:id", async (req, res): Promise<void> => {
  const { id } = GetSniperParams.parse({ id: parseInt(req.params.id) });
  const [sniper] = await db.select().from(snipersTable).where(eq(snipersTable.id, id));
  if (!sniper) { res.status(404).json({ error: "Sniper not found" }); return; }
  res.json(mapSniper(sniper));
});

// PATCH /api/snipers/:id
router.patch("/:id", async (req, res): Promise<void> => {
  const { id } = UpdateSniperParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateSniperBody.parse(req.body);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.contractAddress !== undefined) updates.contractAddress = body.contractAddress;
  if (body.buyAmountSol !== undefined) updates.buyAmountSol = body.buyAmountSol.toString();
  if (body.slippagePercent !== undefined) updates.slippagePercent = body.slippagePercent.toString();
  if (body.priorityFee !== undefined) updates.priorityFee = body.priorityFee;

  const [sniper] = await db.update(snipersTable).set(updates).where(eq(snipersTable.id, id)).returning();
  if (!sniper) { res.status(404).json({ error: "Sniper not found" }); return; }
  res.json(mapSniper(sniper));
});

// DELETE /api/snipers/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteSniperParams.parse({ id: parseInt(req.params.id) });
  await db.delete(snipersTable).where(eq(snipersTable.id, id));
  res.status(204).send();
});

// POST /api/snipers/:id/start
router.post("/:id/start", async (req, res): Promise<void> => {
  const { id } = StartSniperParams.parse({ id: parseInt(req.params.id) });
  const [sniper] = await db.update(snipersTable)
    .set({ status: "monitoring", updatedAt: new Date() })
    .where(eq(snipersTable.id, id))
    .returning();
  if (!sniper) { res.status(404).json({ error: "Sniper not found" }); return; }
  res.json(mapSniper(sniper));
});

// POST /api/snipers/:id/stop
router.post("/:id/stop", async (req, res): Promise<void> => {
  const { id } = StopSniperParams.parse({ id: parseInt(req.params.id) });
  const [sniper] = await db.update(snipersTable)
    .set({ status: "stopped", updatedAt: new Date() })
    .where(eq(snipersTable.id, id))
    .returning();
  if (!sniper) { res.status(404).json({ error: "Sniper not found" }); return; }
  res.json(mapSniper(sniper));
});

export default router;
