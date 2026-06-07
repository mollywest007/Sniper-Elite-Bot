import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { MarkNotificationReadParams } from "@workspace/api-zod";

const router = Router();

function mapNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    ...n,
    amountSol: n.amountSol != null ? parseFloat(n.amountSol) : null,
    pnlPercent: n.pnlPercent != null ? parseFloat(n.pnlPercent) : null,
  };
}

// GET /api/notifications
router.get("/", async (req, res) => {
  const items = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt)).limit(50);
  res.json(items.map(mapNotification));
});

// POST /api/notifications/:id/read
router.post("/:id/read", async (req, res) => {
  const { id } = MarkNotificationReadParams.parse({ id: parseInt(req.params.id) });
  const [item] = await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id)).returning();
  if (!item) return res.status(404).json({ error: "Notification not found" });
  res.json(mapNotification(item));
});

export default router;
