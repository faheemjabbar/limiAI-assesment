import { Request, Response, NextFunction } from "express";
import { Order } from "../models/Order";
import { emitOrderStatusChange } from "./socketController";
import { logger } from "../utils/logger";

const VALID_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

export async function listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string ?? "1",  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? "20", 10) || 20));
    const status = req.query.status as string | undefined;

    const filter = status ? { status } : {};
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    res.json({ total, page, limit, results: orders });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = req.body as { status: string };

    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    emitOrderStatusChange({
      orderId: String(order._id),
      status: order.status,
      customerEmail: order.customerEmail,
    });

    logger.info(`Order ${order._id} status → ${status}`);
    res.json(order);
  } catch (err) {
    next(err);
  }
}
