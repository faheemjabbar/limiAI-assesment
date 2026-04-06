import { Router, Request, Response } from "express";
import { collectMetrics } from "../utils/metrics";

export const metricsRouter = Router();

metricsRouter.get("/", async (_req: Request, res: Response) => {
  const metrics = await collectMetrics();
  res.json(metrics);
});
