"use client";

import * as React from "react";
import Link from "next/link";
import { Brain, Radio } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { FFTChart } from "@/components/charts/FFTChart";
import { BandTracesChart } from "@/components/charts/BandTracesChart";
import { SpectrogramChart } from "@/components/charts/SpectrogramChart";
import { BandBars } from "@/components/charts/BandBars";
import { OSCMonitor } from "@/components/widgets/OSCMonitor";
import {
  ScaleControl,
  TraceSpeedControl,
  type ScaleState,
} from "@/components/ui/ScaleControl";
import { useNeuroStore } from "@/lib/store";
import {
  MIND_MONITOR_BAND_EDGES,
  MIND_MONITOR_FFT_MAX_HZ,
} from "@/lib/mindMonitor";
export default function MindMonitorPage() {
  const { mindMonitorMode, setMindMonitorMode } = useNeuroStore(
    useShallow((s) => ({
      mindMonitorMode: s.mindMonitorMode,
      setMindMonitorMode: s.setMindMonitorMode,
    })),
  );

  const [rawScale, setRawScale] = React.useState<ScaleState>({
    auto: true,
    value: 200,
  });
  const [fftScale, setFftScale] = React.useState<ScaleState>({
    auto: true,
    value: 40,
  });
  const [traceScale, setTraceScale] = React.useState<ScaleState>({
    auto: true,
    value: 12,
  });
  const [specScale, setSpecScale] = React.useState<ScaleState>({
    auto: true,
    value: 45,
  });
  const [rawTraceWindow, setRawTraceWindow] = React.useState(256);
  const [bandTraceWindow, setBandTraceWindow] = React.useState(256);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Brain className="h-4 w-4" />}
            description="NeuroVis emulation of Mind Monitor processing: Hamming-window discrete spectrum, 0–110 Hz / 129-bin MuseIO FFT OSC, and Mind Monitor band edges (δ 1–4 … γ 30–44 Hz) on the band-pass trace bank."
          >
            Mind Monitor mode
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-relaxed text-zinc-400">
              <p>
                Turn this on to match the public Mind Monitor technical manual
                and MuseIO help:{" "}
                <strong className="text-zinc-200">discrete frequency</strong>{" "}
                uses a <strong className="text-zinc-200">Hamming</strong> FFT on
                raw EEG;{" "}
                <strong className="text-zinc-200">spectrogram</strong> uses the
                same PSD columns over time; OSC adds{" "}
                <code className="rounded bg-zinc-800 px-1 font-mono text-xs">
                  /elements/raw_fft0
                </code>
                …
                <code className="rounded bg-zinc-800 px-1 font-mono text-xs">
                  raw_fft3
                </code>{" "}
                (129 floats each, ~10 Hz with the band-power timer). Existing
                addresses for{" "}
                <code className="font-mono text-xs">/eeg</code>,{" "}
                <code className="font-mono text-xs">
                  /elements/*_absolute
                </code>
                , etc. stay Muse-compatible.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Output is not bit-identical to the closed Mind Monitor / Muse
                stack; it targets the same OSC layout and similar DSP so Csound,
                MuseLab, and your saved instruments can attach to NeuroVis.
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3">
              <input
                type="checkbox"
                checked={mindMonitorMode}
                onChange={(e) => setMindMonitorMode(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500"
              />
              <div>
                <div className="text-sm font-medium text-zinc-100">
                  Mind Monitor compatibility
                </div>
                <div className="text-xs text-zinc-500">
                  Band edges · Hamming views · raw_fft OSC (sim)
                </div>
              </div>
            </label>
          </div>

          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            <Radio className="mb-1 inline h-3.5 w-3.5" /> Point CsoundQt /
            MuseLab at the same UDP host and port as in Settings (default{" "}
            <span className="font-mono">127.0.0.1:7400</span>). Start the
            backend WebSocket so <span className="font-mono">osc_send</span>{" "}
            relays packets. Use <strong>Start sim</strong> in the top bar to
            drive streams without a Muse.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="µV · TP9 AF7 AF8 TP10">
            Raw EEG
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <RawEEGChart
            height={280}
            autoScale={rawScale.auto}
            scaleValue={rawScale.value}
            windowSamples={rawTraceWindow}
          />
          <div className="flex flex-col gap-2 px-5 pb-4 lg:flex-row">
            <ScaleControl
              compact
              className="flex-1"
              state={rawScale}
              onChange={setRawScale}
              label="Y"
              unit="µV"
              bipolar
              min={10}
              max={2000}
              helpAuto="Per-lane auto scale."
              helpManual="Fixed ±µV."
            />
            <TraceSpeedControl
              compact
              className="flex-1"
              value={rawTraceWindow}
              onChange={setRawTraceWindow}
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle
              description={`Hamming · 256 pts · 0–${MIND_MONITOR_FFT_MAX_HZ} Hz · shaded Mind Monitor bands`}
            >
              Discrete spectrum
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 p-0">
            <FFTChart
              height={320}
              fftN={256}
              minFreq={0.5}
              maxFreq={MIND_MONITOR_FFT_MAX_HZ}
              fftWindow="hamming"
              bandShadingRanges={MIND_MONITOR_BAND_EDGES}
              autoScale={fftScale.auto}
              scaleValue={fftScale.value}
              updateIntervalMs={120}
            />
            <div className="px-5 pb-4">
              <ScaleControl
                compact
                state={fftScale}
                onChange={setFftScale}
                label="Y"
                unit="dB"
                min={10}
                max={120}
                helpAuto="EMA on PSD dB."
                helpManual="0 → max dB."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle description="Hamming STFT · Mind Monitor–style spectrogram">
              Spectrogram
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 p-0">
            <SpectrogramChart
              height={320}
              fftN={256}
              minFreq={1}
              maxFreq={MIND_MONITOR_FFT_MAX_HZ}
              fftWindow="hamming"
              autoScale={specScale.auto}
              scaleValue={specScale.value}
            />
            <div className="px-5 pb-4">
              <ScaleControl
                compact
                state={specScale}
                onChange={setSpecScale}
                label="dB window"
                unit="dB"
                min={15}
                max={80}
                helpAuto="Tracks PSD range."
                helpManual="Fixed floor −N dB."
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle description="Band-pass traces · Mind Monitor Hz edges when mode is on">
            Band traces (overlay)
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <BandTracesChart
            layout="overlay"
            height={300}
            autoScale={traceScale.auto}
            scaleValue={traceScale.value}
            windowSamples={bandTraceWindow}
          />
          <div className="flex flex-col gap-2 px-5 pb-4 xl:flex-row xl:items-center xl:justify-between">
            <ScaleControl
              compact
              className="flex-1"
              state={traceScale}
              onChange={setTraceScale}
              label="dB"
              unit="dB"
              bipolar
              min={3}
              max={40}
              helpAuto="Mind Monitor–style trace dB."
              helpManual="Fixed ±dB half-span."
            />
            <TraceSpeedControl
              compact
              className="flex-1"
              value={bandTraceWindow}
              onChange={setBandTraceWindow}
            />
            <Link
              href="/bands-multichannel"
              className="text-xs font-medium text-emerald-400 hover:underline"
            >
              Open multichannel strips →
            </Link>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Relative shares (0–100 %) from live stream">
            Band powers
          </CardTitle>
        </CardHeader>
        <CardBody>
          <BandBars mode="relative" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle
            icon={<Radio className="h-4 w-4" />}
            description="Preview of OSC including raw_fft when Mind Monitor mode or rawFft stream is enabled"
          >
            OSC (Muse-style)
          </CardTitle>
        </CardHeader>
        <CardBody>
          <OSCMonitor height={380} />
        </CardBody>
      </Card>
    </div>
  );
}
