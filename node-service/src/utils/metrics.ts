import mongoose from "mongoose";
import axios from "axios";
import { getRedisClient } from "./redis";
import { logger } from "./logger";
import { Order } from "../models/Order";

export interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
}

export interface ServiceMetrics {
  timestamp: string;
  services: ServiceHealth[];
  orderStats: {
    total: number;
    byStatus: Record<string, number>;
  };
  syncStats: {
    synced: number;
    pending: number;
  };
  throughput: {
    ordersPerMinute: number;
  };
}

async function checkDjango(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const res = await axios.get(`${process.env.DJANGO_URL ?? "http://localhost:8000"}/health/`, { timeout: 3000 });
    return { name: "django-legacy", status: res.status === 200 ? "healthy" : "degraded", latencyMs: Date.now() - start };
  } catch {
    return { name: "django-legacy", status: "down", latencyMs: Date.now() - start };
  }
}

async function checkMongo(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    if (mongoose.connection.readyState !== 1) {
      return { name: "mongodb", status: "down", latencyMs: 0 };
    }
    await mongoose.connection.db!.command({ ping: 1 });
    return { name: "mongodb", status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { name: "mongodb", status: mongoose.connection.readyState === 2 ? "degraded" : "down", latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await getRedisClient().ping();
    return { name: "redis", status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { name: "redis", status: "down", latencyMs: Date.now() - start };
  }
}

export async function collectMetrics(): Promise<ServiceMetrics> {
  const [djangoHealth, mongoHealth, redisHealth] = await Promise.all([
    checkDjango(),
    checkMongo(),
    checkRedis(),
  ]);

  let orderStats = { total: 0, byStatus: {} as Record<string, number> };
  let syncStats = { synced: 0, pending: 0 };

  try {
    const pipeline = await Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
    pipeline.forEach(({ _id, count }) => {
      orderStats.byStatus[_id] = count;
      orderStats.total += count;
    });

    syncStats.synced = await Order.countDocuments({ syncedFromLegacy: true });

    try {
      const { data } = await axios.get<{ pending_sync: number }>(
        `${process.env.DJANGO_URL ?? "http://localhost:8000"}/api/v1/sync/status/`,
        { timeout: 3000 }
      );
      syncStats.pending = data.pending_sync ?? 0;
    } catch {
      syncStats.pending = await Order.countDocuments({ syncedFromLegacy: false });
    }
  } catch (err) {
    logger.warn("Could not collect order stats:", err);
  }

  let ordersPerMinute = 0;
  try {
    ordersPerMinute = await Order.countDocuments({ createdAt: { $gte: new Date(Date.now() - 60_000) } });
  } catch { /* non-fatal */ }

  return {
    timestamp: new Date().toISOString(),
    services: [djangoHealth, mongoHealth, redisHealth],
    orderStats,
    syncStats,
    throughput: { ordersPerMinute },
  };
}
