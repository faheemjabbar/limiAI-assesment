import axios from "axios";
import { Order } from "../models/Order";
import { emitSyncProgress } from "../controllers/socketController";
import { logger } from "./logger";

const DJANGO_URL = process.env.DJANGO_URL ?? "http://localhost:8000";
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? "10000", 10);
const BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE ?? "50", 10);

interface DjangoOrder {
  id: number;
  external_id: string;
  customer_email: string;
  status: string;
  total_amount: string;
  created_at: string;
  updated_at: string;
}

async function syncBatch(): Promise<void> {
  const { data } = await axios.get<{ count: number; results: DjangoOrder[] }>(
    `${DJANGO_URL}/api/v1/sync/unsynced/`,
    { params: { limit: BATCH_SIZE }, timeout: 10_000 }
  );

  if (data.results.length === 0) return;

  logger.info(`Syncing ${data.results.length} orders → MongoDB`);

  type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  const validStatuses: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

  const bulkOps = data.results.map((order) => ({
    updateOne: {
      filter: { _id: order.external_id },
      update: {
        $set: {
          legacyPk: order.id,
          customerEmail: order.customer_email,
          status: validStatuses.includes(order.status as OrderStatus)
            ? (order.status as OrderStatus)
            : "pending" as OrderStatus,
          totalAmount: parseFloat(order.total_amount),
          syncedFromLegacy: true,
          updatedAt: new Date(order.updated_at),
          createdAt: new Date(order.created_at),
        },
      },
      upsert: true,
    },
  }));

  await Order.bulkWrite(bulkOps, { ordered: false });

  try {
    await axios.post(
      `${DJANGO_URL}/api/v1/sync/mark-synced/`,
      { order_ids: data.results.map((o) => o.id) },
      { timeout: 10_000 }
    );
  } catch (err) {
    logger.warn("mark-synced failed (will retry next cycle):", err);
  }

  const [synced, pending] = await Promise.all([
    Order.countDocuments({ syncedFromLegacy: true }),
    Order.countDocuments({ syncedFromLegacy: false }),
  ]);

  emitSyncProgress({ synced, pending, lastBatchSize: data.results.length });
  logger.info(`Sync done. synced=${synced} pending=${pending}`);
}

export function startSyncWorker(): void {
  logger.info(`Sync worker started (interval=${SYNC_INTERVAL_MS}ms, batch=${BATCH_SIZE})`);

  const run = async () => {
    try {
      await syncBatch();
    } catch (err) {
      logger.warn("Sync batch failed (will retry):", err);
    }
  };

  run();
  setInterval(run, SYNC_INTERVAL_MS);
}
