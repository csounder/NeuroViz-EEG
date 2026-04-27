"use client";

import * as React from "react";
import { BookOpen, Radio, Sparkles } from "lucide-react";
import { TeachingCsoundRenderer } from "@/components/csound/TeachingCsoundRenderer";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useNeuroStore } from "@/lib/store";

export default function TeachingPage() {
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const latestBandsAbs = useNeuroStore((s) => s.latestBandsAbs);
  const latestBandsRel = useNeuroStore((s) => s.latestBandsRel);
  const motion = useNeuroStore((s) => s.motion);
  const wsStatus = useNeuroStore((s) => s.wsStatus);
  const lastMessageAt = useNeuroStore((s) => s.lastMessageAt);
  const deviceName = useNeuroStore((s) => s.deviceName);

  const ageMs = lastMessageAt ? Date.now() - lastMessageAt : null;
  const live = wsStatus === "open" && (ageMs === null || ageMs < 2500);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<BookOpen className="h-4 w-4" />}
            description="Simple, isolated Csound demonstrations for lectures: one sensor stream controls one musical idea."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={live ? "emerald" : "rose"} dot>
                  {live ? "Live Data" : wsStatus}
                </Badge>
                <Badge tone="indigo">{deviceName ?? "No device label"}</Badge>
              </div>
            }
          >
            Teaching Mode
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            <TeachingTile
              title="1. Listen To One Stream"
              body="Choose a preset like Raw EEG -> Pitch or PPG -> Rhythm and hear exactly one mapping."
            />
            <TeachingTile
              title="2. Explain The Mapping"
              body="Each preset states what the sensor controls, so students can connect movement/data to sound."
            />
            <TeachingTile
              title="3. Compare Sensors"
              body="Switch presets while the same headset stream is live to hear raw EEG, bands, motion, and PPG."
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle
            icon={<Sparkles className="h-4 w-4" />}
            description="These are intentionally clear demonstration instruments, not concert textures."
          >
            One-Sensor Csound Orchestras
          </CardTitle>
        </CardHeader>
        <CardBody>
          <TeachingCsoundRenderer
            latestEEG={latestEEG}
            latestBandsAbs={latestBandsAbs}
            latestBandsRel={latestBandsRel}
            motion={motion}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon={<Radio className="h-4 w-4" />}>Mind Monitor Setup</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm leading-6 text-zinc-300">
            Mind Monitor should send OSC/UDP to this Mac on port <code className="text-emerald-300">5000</code>.
            Port <code className="text-amber-300">7400</code> is NeuroVis output for desktop Csound,
            Max, TouchDesigner, or other OSC receivers.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function TeachingTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{body}</p>
    </div>
  );
}

