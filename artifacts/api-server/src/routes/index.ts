import { Router, type IRouter } from "express";
import healthRouter from "./health";
import transfersRouter from "./transfers";
import storageRouter from "./storage";
import passphraseRouter from "./passphrase";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(transfersRouter);
router.use(passphraseRouter);
router.use(analyticsRouter);

export default router;
