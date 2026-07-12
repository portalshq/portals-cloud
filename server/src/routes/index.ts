import { Router, type IRouter } from "express";
import healthRouter from "./health";
import capabilitiesRouter from "./capabilities";

const router: IRouter = Router();

router.use(healthRouter);
router.use(capabilitiesRouter);

export default router;
