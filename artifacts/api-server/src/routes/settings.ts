import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router = Router();

function mapSettings(s: typeof settingsTable.$inferSelect) {
  return {
    ...s,
    defaultBuyAmountSol: parseFloat(s.defaultBuyAmountSol),
    defaultSlippagePercent: parseFloat(s.defaultSlippagePercent),
  };
}

async function getOrCreateSettings() {
  const [settings] = await db.select().from(settingsTable);
  if (settings) return settings;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

// GET /api/settings
router.get("/", async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json(mapSettings(settings));
});

// PATCH /api/settings
router.patch("/", async (req, res) => {
  const body = UpdateSettingsBody.parse(req.body);
  const existing = await getOrCreateSettings();
  const updates: Record<string, unknown> = {};
  if (body.defaultBuyAmountSol !== undefined) updates.defaultBuyAmountSol = body.defaultBuyAmountSol.toString();
  if (body.defaultSlippagePercent !== undefined) updates.defaultSlippagePercent = body.defaultSlippagePercent.toString();
  if (body.defaultPriorityFee !== undefined) updates.defaultPriorityFee = body.defaultPriorityFee;
  if (body.autoApprove !== undefined) updates.autoApprove = body.autoApprove;
  if (body.notifyBuy !== undefined) updates.notifyBuy = body.notifyBuy;
  if (body.notifySell !== undefined) updates.notifySell = body.notifySell;
  if (body.notifySniper !== undefined) updates.notifySniper = body.notifySniper;
  if (body.notifyWallet !== undefined) updates.notifyWallet = body.notifyWallet;
  if (body.pinLockEnabled !== undefined) updates.pinLockEnabled = body.pinLockEnabled;
  if (body.sessionTimeoutMinutes !== undefined) updates.sessionTimeoutMinutes = body.sessionTimeoutMinutes;

  const [updated] = await db.update(settingsTable).set(updates).where(eq(settingsTable.id, existing.id)).returning();
  res.json(mapSettings(updated));
});

export default router;
