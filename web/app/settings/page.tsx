"use client";

import * as React from "react";
import {
  Bluetooth,
  Cpu,
  HardDrive,
  Settings as SettingsIcon,
  TestTube2,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { DeviceSelector } from "@/components/widgets/DeviceSelector";
import { useNeuroStore } from "@/lib/store";
import { api, type BridgeInfo } from "@/lib/api";

export default function SettingsPage() {
  const settings = useNeuroStore((s) => s.settings);
  const [busy, setBusy] = React.useState(false);
  const [bridgeBusy, setBridgeBusy] = React.useState(false);
  const [bridgeInfo, setBridgeInfo] = React.useState<BridgeInfo | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .getBridge()
      .then((b) => {
        if (!cancelled) setBridgeInfo(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSim = async () => {
    setBusy(true);
    try {
      await api.useSimulator(!settings.simulatorMode);
    } catch {
      await api.toggleSimulator().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle
            icon={<HardDrive className="h-4 w-4" />}
            description="Pair with Muse (2 / S / Athena), OpenBCI Ganglion or Ultracortex"
          >
            Devices
          </CardTitle>
        </CardHeader>
        <CardBody>
          <DeviceSelector />
        </CardBody>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle
              icon={<TestTube2 className="h-4 w-4" />}
              description="Explore without hardware"
            >
              Simulator
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Toggle
              checked={Boolean(settings.simulatorMode)}
              onCheckedChange={() => toggleSim()}
              disabled={busy}
              label="Enable simulator"
              hint="Generates synthetic 4-channel EEG with realistic band structure. Ideal for demos, UI testing, and OSC plumbing checks."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              icon={<Bluetooth className="h-4 w-4" />}
              description="Switch without restarting Node. Swift = LibMuse (Muse 2/3/S). Athena = Python BLE for Muse S Athena (273e0013) only."
            >
              Muse BLE backend
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500" htmlFor="bridge-mode">
                Active bridge
              </label>
              <select
                id="bridge-mode"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500"
                disabled={bridgeBusy || !bridgeInfo}
                value={bridgeInfo?.bridgeMode ?? "swift"}
                onChange={async (e) => {
                  const mode = e.target.value === "athena" ? "athena" : "swift";
                  setBridgeBusy(true);
                  try {
                    await api.setBridgeMode(mode);
                    const b = await api.getBridge();
                    setBridgeInfo(b);
                  } catch {
                  } finally {
                    setBridgeBusy(false);
                  }
                }}
              >
                <option value="swift">Swift (LibMuse) — Muse 2, Muse 3, Muse S, …</option>
                <option value="athena">Python (Athena) — Muse S Athena direct BLE</option>
              </select>
            </div>
            {bridgeInfo ? (
              <p className="text-xs leading-relaxed text-zinc-500">
                <span className="text-zinc-400">{bridgeInfo.label}</span>
                <br />
                Muse-33xx / Muse 2: {bridgeInfo.muse2Class} Athena headset:{" "}
                {bridgeInfo.athenaClass}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              icon={<Cpu className="h-4 w-4" />}
              description="Backend process info"
            >
              Backend
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row k="HTTP port" v="3000" />
            <Row k="WebSocket port" v="8080" />
            <Row k="OSC host" v={settings.oscHost ?? "127.0.0.1"} />
            <Row k="OSC port" v={String(settings.oscPort ?? 7400)} />
            <Row k="OSC prefix" v={settings.oscPrefix ?? "/muse"} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              icon={<SettingsIcon className="h-4 w-4" />}
              description="What you're looking at"
            >
              About
            </CardTitle>
          </CardHeader>
          <CardBody className="text-sm text-zinc-400">
            <p>
              NeuroVis is a real-time EEG dashboard built on a Node backend
              (<code className="text-zinc-300">server-enhanced.js</code>) with a
              Next.js frontend. This new interface connects to the same server
              over WebSocket on port 8080 and the REST API on 3000.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/60 py-1.5 last:border-0">
      <span className="text-xs text-zinc-500">{k}</span>
      <span className="font-mono text-xs tabular-nums text-zinc-200">{v}</span>
    </div>
  );
}
