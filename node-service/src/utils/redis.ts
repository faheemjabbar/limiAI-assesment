import { createClient, RedisClientType } from "redis";
import { logger } from "./logger";

let client: RedisClientType | null = null;

export async function connectRedis(): Promise<void> {
  client = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" }) as RedisClientType;

  client.on("error", (err) => logger.error("Redis error:", err));
  client.on("reconnecting", () => logger.warn("Redis reconnecting..."));

  await client.connect();
  logger.info("Connected to Redis");
}

export function getRedisClient(): RedisClientType {
  if (!client) throw new Error("Redis client not initialized");
  return client;
}
