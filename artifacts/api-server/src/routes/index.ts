import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import walletsRouter from "./wallets";
import positionsRouter from "./positions";
import tradesRouter from "./trades";
import snipersRouter from "./snipers";
import copyTradesRouter from "./copyTrades";
import limitOrdersRouter from "./limitOrders";
import dcaRouter from "./dca";
import settingsRouter from "./settings";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/dashboard", dashboardRouter);
router.use("/wallets", walletsRouter);
router.use("/positions", positionsRouter);
router.use("/trades", tradesRouter);
router.use("/snipers", snipersRouter);
router.use("/copy-trades", copyTradesRouter);
router.use("/limit-orders", limitOrdersRouter);
router.use("/dca", dcaRouter);
router.use("/settings", settingsRouter);
router.use("/notifications", notificationsRouter);

export default router;
