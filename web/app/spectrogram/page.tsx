"use client";

import * as React from "react";
import { LayoutGrid } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { SpectrogramChart } from "@/components/charts/SpectrogramChart";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

const CHANNELS: { idx: number; label: string }[] = [
  { idx: 0, label: "TP9" },
  { idx: 1, label: "AF7" },
  { idx: 2, label: "AF8" },
  { idx: 3, label: "TP10" },
];

export default function SpectrogramPage() {
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 45,
  });
  const [channelIndex, setChannelIndex] = React.useState(0);
  const [useCar, setUseCar] = React.useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<LayoutGrid className="h-4 w-4" />}
            description="Short-time PSD columns scrolled in time. Pick an electrode and optionally re-reference with CAR before the FFT."
          >
            Spectrogram
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <div className="flex flex-col gap-3 border-b border-zinc-800/80 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="spectrogram-channel"
                className="font-mono text-[10px] uppercase tracking-wider text-zinc-500"
              >
                Channel
              </label>
              <select
                id="spectrogram-channel"
                value={channelIndex}
                onChange={(e) =>
                  setChannelIndex(Number.parseInt(e.target.value, 10))
                }
                className="w-full min-w-[8rem] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 sm:w-auto"
              >
                {CHANNELS.map(({ idx, label }) => (
                  <option key={idx} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 sm:max-w-lg">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={useCar}
                  onChange={(e) => setUseCar(e.target.checked)}
                  className="mt-1 h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30"
                />
                <span>
                  <span className="text-sm font-medium text-zinc-200">
                    Common average reference (CAR)
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-500">
                    Use CAR signal for the selected channel instead of raw µV.
                  </span>
                </span>
              </label>
              <details className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs leading-relaxed text-zinc-400">
                <summary className="cursor-pointer select-none font-medium text-zinc-300">
                  How CAR is calculated here
                </summary>
                <p className="mt-2">
                  For each time sample index{" "}
                  <span className="font-mono text-zinc-300">t</span>, we take
                  the four simultaneous amplitudes{" "}
                  <span className="font-mono text-zinc-300">
                    x₀…x₃
                  </span>{" "}
                  (TP9…TP10) and compute the average{" "}
                  <span className="font-mono text-zinc-300">
                    μ(t) = (x₀+x₁+x₂+x₃)/4
                  </span>
                  . The CAR waveform for channel{" "}
                  <span className="font-mono text-zinc-300">c</span> is{" "}
                  <span className="font-mono text-zinc-300">
                    CAR_c(t) = x_c(t) − μ(t)
                  </span>
                  . The spectrogram runs the same STFT/PSD pipeline on that
                  CAR_c series. This matches the usual “subtract the common
                  average across channels at each instant” definition (for four
                  channels, equivalent to a reference at the mean of the set).
                </p>
              </details>
            </div>
          </div>

          <SpectrogramChart
            height={440}
            channelIndex={channelIndex}
            useCommonAverageReference={useCar}
            autoScale={scale.auto}
            scaleValue={scale.value}
          />
          <div className="px-5 pb-4">
            <ScaleControl
              state={scale}
              onChange={setScale}
              label="dB window"
              unit="dB"
              min={15}
              max={80}
              helpAuto="Color mapping tracks recent min/max PSD in dB."
              helpManual="Fixed floor at −N dB up to +6 dB."
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
