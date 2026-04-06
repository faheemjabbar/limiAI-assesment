"use client";

interface OrderStats {
  total: number;
  byStatus: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  processing: "bg-blue-500",
  shipped: "bg-purple-500",
  delivered: "bg-emerald-500",
  cancelled: "bg-red-500",
};

export function OrderStatusPanel({ stats }: { stats: OrderStats | null }) {
  if (!stats) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-4" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const entries = Object.entries(stats.byStatus).sort(([, a], [, b]) => b - a);

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-gray-500 uppercase tracking-widest">Order Status Breakdown</h2>
        <span className="text-xs text-gray-400 tabular-nums">{stats.total} total</span>
      </div>
      <div className="space-y-2.5">
        {entries.length === 0 ? (
          <p className="text-xs text-gray-600">No orders yet</p>
        ) : (
          entries.map(([status, count]) => {
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <div key={status}>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span className="capitalize">{status}</span>
                  <span className="tabular-nums">{count} ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${STATUS_COLORS[status] ?? "bg-gray-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
