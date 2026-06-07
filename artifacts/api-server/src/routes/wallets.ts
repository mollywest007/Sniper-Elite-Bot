import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetWalletParams,
  UpdateWalletParams,
  UpdateWalletBody,
  DeleteWalletParams,
  ActivateWalletParams,
  CreateWalletBody,
  ImportWalletBody,
} from "@workspace/api-zod";
import { BOT_WALLET_ADDRESS } from "../lib/walletConfig";

const router = Router();

// GET /api/wallets
router.get("/", async (req, res) => {
  const wallets = await db.select().from(walletsTable).orderBy(walletsTable.id);
  res.json(wallets.map(w => ({
    ...w,
    balanceSol: parseFloat(w.balanceSol),
    balanceUsdc: parseFloat(w.balanceUsdc),
  })));
});

// POST /api/wallets
router.post("/", async (req, res) => {
  const body = CreateWalletBody.parse(req.body);
  const [wallet] = await db.insert(walletsTable).values({
    name: body.name,
    address: BOT_WALLET_ADDRESS,
    balanceSol: "0",
    balanceUsdc: "0",
    isActive: false,
  }).returning();
  res.status(201).json({ ...wallet, balanceSol: parseFloat(wallet.balanceSol), balanceUsdc: parseFloat(wallet.balanceUsdc) });
});

// POST /api/wallets/import
router.post("/import", async (req, res) => {
  const body = ImportWalletBody.parse(req.body);
  const [wallet] = await db.insert(walletsTable).values({
    name: body.name,
    address: BOT_WALLET_ADDRESS,
    balanceSol: "0",
    balanceUsdc: "0",
    isActive: false,
  }).returning();
  res.status(201).json({ ...wallet, balanceSol: parseFloat(wallet.balanceSol), balanceUsdc: parseFloat(wallet.balanceUsdc) });
});

// GET /api/wallets/:id
router.get("/:id", async (req, res): Promise<void> => {
  const { id } = GetWalletParams.parse({ id: parseInt(req.params.id) });
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  res.json({ ...wallet, balanceSol: parseFloat(wallet.balanceSol), balanceUsdc: parseFloat(wallet.balanceUsdc) });
});

// PATCH /api/wallets/:id
router.patch("/:id", async (req, res): Promise<void> => {
  const { id } = UpdateWalletParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateWalletBody.parse(req.body);
  const [wallet] = await db.update(walletsTable).set(body).where(eq(walletsTable.id, id)).returning();
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  res.json({ ...wallet, balanceSol: parseFloat(wallet.balanceSol), balanceUsdc: parseFloat(wallet.balanceUsdc) });
});

// DELETE /api/wallets/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteWalletParams.parse({ id: parseInt(req.params.id) });
  await db.delete(walletsTable).where(eq(walletsTable.id, id));
  res.status(204).send();
});

// POST /api/wallets/:id/activate
router.post("/:id/activate", async (req, res): Promise<void> => {
  const { id } = ActivateWalletParams.parse({ id: parseInt(req.params.id) });
  await db.update(walletsTable).set({ isActive: false });
  const [wallet] = await db.update(walletsTable).set({ isActive: true }).where(eq(walletsTable.id, id)).returning();
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  res.json({ ...wallet, balanceSol: parseFloat(wallet.balanceSol), balanceUsdc: parseFloat(wallet.balanceUsdc) });
});

export default router;
