import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { logger } from "../utils/logger";
import { collectMetrics, ServiceMetrics } from "../utils/metrics";

const METRICS_INTERVAL_MS = parseInt(process.env.METRICS_INTERVAL_MS ?? "5000", 10);

let io: SocketServer | null = null;

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.io server not initialized");
  return io;
}

export function initSocketServer(httpServer: HttpServer): void {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.DASHBOARD_URL ?? "http://localhost:3000",
      methods: ["GET", "POST"],
    },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  io.on("connection", (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    collectMetrics().then((metrics) => {
      socket.emit("metrics:snapshot", metrics);
    });

    socket.on("disconnect", (reason) => {
      logger.warn(`Client disconnected (${socket.id}): ${reason}`);
    });

    socket.on("metrics:request", async () => {
      const metrics = await collectMetrics();
      socket.emit("metrics:snapshot", metrics);
    });
  });

  setInterval(async () => {
    if (!io) return;
    try {
      const metrics: ServiceMetrics = await collectMetrics();
      io.emit("metrics:update", metrics);
    } catch (err) {
      logger.error("Failed to collect metrics:", err);
    }
  }, METRICS_INTERVAL_MS);

  logger.info("Socket.io server initialized");
}

export function emitOrderStatusChange(payload: {
  orderId: string;
  status: string;
  customerEmail: string;
}): void {
  getIO().emit("order:statusChanged", payload);
}

export function emitSyncProgress(payload: {
  synced: number;
  pending: number;
  lastBatchSize: number;
}): void {
  getIO().emit("sync:progress", payload);
}
