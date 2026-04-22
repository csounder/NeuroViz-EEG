"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Brain,
  Equal,
  Layers,
  Layers3,
  LineChart,
  Radio,
  Rows3,
  Waves,
} from "lucide-react";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { FFTChart } from "@/components/charts/FFTChart";
import { BandBars } from "@/components/charts/BandBars";
import { BandHistoryChart } from "@/components/charts/BandHistoryChart";
import { BandBarsWithSparklines } from "@/components/charts/BandBarsWithSparklines";
import { BandTracesChart } from "@/components/charts/BandTracesChart";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { BrainStateCard } from "@/components/widgets/BrainStateCard";
import { OSCMonitor } from "@/components/widgets/OSCMonitor";
import type { ScaleState } from "@/components/ui/ScaleControl";

/** Available visualizations. Serialized as a string in localStorage layouts. */
export type DisplayKind =
  | "raw"
  | "fft"
  | "bands"
  | "bandHistory"
  | "bandSparks"
  | "bandsCombined"
  | "bandsMulti"
  | "waterfall"
  | "brain"
  | "osc";

export interface DisplaySpec {
  kind: DisplayKind;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Default scale state for the pane. */
  defaultScale: ScaleState;
  /** Scale control label + unit (or null to omit the control). */
  scaleControl: null | {
    label: string;
    unit: string;
    bipolar?: boolean;
    min: number;
    max: number;
    helpAuto: string;
    helpManual: string;
  };
  /** Render function — receives the height available and scale state. */
  render: (opts: { height: number; scale: ScaleState }) => React.ReactNode;
}

const RAW: DisplaySpec = {
  kind: "raw",
  label: "Raw EEG",
  description: "4-channel rolling waveforms",
  icon: Activity,
  defaultScale: { auto: true, value: 200 },
  scaleControl: {
    label: "Y",
    unit: "µV",
    bipolar: true,
    min: 10,
    max: 2000,
    helpAuto: "Each lane auto-scales to its own signal.",
    helpManual: "Fixed ±µV range across all lanes.",
  },
  render: ({ height, scale }) => (
    <RawEEGChart
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const FFT: DisplaySpec = {
  kind: "fft",
  label: "FFT Spectrum",
  description: "0–45 Hz spectrum with band regions",
  icon: Waves,
  defaultScale: { auto: true, value: 40 },
  scaleControl: {
    label: "Y",
    unit: "dB",
    min: 10,
    max: 120,
    helpAuto: "EMA tracks signal dB min/max.",
    helpManual: "Fixed 0 → scale dB.",
  },
  render: ({ height, scale }) => (
    <FFTChart
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const BANDS: DisplaySpec = {
  kind: "bands",
  label: "Band Powers",
  description: "δ / θ / α / β / γ animated bars",
  icon: BarChart3,
  defaultScale: { auto: true, value: 100 },
  scaleControl: {
    label: "Ceiling",
    unit: "%",
    min: 5,
    max: 500,
    helpAuto: "Bars always 0–100 %.",
    helpManual: "Cap the % ceiling to magnify subtle differences.",
  },
  render: ({ scale }) => (
    <BandBars
      mode="relative"
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const BAND_HISTORY: DisplaySpec = {
  kind: "bandHistory",
  label: "Band History",
  description: "Rolling 60-second history per band",
  icon: LineChart,
  defaultScale: { auto: true, value: 100 },
  scaleControl: {
    label: "Ceiling",
    unit: "%",
    min: 5,
    max: 500,
    helpAuto: "Always 0–100 %.",
    helpManual: "Cap the ceiling to magnify subtle drift.",
  },
  render: ({ height, scale }) => (
    <BandHistoryChart
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const BAND_SPARKS: DisplaySpec = {
  kind: "bandSparks",
  label: "Bands + Sparklines",
  description: "Horizontal bars with embedded sparklines",
  icon: Equal,
  defaultScale: { auto: true, value: 100 },
  scaleControl: null,
  render: () => <BandBarsWithSparklines sparklineLength={80} />,
};

const BANDS_COMBINED: DisplaySpec = {
  kind: "bandsCombined",
  label: "Combined bands",
  description: "One canvas: each band shows 4 channels overlaid (overlay)",
  icon: Layers,
  defaultScale: { auto: true, value: 12 },
  scaleControl: {
    label: "dB",
    unit: "dB",
    bipolar: true,
    min: 3,
    max: 40,
    helpAuto: "dB range tracks all overlaid traces (Mind Monitor–style).",
    helpManual: "Fixed ±dB half-span around the current level center.",
  },
  render: ({ height, scale }) => (
    <BandTracesChart
      layout="overlay"
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const BANDS_MULTI: DisplaySpec = {
  kind: "bandsMulti",
  label: "Multichannel bands",
  description: "Stacked strips: one row per band, 4 channel colors",
  icon: Rows3,
  defaultScale: { auto: true, value: 12 },
  scaleControl: {
    label: "dB",
    unit: "dB",
    bipolar: true,
    min: 3,
    max: 40,
    helpAuto: "Each row auto-fits dB min/max for that band.",
    helpManual: "Fixed ±dB half-span on each row.",
  },
  render: ({ height, scale }) => (
    <BandTracesChart
      layout="stacked"
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const WATERFALL: DisplaySpec = {
  kind: "waterfall",
  label: "3D Waterfall",
  description: "IBVA-style temporal FFT (first channel)",
  icon: Layers3,
  defaultScale: { auto: true, value: 60 },
  scaleControl: {
    label: "dB span",
    unit: "dB",
    min: 10,
    max: 120,
    helpAuto: "dB range tracks the signal.",
    helpManual: "Fixed dB window centred at −20 dB.",
  },
  render: ({ height, scale }) => (
    <WaterfallChart
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const BRAIN_STATE: DisplaySpec = {
  kind: "brain",
  label: "Brain State",
  description: "Classifier + dominant band",
  icon: Brain,
  defaultScale: { auto: true, value: 100 },
  scaleControl: null,
  render: () => <BrainStateCard />,
};

const OSC_MON: DisplaySpec = {
  kind: "osc",
  label: "OSC Monitor",
  description: "Live Csound / Max outgoing stream",
  icon: Radio,
  defaultScale: { auto: true, value: 100 },
  scaleControl: null,
  render: ({ height }) => <OSCMonitor height={Math.max(160, height - 40)} />,
};

export const DISPLAY_REGISTRY: Record<DisplayKind, DisplaySpec> = {
  raw: RAW,
  fft: FFT,
  bands: BANDS,
  bandHistory: BAND_HISTORY,
  bandSparks: BAND_SPARKS,
  bandsCombined: BANDS_COMBINED,
  bandsMulti: BANDS_MULTI,
  waterfall: WATERFALL,
  brain: BRAIN_STATE,
  osc: OSC_MON,
};

export const DISPLAY_ORDER: DisplayKind[] = [
  "raw",
  "fft",
  "waterfall",
  "bandsCombined",
  "bandsMulti",
  "bands",
  "bandHistory",
  "bandSparks",
  "brain",
  "osc",
];
