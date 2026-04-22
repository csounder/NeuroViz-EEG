"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { Stat } from "@/components/ui/Stat";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";
import { useNeuroStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";

const CHANNEL_LABELS = ["TP9", "AF7", "AF8", "TP10"];

export default function RawPage() {
  const { rolling, stats } = useNeuroStore(
    useShallow((s) => ({
      rolling: s.rollingRaw,
      stats: s.latestEEG?.stats,
    })),
  );

  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 200,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Activity className="h-4 w-4" />}
            description="Muse layout · TP9 / AF7 / AF8 / TP10 · 256 Hz native, 10 Hz wire"
          >
            Raw EEG — 4 channel
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <RawEEGChart
            height={520}
            autoScale={scale.auto}
            scaleValue={scale.value}
          />
          <div className="px-5 pb-4">
            <ScaleControl
              state={scale}
              onChange={setScale}
              label="Y-range"
              unit="µV"
              bipolar
              min={10}
              max={2000}
              helpAuto="Each channel lane independently re-scales to its own peak so signals always fill the lane."
              helpManual="Every lane uses the same fixed ±µV range — useful for comparing channels or watching for artifacts."
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CHANNEL_LABELS.map((ch, i) => {
          const buf = rolling[i] ?? [];
          const last = buf.length ? buf[buf.length - 1] : null;
          const rms = stats?.rms?.[i] ?? null;
          return (
            <Stat
              key={ch}
              label={ch}
              value={last !== null ? formatNumber(last, 1) : "—"}
              hint={rms !== null ? `RMS ${formatNumber(rms, 2)}` : "µV"}
            />
          );
        })}
      </div>
    </div>
  );
}
