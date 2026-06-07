import { Router } from "express";
import { db } from "@workspace/db";
import { dcaSetupsTable, positionsTable, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateDcaSetupBody,
  GetDcaSetupParams,
  UpdateDcaSetupParams,
  UpdateDcaSetupBody,
  DeleteDcaSetupParams,
  StartDcaSetupParams,
  PauseDcaSetupParams,
} from "@workspace/api-zod";

const router = Router();

function mapDca(d: typeof dcaSetupsTable.$inferSelect) {
  return {
    ...d,
    amountSol: parseFloat(d.amountSol),
    intervalHours: parseFloat(d.intervalHours),
  };
}

// GET /api/dca
router.get("/", async (req, res) => {
  const items = await db.select().from(dcaSetupsTable).orderBy(dcaSetupsTable.id);
  res.json(items.map(mapDca));
});

// POST /api/dca
router.post("/", async (req, res) => {
  const body = CreateDcaSetupBody.parse(req.body);
  const [activeWallet] = await db.select().from(walletsTable).where(eq(walletsTable.isActive, true));
  const walletId = activeWallet?.id ?? 1;

  const [pos] = await db.select().from(positionsTable).where(eq(positionsTable.contractAddress, body.contractAddress));
  const nextExecution = new Date(Date.now() + body.intervalHours * 3600 * 1000);

  const [item] = await db.insert(dcaSetupsTable).values({
    walletId,
    tokenSymbol: pos?.tokenSymbol ?? "???",
    contractAddress: body.contractAddress,
    amountSol: body.amountSol.toString(),
    intervalHours: body.intervalHours.toString(),
    status: "active",
    executionsCount: 0,
    nextExecutionAt: nextExecution,
  }).returning();

  res.status(201).json(mapDca(item));
});

// GET /api/dca/:id
router.get("/:id", async (req, res): Promise<void> => {
  const { id } = GetDcaSetupParams.parse({ id: parseInt(req.params.id) });
  const [item] = await db.select().from(dcaSetupsTable).where(eq(dcaSetupsTable.id, id));
  if (!item) { res.status(404).json({ error: "DCA setup not found" }); return; }
  res.json(mapDca(item));
});

// PATCH /api/dca/:id
router.patch("/:id", async (req, res): Promise<void> => {
  const { id } = UpdateDcaSetupParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateDcaSetupBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.amountSol !== undefined) updates.amountSol = body.amountSol.toString();
  if (body.intervalHours !== undefined) updates.intervalHours = body.intervalHours.toString();

  const [item] = await db.update(dcaSetupsTable).set(updates).where(eq(dcaSetupsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "DCA setup not found" }); return; }
  res.json(mapDca(item));
});

// DELETE /api/dca/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteDcaSetupParams.parse({ id: parseInt(req.params.id) });
  await db.delete(dcaSetupsTable).where(eq(dcaSetupsTable.id, id));
  res.status(204).send();
});

// POST /api/dca/:id/start
router.post("/:id/start", async (req, res): Promise<void> => {
  const { id } = StartDcaSetupParams.parse({ id: parseInt(req.params.id) });
  const nextExecution = new Date(Date.now() + 3600 * 1000);
  const [item] = await db.update(dcaSetupsTable)
    .set({ status: "active", nextExecutionAt: nextExecution })
    .where(eq(dcaSetupsTable.id, id))
    .returning();
  if (!item) { res.status(404).json({ error: "DCA setup not found" }); return; }
  res.json(mapDca(item));
});

// POST /api/dca/:id/pause
router.post("/:id/pause", async (req, res): Promise<void> => {
  const { id } = PauseDcaSetupParams.parse({ id: parseInt(req.params.id) });
  const [item] = await db.update(dcaSetupsTable)
    .set({ status: "paused", nextExecutionAt: null })
    .where(eq(dcaSetupsTable.id, id))
    .returning();
  if (!item) { res.status(404).json({ error: "DCA setup not found" }); return; }
  res.json(mapDca(item));
});

export default router;
