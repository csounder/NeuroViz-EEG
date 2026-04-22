"use client";

import { Gauge, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { useNeuroStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";

export default function StatsPage() {
  const {
    wsStatus,
    lastMessageAt,
    packetCount,
    deviceName,
    batteryPct,
    touching,
    bufferLen,
    historyLen,
    latestEEG,
  } = useNeuroStore(
    useShallow((s) => ({
      wsStatus: s.wsStatus,
      lastMessageAt: s.lastMessageAt,
      packetCount: s.packetCount,
      deviceName: s.deviceName,
      batteryPct: s.batteryPct,
      touching: s.touching,
      bufferLen: s.rollingRaw[0]?.length ?? 0,
      historyLen: s.bandHistory.length,
      latestEEG: s.latestEEG,
    })),
  );

  const latency = lastMessageAt !== null ? Date.now() - lastMessageAt : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Gauge className="h-4 w-4" />}
            description="Live pipeline health — server → WebSocket → UI"
          >
            Performance
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat
              label="WS status"
              icon={<Zap className="h-4 w-4" />}
              value={wsStatus}
            />
            <Stat
              label="Latency"
              value={latency !== null ? `${latency} ms` : "—"}
              hint="Since last message"
            />
            <Stat
              label="Packet count"
              value={packetCount.toLocaleString()}
            />
            <Stat label="Device" value={deviceName ?? "—"} />
            <Stat
              label="Raw buffer"
              value={`${bufferLen} samples`}
              hint="per channel, rolling"
            />
            <Stat
              label="Band history"
              value={`${historyLen} pts`}
              hint="60s @ 10Hz"
            />
            <Stat
              label="Battery"
              value={
                batteryPct !== null ? `${Math.round(batteryPct)}%` : "—"
              }
            />
            <Stat
              label="Touching"
              value={touching === null ? "—" : touching ? "Yes" : "No"}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Raw debug snapshot — latest EEG payload">
            Last EEG payload
          </CardTitle>
        </CardHeader>
        <CardBody>
          <pre className="scroll-thin max-h-96 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-4 font-mono text-[11px] leading-5 text-zinc-300">
            {latestEEG
              ? JSON.stringify(
                  {
                    timestamp: latestEEG.timestamp,
                    deviceName: latestEEG.deviceName,
                    raw: latestEEG.raw?.map((v) => formatNumber(v, 2)),
                    stats: latestEEG.stats,
                    hasFft: Boolean(latestEEG.fft),
                  },
                  null,
                  2,
                )
              : "— no data yet —"}
          </pre>
        </CardBody>
      </Card>
    </div>
  );
}
