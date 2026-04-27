"use client";

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "./store";
import type { ServerMessage } from "./types";

// Module-level singleton so any component can call `wsSend(...)` without
// re-opening a socket. `useNeuroVisSocket` (mounted once inside AppShell)
// creates and owns the actual WebSocket.
let activeSocket: WebSocket | null = null;

/** Send a JSON message over the app-wide WebSocket (best-effort, no-op when closed). */
export function wsSend(data: unknown): boolean {
  const ws = activeSocket;
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(typeof data === "string" ? data : JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** true when the app's WebSocket is currently OPEN. */
export function isWsOpen(): boolean {
  return activeSocket !== null && activeSocket.readyState === WebSocket.OPEN;
}

/**
 * Opens the NeuroVis WebSocket (ws://localhost:8080) and keeps the zustand
 * store in sync. Auto-reconnects with exponential backoff. Mount this ONCE,
 * high in the tree (AppShell does).
 */
export function useNeuroVisSocket() {
  const { wsUrl, wsReconnectEpoch, setWsStatus, ingest } = useNeuroStore(
    useShallow((s) => ({
      wsUrl: s.wsUrl,
      wsReconnectEpoch: s.wsReconnectEpoch,
      setWsStatus: s.setWsStatus,
      ingest: s.ingest,
    })),
  );

  const wsRef = useRef<WebSocket | null>(null);
  const closedByUserRef = useRef(false);
  const retryRef = useRef(0);

  useEffect(() => {
    closedByUserRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setWsStatus("connecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setWsStatus("error");
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      activeSocket = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setWsStatus("open");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerMessage;
          ingest(msg);
        } catch {
          // ignore non-JSON frames
        }
      };
      ws.onerror = () => {
        setWsStatus("error");
      };
      ws.onclose = () => {
        setWsStatus("closed");
        if (activeSocket === ws) activeSocket = null;
        if (!closedByUserRef.current) scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      retryRef.current = Math.min(retryRef.current + 1, 6);
      const delay = Math.min(1000 * 2 ** retryRef.current, 10_000);
      timer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedByUserRef.current = true;
      if (timer) clearTimeout(timer);
      try {
        wsRef.current?.close();
      } catch {}
      if (activeSocket === wsRef.current) activeSocket = null;
      wsRef.current = null;
    };
  }, [wsUrl, wsReconnectEpoch, setWsStatus, ingest]);

  return {
    send: (data: unknown) => wsSend(data),
  };
}
