"use client";

import * as React from "react";
import { Bluetooth, Check, Loader2, RefreshCw, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function DeviceSelector() {
  const { devices, activeDeviceName, settings } = useNeuroStore(
    useShallow((s) => ({
      devices: s.devices,
      activeDeviceName: s.activeDeviceName,
      settings: s.settings,
    })),
  );

  const [busy, setBusy] = React.useState(false);
  const [connecting, setConnecting] = React.useState<string | null>(null);

  async function rescan() {
    setBusy(true);
    try {
      await api.ports().catch(() => {});
      await api.devices().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function connect(index: number, name: string) {
    setConnecting(name);
    try {
      await api.connectIndex(index);
      useNeuroStore.getState().setActiveDevice(name);
    } finally {
      setConnecting(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Bluetooth className="h-4 w-4 text-zinc-500" />
          {devices.length
            ? `${devices.length} device${devices.length > 1 ? "s" : ""} nearby`
            : "No devices detected"}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={rescan}
          disabled={busy}
          leftIcon={
            busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
        >
          Rescan
        </Button>
      </div>

      <div className="space-y-1.5">
        {devices.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
            {settings.simulatorMode
              ? "Simulator is active — streaming synthetic EEG."
              : "Power on your Muse / OpenBCI device, then rescan."}
          </div>
        )}

        {devices.map((device, idx) => {
          const active = activeDeviceName === device.name;
          return (
            <button
              key={device.name}
              onClick={() => connect(idx, device.name)}
              disabled={connecting !== null}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Zap
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      active ? "text-emerald-400" : "text-zinc-500",
                    )}
                  />
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {device.displayName ?? device.name}
                  </div>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  {device.specs?.name && <span>{device.specs.name}</span>}
                  {device.specs?.eegChannels && (
                    <span>{device.specs.eegChannels}ch</span>
                  )}
                  {device.specs?.eegSampleRate && (
                    <span>{device.specs.eegSampleRate}Hz</span>
                  )}
                  {device.rssi != null && <span>{device.rssi} dBm</span>}
                </div>
              </div>
              <div className="shrink-0">
                {connecting === device.name ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                ) : active ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <span className="font-mono text-[11px] text-zinc-500">
                    Connect
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
