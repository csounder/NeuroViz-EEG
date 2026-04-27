"use client";

import * as React from "react";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ResearchMontageFigure } from "@/components/research/ResearchDeviceContextPanel";
import type { ResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { isEegOnlyResearchHardware } from "@/lib/researchDeviceProfile";

function ResearchTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-zinc-100">{value}</div>
    </div>
  );
}

export function ResearchSessionHeaderCard({
  profile,
  source,
  deviceLabel,
  lastPacketAgeMs,
  packetCount,
  live,
  wsStatus,
}: {
  profile: ResearchDeviceProfile;
  source: string;
  deviceLabel: string;
  lastPacketAgeMs: number | null;
  packetCount: number;
  live: boolean;
  wsStatus: string;
}) {
  const eegOnly = isEegOnlyResearchHardware(profile);

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<FlaskConical className="h-4 w-4" />}
          description="Device-aware summary: montage, channel names, nominal sampling, and which modalities exist on this hardware path."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={live ? "emerald" : "rose"} dot>
                {live ? "Live" : wsStatus}
              </Badge>
              <Badge tone="indigo">{source}</Badge>
            </div>
          }
        >
          Research Mode
        </CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(200px,260px)_1fr]">
          <div className="flex justify-center lg:justify-start">
            <ResearchMontageFigure profile={profile} />
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ResearchTile label="Data source" value={source} />
              <ResearchTile label="Device" value={deviceLabel} />
              <ResearchTile label="Last packet" value={lastPacketAgeMs == null ? "--" : `${Math.round(lastPacketAgeMs)} ms`} />
              <ResearchTile label="Packets" value={packetCount} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-zinc-600">Modalities</span>
              <Badge tone="emerald">EEG 4ch</Badge>
              <Badge tone={profile.capabilities.imu ? "emerald" : "neutral"}>
                Motion {profile.capabilities.imu ? "· IMU" : "· N/A"}
              </Badge>
              <Badge tone={profile.capabilities.ppg ? "emerald" : "neutral"}>
                PPG {profile.capabilities.ppg ? "" : "· N/A"}
              </Badge>
              <Badge tone={profile.capabilities.fnirs ? "emerald" : "neutral"}>
                fNIRS {profile.capabilities.fnirs ? "" : "· N/A"}
              </Badge>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
              <span className="font-mono text-[10px] text-zinc-600">Channels in exports · </span>
              <span className="font-mono text-zinc-300">{profile.channelLabels.join(", ")}</span>
              <span className="text-zinc-600"> · nominal </span>
              <span className="font-mono text-emerald-200/90">{profile.nominalEegHz} Hz</span>
              {profile.fourChannelUiCeiling ? (
                <span className="block pt-1 text-amber-200/85">
                  Hardware may expose &gt;4 EEG channels; Research + in-browser recorder use the first four only — document
                  pin mapping.
                </span>
              ) : null}
              {eegOnly ? (
                <span className="block pt-1 text-zinc-600">
                  EEG-only path: PPG / fNIRS / IMU widgets are collapsed below — typical for Ganglion-class boards.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
