"use client";

import * as React from "react";
import { Equal } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { FFTChart } from "@/components/charts/FFTChart";
import { BandBarsWithSparklines } from "@/components/charts/BandBarsWithSparklines";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

export default function FFTBandsPage() {
  const [fftScale, setFftScale] = React.useState<ScaleState>({
    auto: true,
    value: 40,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Equal className="h-4 w-4" />}
            description="Live FFT spectrum (0–60 Hz) paired with animated band bars + sparklines — ported from the original 2-pane view"
          >
            FFT + Bands
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr,1fr]">
            <div className="space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Spectrum · 4 channels · band regions
              </div>
              <FFTChart
                height={340}
                minFreq={0.5}
                maxFreq={60}
                autoScale={fftScale.auto}
                scaleValue={fftScale.value}
              />
              <ScaleControl
                compact
                state={fftScale}
                onChange={setFftScale}
                label="Spectrum"
                unit="dB"
                min={10}
                max={120}
                helpAuto="Spectrum Y smoothly tracks the live dB min/max (EMA)."
                helpManual="Spectrum Y is fixed 0 to the dB value on the right."
              />
            </div>
            <div className="space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Band power · last 8 s
              </div>
              <BandBarsWithSparklines sparklineLength={80} />
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
