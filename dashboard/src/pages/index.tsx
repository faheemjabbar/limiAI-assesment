"use client";

import { useSocket } from "@/hooks/useSocket";
import { ServiceCard } from "@/components/ServiceCard";
import { SyncPanel } from "@/components/SyncPanel";
import { ThroughputChart } from "@/components/ThroughputChart";
import { OrderStatusPanel } from "@/components/OrderStatusPanel";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Activity, RefreshCw } from "lucide-react";

const NODE_SERVICE_URL = process.env.NEXT_PUBLIC_NODE_SERVICE_URL ?? "http://localhost:4000";

export default function DashboardPage() {
  const { status, metrics, syncProgress, metricsHistory, manualReconnect, requestRefresh } =
    useSocket(NODE_SERVICE_URL);

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="text-emerald-400" size={22} />
          <h1 className="text-lg font-semibold tracking-tight">
            Hybrid Systems <span className="text-emerald-400">Monitor</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {metrics && (
            <span className="text-xs text-gray-500">
              Last update:{" "}
              {new Date(metrics.timestamp).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={requestRefresh}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-emerald-400 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </header>

      {/* Connection banner */}
      <ConnectionBanner status={status} onReconnect={manualReconnect} />

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Service Health Row */}
        <section>
          <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">
            Service Health
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {metrics?.services.map((svc) => (
              <ServiceCard key={svc.name} service={svc} />
            )) ?? (
              <>
                <ServiceCard.Skeleton />
                <ServiceCard.Skeleton />
                <ServiceCard.Skeleton />
              </>
            )}
          </div>
        </section>

        {/* Charts Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ThroughputChart history={metricsHistory} />
          <OrderStatusPanel stats={metrics?.orderStats ?? null} />
        </section>

        {/* Sync Pipeline */}
        <section>
          <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">
            Migration Sync Pipeline · PostgreSQL → MongoDB
          </h2>
          <SyncPanel
            syncStats={metrics?.syncStats ?? null}
            syncProgress={syncProgress}
          />
        </section>
      </div>
    </main>
  );
}
