import { Router } from "express";
import { listOrders, getOrder, updateOrderStatus } from "../controllers/orderController";

export const orderRouter = Router();

orderRouter.get("/", listOrders);
orderRouter.get("/:id", getOrder);
orderRouter.patch("/:id/status", updateOrderStatus);
