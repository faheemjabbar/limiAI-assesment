"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface ServiceMetrics {
  timestamp: string;
  services: Array<{
    name: string;
    status: "healthy" | "degraded" | "down";
    latencyMs: number;
  }>;
  orderStats: {
    total: number;
    byStatus: Record<string, number>;
  };
  syncStats: {
    synced: number;
    pending: number;
  };
  throughput: {
    ordersPerMinute: number;
  };
}

export interface SyncProgress {
  synced: number;
  pending: number;
  lastBatchSize: number;
}

export function useSocket(url: string) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<ServiceMetrics[]>([]);

  const connect = useCallback(() => {
    if (socketRef.current) return;

    const socket = io(url, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });

    socketRef.current = socket;
    setStatus("connecting");

    socket.on("connect", () => setStatus("connected"));

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        socketRef.current = null;
        setStatus("disconnected");
      } else {
        setStatus("reconnecting");
      }
    });

    socket.on("connect_error", () => setStatus("reconnecting"));
    socket.io.on("reconnect_failed", () => setStatus("error"));
    socket.io.on("reconnect", () => setStatus("connected"));

    const updateMetrics = (data: ServiceMetrics) => {
      setMetrics(data);
      setMetricsHistory((prev) => [...prev.slice(-29), data]);
    };

    socket.on("metrics:snapshot", updateMetrics);
    socket.on("metrics:update", updateMetrics);
    socket.on("sync:progress", (data: SyncProgress) => setSyncProgress(data));
  }, [url]);

  const manualReconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    connect();
  }, [connect]);

  const requestRefresh = useCallback(() => {
    socketRef.current?.emit("metrics:request");
  }, []);

  useEffect(() => {
    connect();
    return () => { socketRef.current?.disconnect(); };
  }, [connect]);

  return { status, metrics, syncProgress, metricsHistory, manualReconnect, requestRefresh };
}
