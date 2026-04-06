"use client";

import type { ConnectionStatus } from "@/hooks/useSocket";
import { Wifi, WifiOff, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  status: ConnectionStatus;
  onReconnect: () => void;
}

const BANNER_CONFIG = {
  connected: null, // no banner when healthy
  connecting: {
    bg: "bg-blue-900/60 border-blue-700/50",
    icon: <Loader2 size={14} className="animate-spin text-blue-300" />,
    text: "Connecting to live data stream…",
    textColor: "text-blue-200",
  },
  reconnecting: {
    bg: "bg-yellow-900/60 border-yellow-700/50",
    icon: <Loader2 size={14} className="animate-spin text-yellow-300" />,
    text: "Connection lost — reconnecting…",
    textColor: "text-yellow-200",
  },
  disconnected: {
    bg: "bg-gray-800/80 border-gray-700/50",
    icon: <WifiOff size={14} className="text-gray-400" />,
    text: "Disconnected from live stream. Data may be stale.",
    textColor: "text-gray-300",
  },
  error: {
    bg: "bg-red-900/60 border-red-700/50",
    icon: <AlertTriangle size={14} className="text-red-300" />,
    text: "Unable to connect after multiple attempts.",
    textColor: "text-red-200",
  },
};

export function ConnectionBanner({ status, onReconnect }: Props) {
  const config = BANNER_CONFIG[status];
  if (!config) return null;

  return (
    <div
      className={`flex items-center justify-between px-6 py-2 border-b ${config.bg} text-xs`}
    >
      <div className={`flex items-center gap-2 ${config.textColor}`}>
        {config.icon}
        <span>{config.text}</span>
      </div>
      {(status === "disconnected" || status === "error") && (
        <button
          onClick={onReconnect}
          className="flex items-center gap-1.5 text-xs text-white bg-emerald-700 hover:bg-emerald-600 px-3 py-1 rounded-md transition-colors"
        >
          <Wifi size={12} />
          Reconnect
        </button>
      )}
    </div>
  );
}
