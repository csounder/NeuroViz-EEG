"use client";

import * as React from "react";
import { Waves } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { FFTChart } from "@/components/charts/FFTChart";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

export default function FFTPage() {
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 40,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Waves className="h-4 w-4" />}
            description="0–50 Hz · 4 channels · band regions highlighted"
          >
            FFT Spectrum
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <FFTChart height={480} autoScale={scale.auto} scaleValue={scale.value} />
          <ScaleControl
            state={scale}
            onChange={setScale}
            label="Y-range"
            unit="dB"
            min={10}
            max={120}
            helpAuto="Y-axis smoothly follows the min and max of the spectrum (EMA with 10 % new data per frame)."
            helpManual="Fixes the Y-axis from 0 up to the selected dB value — useful for directly comparing sessions."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="What you're looking at">
            Reading the spectrum
          </CardTitle>
        </CardHeader>
        <CardBody className="prose prose-invert max-w-none text-sm text-zinc-400">
          <p>
            The FFT (Fast Fourier Transform) converts the time-domain EEG into
            frequency components. Peaks indicate dominant rhythms — for example,
            a pronounced bump around 10 Hz is classic alpha, often seen with
            eyes closed and relaxed wakefulness.
          </p>
          <ul className="mt-3 space-y-1 list-disc pl-5">
            <li>
              <span className="text-band-delta font-medium">Delta (0.5–4 Hz)</span>
              {" "}— deep sleep, restoration
            </li>
            <li>
              <span className="text-band-theta font-medium">Theta (4–8 Hz)</span>
              {" "}— drowsy, meditative, creative
            </li>
            <li>
              <span className="text-band-alpha font-medium">Alpha (8–13 Hz)</span>
              {" "}— calm, eyes-closed, idle
            </li>
            <li>
              <span className="text-band-beta font-medium">Beta (13–30 Hz)</span>
              {" "}— focus, active thinking
            </li>
            <li>
              <span className="text-band-gamma font-medium">Gamma (30–50 Hz)</span>
              {" "}— high-level integration, sometimes muscle artifact
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
