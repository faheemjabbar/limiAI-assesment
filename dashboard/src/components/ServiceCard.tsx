"use client";

interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
}

const STATUS_STYLES = {
  healthy: {
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    badge: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50",
    border: "border-emerald-800/30",
  },
  degraded: {
    dot: "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.7)]",
    badge: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50",
    border: "border-yellow-800/30",
  },
  down: {
    dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]",
    badge: "bg-red-900/40 text-red-300 border border-red-700/50",
    border: "border-red-800/30",
  },
};

const SERVICE_LABELS: Record<string, string> = {
  "django-legacy": "Django (Legacy)",
  mongodb: "MongoDB",
  redis: "Redis",
};

function ServiceCardComponent({ service }: { service: ServiceHealth }) {
  const styles = STATUS_STYLES[service.status];

  return (
    <div
      className={`rounded-xl bg-gray-900 border ${styles.border} p-4 flex items-start justify-between transition-all`}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${styles.dot} animate-pulse`} />
          <span className="text-sm font-medium text-gray-200">
            {SERVICE_LABELS[service.name] ?? service.name}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${styles.badge} capitalize`}>
          {service.status}
        </span>
      </div>
      <div className="text-right">
        <p className="text-xl font-semibold tabular-nums text-gray-100">
          {service.latencyMs}
          <span className="text-xs text-gray-500 font-normal ml-0.5">ms</span>
        </p>
        <p className="text-xs text-gray-500">latency</p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-800 rounded w-1/3" />
    </div>
  );
}

export const ServiceCard = Object.assign(ServiceCardComponent, { Skeleton });
