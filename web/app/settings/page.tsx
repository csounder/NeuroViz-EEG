"use client";

import * as React from "react";
import { Cpu, HardDrive, Settings as SettingsIcon, TestTube2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { DeviceSelector } from "@/components/widgets/DeviceSelector";
import { useNeuroStore } from "@/lib/store";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const settings = useNeuroStore((s) => s.settings);
  const [busy, setBusy] = React.useState(false);

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
