"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ServiceMetrics } from "@/hooks/useSocket";

interface Props {
  history: ServiceMetrics[];
}

export function ThroughputChart({ history }: Props) {
  const data = history.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    ordersPerMinute: m.throughput.ordersPerMinute,
  }));

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-4">
        Orders / Minute (throughput)
      </h2>
      {data.length < 2 ? (
        <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
          Collecting data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: "#111827",
                border: "1px solid #374151",
                borderRadius: 8,
                color: "#f3f4f6",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="ordersPerMinute"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              name="Orders/min"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
