import express from "express";
import cors from "cors";
import { orderRouter } from "./routes/orderRoutes";
import { metricsRouter } from "./routes/metricsRoutes";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(cors({
  origin: [
    process.env.DASHBOARD_URL ?? "http://localhost:3000",
    "http://localhost:8000",
  ],
  credentials: true,
}));
app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ service: "node-microservice", status: "healthy" });
});

app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/metrics", metricsRouter);

app.use(errorHandler);
