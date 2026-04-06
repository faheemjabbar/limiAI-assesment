import "dotenv/config";
import http from "http";
import { app } from "./app";
import { initSocketServer } from "./controllers/socketController";
import { connectMongo } from "./utils/mongo";
import { connectRedis } from "./utils/redis";
import { startSyncWorker } from "./utils/syncWorker";
import { logger } from "./utils/logger";

const PORT = parseInt(process.env.PORT ?? "4000", 10);

async function bootstrap(): Promise<void> {
  await connectMongo();
  await connectRedis();

  const httpServer = http.createServer(app);
  initSocketServer(httpServer);
  startSyncWorker();

  httpServer.listen(PORT, () => {
    logger.info(`Node.js microservice running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to start service:", err);
  process.exit(1);
});
