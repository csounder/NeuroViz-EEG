"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bluetooth,
  Brain,
  ChevronRight,
  Info,
  Radio,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sigma,
  Waves,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Slider } from "@/components/ui/Slider";
import { api } from "@/lib/api";
import { OSCMonitor } from "@/components/widgets/OSCMonitor";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";
import { PresetPicker } from "@/components/widgets/PresetPicker";
import type { Preset, DspPresetData } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { dsp, DEFAULT_DSP, type DspConfig } from "@/lib/dspPipeline";

/** Pipeline stage definition — one entry per visual node in the flow. */
interface Stage {
  id: string;
  label: string;
  kind: "spatial" | "temporal" | "smooth" | "norm" | "artifact";
  icon: React.ReactNode;
  description: string;
  detail: string;
  enabled: (c: DspConfig) => boolean;
  summary: (c: DspConfig) => string;
}

const STAGES: Stage[] = [
  {
    id: "detrend",
    label: "Detrend",
    kind: "temporal",
    icon: <Activity className="h-3.5 w-3.5" />,
    description: "Remove DC offset + slow drift",
    detail:
      "A leaky running-mean estimate of each channel is subtracted from the signal so slow baselines (electrode settling, breathing, motion) don't dominate the waveform. Safe to leave on.",
    enabled: (c) => c.detrendEnabled,
    summary: () => "running DC subtract",
  },
  {
    id: "car",
    label: "CAR",
    kind: "spatial",
    icon: <Sigma className="h-3.5 w-3.5" />,
    description: "Common Average Reference",
    detail:
      "Subtracts the instantaneous mean across all 4 EEG channels from each one. This removes global noise that hits every electrode (muscle, motion, mains coupling) and reveals local activity. Classic first spatial filter for EEG.",
    enabled: (c) => c.carEnabled,
    summary: () => "∑ mean / n — per sample",
  },
  {
    id: "bandpass",
    label: "Bandpass",
    kind: "temporal",
    icon: <Waves className="h-3.5 w-3.5" />,
    description: "Keep the EEG band only",
    detail:
      "A 4th-order Butterworth bandpass built from two biquads (highpass then lowpass). 1–45 Hz is the standard EEG window — everything below is drift/DC, everything above is muscle.",
    enabled: (c) => c.bandpassEnabled,
    summary: (c) => `${c.bandpassLo}–${c.bandpassHi} Hz`,
  },
  {
    id: "notch",
    label: "Notch",
    kind: "temporal",
    icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
    description: "Kill power-line hum",
    detail:
      "A narrow IIR notch at the mains frequency (60 Hz in US/JP, 50 Hz in EU/UK). Use Q≈30 so it removes the line and its ringing without eating neighbouring brain frequencies.",
    enabled: (c) => c.notchEnabled,
    summary: (c) => `${c.notchHz} Hz (Q=30)`,
  },
  {
    id: "smooth",
    label: "Smooth",
    kind: "smooth",
    icon: <Activity className="h-3.5 w-3.5" />,
    description: "Global EMA smoothing",
    detail:
      "An exponential moving average applied to each channel. Useful for visual stability, but be careful: heavy smoothing hides genuine fast transients (blinks, bursts) and delays your OSC output.",
    enabled: (c) => c.smoothEnabled,
    summary: (c) => `α = ${c.smoothAlpha.toFixed(2)}`,
  },
  {
    id: "artifact",
    label: "Artifact flag",
    kind: "artifact",
    icon: <Info className="h-3.5 w-3.5" />,
    description: "Non-destructive warning",
    detail:
      "Monitors each sample's amplitude vs a threshold (µV) and flags likely artifacts without modifying the signal. Useful for marking regions in recordings or gating OSC downstream.",
    enabled: (c) => c.artifactEnabled,
    summary: (c) => `|x| > ${c.artifactAmplitudeUv} µV`,
  },
  {
    id: "log",
    label: "Log₁₀",
    kind: "norm",
    icon: <Sigma className="h-3.5 w-3.5" />,
    description: "Compress dynamic range",
    detail:
      "Applies log₁₀ to each absolute band power before OSC output. Band power varies over 3+ orders of magnitude; log compresses it so Csound/Max receive a nicely-behaved signal you can map linearly.",
    enabled: (c) => c.logTransformEnabled,
    summary: () => "log₁₀(P)",
  },
  {
    id: "zscore",
    label: "Z-Score",
    kind: "norm",
    icon: <Brain className="h-3.5 w-3.5" />,
    description: "Personal baseline",
    detail:
      "Maintains a rolling baseline (default 30 s) of each band's power per session and reports deviations as z-scores. Makes \"my alpha just went up\" work regardless of absolute µV² — critical for portable neurofeedback.",
    enabled: (c) => c.zScoreEnabled,
    summary: (c) => `${c.baselineWindowSec} s baseline`,
  },
];

const STAGE_KIND_COLOR: Record<Stage["kind"], string> = {
  spatial: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  temporal: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  smooth: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  artifact: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  norm: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

/** Turn the dsp singleton into reactive state by polling via useSyncExternalStore. */
function useDspConfig(): [DspConfig, (patch: Partial<DspConfig>) => void] {
  const [, setTick] = React.useState(0);
  // Pull on every render; light and always fresh.
  const cfg = dsp.getConfig();
  const update = React.useCallback(
    (patch: Partial<DspConfig>) => {
      dsp.setConfig(patch);
      setTick((t) => t + 1);
    },
    [],
  );
  return [cfg, update];
}

export default function DspPage() {
  const [cfg, updateDsp] = useDspConfig();

  const [previewScale, setPreviewScale] = React.useState<ScaleState>({
    auto: true,
    value: 200,
  });
  const [expandedStage, setExpandedStage] = React.useState<string | null>(
    null,
  );

  const resetFilterState = () => {
    dsp.reset();
  };
  const resetBaseline = () => {
    dsp.resetBaseline();
  };
  const allDefaults = () => {
    dsp.setConfig(DEFAULT_DSP);
    updateDsp({}); // trigger refresh
  };

  // Sync client DSP changes to server so real-device flows get the same chain
  // applied server-side. Debounced via React's own batching.
  React.useEffect(() => {
    const payload = {
      applyCAR: cfg.carEnabled,
      applyBandpass: cfg.bandpassEnabled,
      applyNotch: cfg.notchEnabled,
      logTransform: cfg.logTransformEnabled,
      applyBaseline: cfg.zScoreEnabled,
    };
    api.setDspConfig(payload as any).catch(() => {});
    api
      .updateSettings({
        logTransform: cfg.logTransformEnabled,
        applyBaseline: cfg.zScoreEnabled,
      })
      .catch(() => {});
  }, [
    cfg.carEnabled,
    cfg.bandpassEnabled,
    cfg.notchEnabled,
    cfg.logTransformEnabled,
    cfg.zScoreEnabled,
  ]);

  return (
    <div className="space-y-6">
      {/* ───── Workflow strip ───── */}
      <Card>
        <CardBody className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Recommended workflow
            </div>
            <Link
              href="/simulator"
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            >
              No device? try simulator →
            </Link>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            {[
              {
                n: 1,
                label: "Pair device",
                hint: "Muse 2 / S / Athena · Ganglion · Ultracortex",
                icon: <Bluetooth className="h-4 w-4" />,
                href: "/settings",
              },
              {
                n: 2,
                label: "Calibrate",
                hint: "Sit still 90 s to learn your baseline",
                icon: <Brain className="h-4 w-4" />,
                href: "/brain-state",
              },
              {
                n: 3,
                label: "Configure filters",
                hint: "CAR · bandpass · notch · smoothing",
                icon: <SlidersHorizontal className="h-4 w-4" />,
                active: true,
              },
              {
                n: 4,
                label: "Normalize",
                hint: "Log · Z-score for portable neurofeedback",
                icon: <Sigma className="h-4 w-4" />,
                active: true,
              },
              {
                n: 5,
                label: "Verify OSC",
                hint: "Confirm Csound / Max is receiving",
                icon: <Radio className="h-4 w-4" />,
                href: "/osc",
              },
            ].map((s, i, arr) => {
              const content = (
                <div
                  className={cn(
                    "flex flex-1 items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    s.active
                      ? "border-emerald-500/30 bg-emerald-500/5 text-zinc-100"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900",
                  )}
                >
                  <div
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-md border text-[10px] font-mono",
                      s.active
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-800 bg-zinc-900 text-zinc-500",
                    )}
                  >
                    {s.n}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {s.icon}
                      {s.label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {s.hint}
                    </div>
                  </div>
                </div>
              );
              return (
                <React.Fragment key={s.n}>
                  {s.href ? (
                    <Link href={s.href} className="flex-1">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex-1">{content}</div>
                  )}
                  {i < arr.length - 1 && (
                    <div className="hidden shrink-0 items-center sm:flex">
                      <ChevronRight className="h-4 w-4 text-zinc-700" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* ───── Live preview + OSC Monitor ───── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle
              icon={<SlidersHorizontal className="h-4 w-4" />}
              description="Toggle any stage below and watch the 4-channel signal change in real time"
              actions={
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>Pipeline</span>
                  <Toggle
                    checked={cfg.masterEnabled}
                    onCheckedChange={(v) =>
                      updateDsp({ masterEnabled: v })
                    }
                  />
                </label>
              }
            >
              Signal preview
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 p-0">
            <RawEEGChart
              height={280}
              autoScale={previewScale.auto}
              scaleValue={previewScale.value}
            />
            <div className="px-5 pb-4">
              <ScaleControl
                state={previewScale}
                onChange={setPreviewScale}
                label="Y-range"
                unit="µV"
                bipolar
                min={10}
                max={2000}
                helpAuto="Each lane re-scales to its own peak so changes remain visible."
                helpManual="Fixed ±µV range — useful for comparing amplitude before/after filtering."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              icon={<Radio className="h-4 w-4" />}
              description="The exact messages Csound / Max are receiving right now"
            >
              OSC Monitor
            </CardTitle>
          </CardHeader>
          <CardBody>
            <OSCMonitor height={280} />
          </CardBody>
        </Card>
      </div>

      {/* ───── Pipeline flow ───── */}
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Waves className="h-4 w-4" />}
            description="Click any node to reveal its parameters. Order: spatial → temporal → smoothing → artifact flag → band-power normalization."
            actions={
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={resetFilterState}
                  title="Flush all IIR filter history — use after big parameter changes or reconnects"
                >
                  Reset filter state
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={allDefaults}
                >
                  Defaults
                </Button>
              </div>
            }
          >
            Pipeline
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {/* Stage flow */}
          <div className="flex flex-wrap items-stretch gap-1.5">
            <StageTile label="Raw EEG" neutral />
            {STAGES.slice(0, 6).map((stage, i) => {
              const on = stage.enabled(cfg);
              return (
                <React.Fragment key={stage.id}>
                  <ArrowRight className="mt-3 h-4 w-4 shrink-0 text-zinc-700" />
                  <button
                    onClick={() =>
                      setExpandedStage(
                        expandedStage === stage.id ? null : stage.id,
                      )
                    }
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      on
                        ? STAGE_KIND_COLOR[stage.kind]
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700",
                      expandedStage === stage.id &&
                        "ring-1 ring-emerald-500/40",
                    )}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider">
                      {stage.icon}
                      {stage.label}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {on ? stage.summary(cfg) : "off"}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
            <div className="mx-1 flex items-center gap-2 self-stretch">
              <div className="h-full w-px bg-zinc-800" />
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                band-power norm
              </div>
              <div className="h-full w-px bg-zinc-800" />
            </div>
            {STAGES.slice(6).map((stage) => {
              const on = stage.enabled(cfg);
              return (
                <React.Fragment key={stage.id}>
                  <button
                    onClick={() =>
                      setExpandedStage(
                        expandedStage === stage.id ? null : stage.id,
                      )
                    }
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      on
                        ? STAGE_KIND_COLOR[stage.kind]
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700",
                      expandedStage === stage.id &&
                        "ring-1 ring-emerald-500/40",
                    )}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider">
                      {stage.icon}
                      {stage.label}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {on ? stage.summary(cfg) : "off"}
                    </span>
                  </button>
                  <ArrowRight className="mt-3 h-4 w-4 shrink-0 text-zinc-700 last:hidden" />
                </React.Fragment>
              );
            })}
            <StageTile label="OSC out" neutral />
          </div>

          {/* Expanded parameter panel for the selected stage */}
          {expandedStage && (
            <StageEditor
              stage={STAGES.find((s) => s.id === expandedStage)!}
              cfg={cfg}
              onChange={updateDsp}
              onClose={() => setExpandedStage(null)}
              resetBaseline={resetBaseline}
            />
          )}

          {/* Always-visible inline toggles */}
          <div className="grid grid-cols-2 gap-3 border-t border-zinc-800/60 pt-3 sm:grid-cols-4">
            {STAGES.map((stage) => (
              <Toggle
                key={stage.id}
                checked={stage.enabled(cfg)}
                onCheckedChange={(v) => {
                  const keyMap: Record<string, keyof DspConfig> = {
                    detrend: "detrendEnabled",
                    car: "carEnabled",
                    bandpass: "bandpassEnabled",
                    notch: "notchEnabled",
                    smooth: "smoothEnabled",
                    artifact: "artifactEnabled",
                    log: "logTransformEnabled",
                    zscore: "zScoreEnabled",
                  };
                  updateDsp({ [keyMap[stage.id]]: v } as any);
                }}
                label={stage.label}
                hint={stage.description}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ───── Presets + save/load ───── */}
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Sparkles className="h-4 w-4" />}
            description="Save every toggle and parameter above as a reusable preset"
          >
            Presets
          </CardTitle>
        </CardHeader>
        <CardBody>
          <PresetPicker
            scope="dsp"
            label="DSP presets"
            capture={(): Partial<Preset> => ({
              dsp: {
                filter: {
                  enabled: cfg.bandpassEnabled || cfg.notchEnabled,
                  types: [
                    cfg.bandpassEnabled ? "bandpass" : "",
                    cfg.notchEnabled ? `notch${cfg.notchHz}` : "",
                    cfg.detrendEnabled ? "dcblock" : "",
                  ].filter(Boolean) as string[],
                },
                smooth: {
                  type: "ema",
                  amount: cfg.smoothAlpha,
                  enabled: cfg.smoothEnabled,
                },
                gate: { type: "artifact", threshold: cfg.artifactAmplitudeUv },
                shape: undefined,
                notch: { hz: cfg.notchHz, enabled: cfg.notchEnabled },
              } satisfies DspPresetData,
            })}
            apply={(p) => {
              const d = p.dsp;
              if (!d) return;
              const types = d.filter?.types ?? (d.filter?.type ? [d.filter.type] : []);
              updateDsp({
                bandpassEnabled: types.includes("bandpass"),
                detrendEnabled: types.includes("dcblock"),
                notchEnabled:
                  types.includes("notch50") ||
                  types.includes("notch60") ||
                  d.notch?.enabled === true,
                notchHz: types.includes("notch50") ? 50 : d.notch?.hz === 50 ? 50 : 60,
                smoothEnabled: Boolean(d.smooth?.enabled),
                smoothAlpha: d.smooth?.amount ?? cfg.smoothAlpha,
                artifactAmplitudeUv:
                  (d.gate?.threshold && d.gate.threshold > 1
                    ? d.gate.threshold
                    : cfg.artifactAmplitudeUv),
              });
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ───────────────── helpers ─────────────────

function StageTile({ label, neutral }: { label: string; neutral?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border px-2.5 py-1.5",
        neutral
          ? "border-zinc-800 bg-zinc-900/60 text-zinc-300"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-500",
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono text-[10px] text-zinc-500">i/o</span>
    </div>
  );
}

function StageEditor({
  stage,
  cfg,
  onChange,
  onClose,
  resetBaseline,
}: {
  stage: Stage;
  cfg: DspConfig;
  onChange: (patch: Partial<DspConfig>) => void;
  onClose: () => void;
  resetBaseline: () => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            {stage.icon}
            {stage.label}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {stage.detail}
          </p>
        </div>
        <button
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
        >
          close
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {stage.id === "bandpass" && (
          <>
            <Slider
              label="Low cutoff"
              unit="Hz"
              value={cfg.bandpassLo}
              min={0.3}
              max={4}
              step={0.1}
              onChange={(v) => onChange({ bandpassLo: v })}
              format={(v) => v.toFixed(1)}
            />
            <Slider
              label="High cutoff"
              unit="Hz"
              value={cfg.bandpassHi}
              min={20}
              max={100}
              step={1}
              onChange={(v) => onChange({ bandpassHi: v })}
            />
          </>
        )}
        {stage.id === "notch" && (
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Mains frequency
            </div>
            <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
              {[50, 60].map((hz) => (
                <Button
                  key={hz}
                  size="sm"
                  variant={cfg.notchHz === hz ? "secondary" : "ghost"}
                  onClick={() => onChange({ notchHz: hz as 50 | 60 })}
                >
                  {hz} Hz
                </Button>
              ))}
            </div>
          </div>
        )}
        {stage.id === "smooth" && (
          <Slider
            label="EMA weight (α)"
            value={cfg.smoothAlpha}
            min={0.01}
            max={1}
            step={0.01}
            onChange={(v) => onChange({ smoothAlpha: v })}
            format={(v) => v.toFixed(2)}
          />
        )}
        {stage.id === "artifact" && (
          <Slider
            label="Amplitude threshold"
            unit="µV"
            value={cfg.artifactAmplitudeUv}
            min={30}
            max={500}
            step={5}
            onChange={(v) => onChange({ artifactAmplitudeUv: v })}
          />
        )}
        {stage.id === "zscore" && (
          <>
            <Slider
              label="Baseline window"
              unit="s"
              value={cfg.baselineWindowSec}
              min={5}
              max={120}
              step={5}
              onChange={(v) => onChange({ baselineWindowSec: v })}
            />
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={resetBaseline}
              >
                Reset baseline
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
