import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { walletsTable, settingsTable } from "@workspace/db";
import { BOT_WALLET_ADDRESS, BOT_WALLET_PRIVATE_KEY } from "./lib/walletConfig";

process.on("unhandledRejection", (reason) => {
  console.error("[CRASH] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[CRASH] Uncaught exception:", err);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seed() {
  const wallets = await db.select().from(walletsTable);
  if (wallets.length === 0) {
    await db.insert(walletsTable).values({
      name: "Bot Wallet",
      address: BOT_WALLET_ADDRESS,
      privateKey: BOT_WALLET_PRIVATE_KEY,
      balanceSol: "0",
      balanceUsdc: "0",
      isActive: true,
    });
    logger.info("Seeded bot wallet");
  }

  const settings = await db.select().from(settingsTable);
  if (settings.length === 0) {
    await db.insert(settingsTable).values({});
    logger.info("Seeded default settings");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  await seed();
});
