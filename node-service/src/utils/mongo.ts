import mongoose from "mongoose";
import { logger } from "./logger";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGO_URI ?? "mongodb://localhost:27017/orders_db";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info("Connected to MongoDB");
      mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
      return;
    } catch (err) {
      logger.warn(`MongoDB attempt ${attempt}/${MAX_RETRIES} failed:`, err);
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    }
  }
}
