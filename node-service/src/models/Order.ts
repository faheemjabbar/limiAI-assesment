import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  _id: string;
  legacyPk: number;
  customerEmail: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  totalAmount: number;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  createdAt: Date;
  updatedAt: Date;
  syncedFromLegacy: boolean;
}

const OrderSchema = new Schema<IOrder>(
  {
    _id: { type: String, required: true },
    legacyPk: { type: Number, index: true },
    customerEmail: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    totalAmount: { type: Number, required: true },
    items: [{ productId: String, quantity: Number, unitPrice: Number }],
    syncedFromLegacy: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false }
);

export const Order = mongoose.model<IOrder>("Order", OrderSchema);
