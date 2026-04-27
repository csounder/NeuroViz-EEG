"use client";

import * as React from "react";
import { AudioWaveform } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { FFTChart } from "@/components/charts/FFTChart";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

export default function FftSmoothedPage() {
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 40,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<AudioWaveform className="h-4 w-4" />}
            description="Heavy temporal smoothing on the PSD estimate — closer to the stable “averaged” spectrum readout in the OpenBCI GUI."
          >
            Smoothed FFT
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <FFTChart
            height={480}
            autoScale={scale.auto}
            scaleValue={scale.value}
            psdTimeSmooth={0.92}
            updateIntervalMs={100}
          />
          <div className="px-5 pb-4">
            <ScaleControl
              state={scale}
              onChange={setScale}
              label="Y"
              unit="dB"
              min={10}
              max={120}
              helpAuto="EMA tracks displayed dB range."
              helpManual="Fixed 0 → scale dB on the Y axis."
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
