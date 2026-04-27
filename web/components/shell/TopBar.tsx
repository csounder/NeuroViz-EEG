"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BatteryFull,
  FlaskConical,
  Menu,
  Play,
  RefreshCw,
  RotateCcw,
  SignalHigh,
  Square,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { clientSim } from "@/lib/clientSim";
import { api } from "@/lib/api";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/raw": "Raw EEG",
  "/bands": "Band Powers",
  "/fft": "FFT Spectrum",
  "/fft-bands": "FFT + Bands",
  "/bands-combined": "Combined Bands",
  "/bands-multichannel": "Multichannel Bands",
  "/waterfall": "3D Waterfall",
  "/dual": "Dual View",
  "/quad": "Quad View",
  "/brain-state": "Brain State",
  "/simulator": "Simulator",
  "/recordings": "Recordings",
  "/dsp": "DSP Pipeline",
  "/osc": "OSC Monitor",
  "/stats": "Performance Stats",
  "/settings": "Settings",
  "/openbci-time-series": "OpenBCI-style TS",
  "/butterfly": "Butterfly EEG",
  "/spectrogram": "Spectrogram",
  "/muselab": "MuseLab-style",
  "/fft-smoothed": "Smoothed FFT",
  "/mind-monitor": "Mind Monitor",
};

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname() ?? "/";
  const title = TITLES[pathname] || "NeuroVis";

  const {
    wsStatus,
    batteryPct,
    deviceName,
    settings,
    packetCount,
    simRunning,
    requestWsReconnect,
  } = useNeuroStore(
    useShallow((s) => ({
      wsStatus: s.wsStatus,
      batteryPct: s.batteryPct,
      deviceName: s.deviceName,
      settings: s.settings,
      packetCount: s.packetCount,
      simRunning: s.clientSim.running,
      requestWsReconnect: s.requestWsReconnect,
    })),
  );

  const connectionTone =
    wsStatus === "open"
      ? "emerald"
      : wsStatus === "connecting"
        ? "amber"
        : "rose";
  const connectionLabel =
    wsStatus === "open"
      ? "Live"
      : wsStatus === "connecting"
        ? "Connecting"
        : wsStatus === "closed"
          ? "Offline"
          : wsStatus === "error"
            ? "Error"
            : "Idle";

  const activeSource =
    deviceName ??
    (simRunning || settings.simulatorMode ? "Simulator" : "No device");

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/70 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <button
        onClick={onOpenMenu}
        className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-col">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          NeuroVis
        </div>
        <h1 className="-mt-0.5 truncate text-sm font-medium text-zinc-100">
          {title}
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => requestWsReconnect()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-400"
            title="Reconnect WebSocket — close and open a fresh connection to the backend (ws://)"
            aria-label="Reconnect WebSocket"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Reload app — full page refresh in this browser tab (same as the browser reload button)"
            aria-label="Reload page"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        <SimulatorToggle
          simRunning={simRunning}
          serverSimRunning={Boolean(settings.simulatorMode)}
          wsOpen={wsStatus === "open"}
        />
        <Badge tone={connectionTone as any} dot>
          {connectionLabel}
        </Badge>

        <div className="hidden items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 sm:flex">
          <SignalHigh
            className={cn(
              "h-3.5 w-3.5",
              wsStatus === "open" ? "text-emerald-400" : "text-zinc-500",
            )}
          />
          <span className="font-mono text-[11px] text-zinc-300">
            {activeSource}
          </span>
          <span className="font-mono text-[11px] text-zinc-600">·</span>
          <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
            {packetCount.toLocaleString()} pkts
          </span>
        </div>

        {batteryPct !== null && (
          <div
            className="hidden items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-300 sm:flex"
            title="Device battery"
          >
            <BatteryFull
              className={cn(
                "h-3.5 w-3.5",
                batteryPct > 40
                  ? "text-emerald-400"
                  : batteryPct > 15
                    ? "text-amber-400"
                    : "text-rose-400",
              )}
            />
            {Math.round(batteryPct)}%
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * Global simulator start/stop button reachable from every screen.
 *
 * - When a simulator (browser or server) is running, shows a red STOP button
 *   plus a pulsing "SIM" / "SIM·S" chip that jumps to the Simulator page.
 * - When nothing is running, shows a green START button. Clicking it starts
 *   the browser-side simulator. OSC relay to :7400 still needs WebSocket open;
 *   charts and local state work without the backend.
 * - If the server-side sim is on for any reason, STOP stops both.
 */
function SimulatorToggle({
  simRunning,
  serverSimRunning,
  wsOpen,
}: {
  simRunning: boolean;
  serverSimRunning: boolean;
  wsOpen: boolean;
}) {
  const anyRunning = simRunning || serverSimRunning;
  const [busy, setBusy] = React.useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Keep it simple for one-click use: start the browser sim at default
      // settings (bands + profile = relaxed). Make sure server-side is off so
      // two streams don't race.
      await api.useSimulator(false).catch(() => {});
      await api.setDspConfig({ oscSending: true }).catch(() => {});
      clientSim.start();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      clientSim.stop();
      if (serverSimRunning) {
        await api.useSimulator(false).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {anyRunning ? (
        <button
          type="button"
          onClick={stop}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          title="Stop simulator"
        >
          <Square className="h-3 w-3" />
          Stop sim
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            !wsOpen
              ? "Start browser simulator — charts run in the browser; open ws:// backend for OSC relay to UDP"
              : "Start browser simulator (OSC relay via WebSocket when enabled)"
          }
        >
          <Play className="h-3 w-3" />
          Start sim
        </button>
      )}

      {anyRunning && (
        <Link
          href="/simulator"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-500/20"
          title={
            simRunning
              ? "Browser simulator is running — open the Simulator page"
              : "Server-side simulator is running — open the Simulator page"
          }
        >
          <FlaskConical className="h-3 w-3 animate-pulse" />
          {simRunning ? "SIM" : "SIM·S"}
        </Link>
      )}
    </div>
  );
}
