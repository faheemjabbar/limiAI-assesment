"use client";

import type { SyncProgress } from "@/hooks/useSocket";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";

interface SyncStats {
  synced: number;
  pending: number;
}

interface Props {
  syncStats: SyncStats | null;
  syncProgress: SyncProgress | null;
}

export function SyncPanel({ syncStats, syncProgress }: Props) {
  // Prefer syncProgress (emitted by the worker — accurate pending count from Django)
  // Fall back to syncStats from metrics when no sync has run yet
  const synced = syncProgress?.synced ?? syncStats?.synced ?? 0;
  const pending = syncProgress?.pending ?? syncStats?.pending ?? 0;
  const total = synced + pending;
  const pct = total > 0 ? Math.round((synced / total) * 100) : 0;

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      {/* Pipeline diagram */}
      <div className="flex items-center justify-center gap-4 mb-5 text-xs text-gray-400">
        <div className="flex flex-col items-center gap-1">
          <div className="px-3 py-2 rounded-lg bg-blue-900/40 border border-blue-700/40 text-blue-300 font-medium">
            PostgreSQL
          </div>
          <span className="text-gray-600">Django Legacy</span>
        </div>
        <div className="flex items-center gap-1 text-emerald-500">
          <div className="w-8 h-px bg-emerald-700" />
          <ArrowRight size={14} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="px-3 py-2 rounded-lg bg-purple-900/40 border border-purple-700/40 text-purple-300 font-medium">
            Sync Worker
          </div>
          <span className="text-gray-600">Node.js</span>
        </div>
        <div className="flex items-center gap-1 text-emerald-500">
          <div className="w-8 h-px bg-emerald-700" />
          <ArrowRight size={14} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="px-3 py-2 rounded-lg bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 font-medium">
            MongoDB
          </div>
          <span className="text-gray-600">New Service</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>Migration Progress</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <StatTile
          icon={<CheckCircle2 size={14} className="text-emerald-400" />}
          label="Synced"
          value={synced || "—"}
          color="text-emerald-300"
        />
        <StatTile
          icon={<Clock size={14} className="text-yellow-400" />}
          label="Pending"
          value={pending || "—"}
          color="text-yellow-300"
        />
        <StatTile
          icon={<ArrowRight size={14} className="text-blue-400" />}
          label="Last Batch"
          value={syncProgress?.lastBatchSize ?? "—"}
          color="text-blue-300"
        />
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-gray-800/60 p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
