"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AudioWaveform,
  BarChart3,
  Brain,
  Equal,
  Layers,
  Layers3,
  LayoutGrid,
  LineChart,
  Monitor,
  PanelTop,
  Radio,
  Rows3,
  Waves,
  Waypoints,
} from "lucide-react";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { FFTChart } from "@/components/charts/FFTChart";
import { BandBars } from "@/components/charts/BandBars";
import { BandHistoryChart } from "@/components/charts/BandHistoryChart";
import { BandBarsWithSparklines } from "@/components/charts/BandBarsWithSparklines";
import { BandTracesChart } from "@/components/charts/BandTracesChart";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { SpectrogramChart } from "@/components/charts/SpectrogramChart";
import { ButterflyEEGChart } from "@/components/charts/ButterflyEEGChart";
import { MuseLabPanel } from "@/components/charts/MuseLabPanel";
import { BrainStateCard } from "@/components/widgets/BrainStateCard";
import { OSCMonitor } from "@/components/widgets/OSCMonitor";
import type { ScaleState } from "@/components/ui/ScaleControl";

/** Available visualizations. Serialized as a string in localStorage layouts. */
export type DisplayKind =
  | "raw"
  | "openbciTs"
  | "butterfly"
  | "spectrogram"
  | "muselab"
  | "fft"
  | "fftSmoothed"
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
  /** Default rolling window for waveform-like panes. */
  defaultTraceWindow?: number;
  /** Render function — receives the height available and control state. */
  render: (opts: {
    height: number;
    scale: ScaleState;
    traceWindow: number;
  }) => React.ReactNode;
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
  defaultTraceWindow: 256,
  render: ({ height, scale, traceWindow }) => (
    <RawEEGChart
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
      windowSamples={traceWindow}
    />
  ),
};

const OPENBCI_TS: DisplaySpec = {
  kind: "openbciTs",
  label: "OpenBCI-style TS",
  description: "High-contrast multi-channel time series (GUI-style)",
  icon: Monitor,
  defaultScale: { auto: true, value: 200 },
  scaleControl: {
    label: "Y",
    unit: "µV",
    bipolar: true,
    min: 10,
    max: 2000,
    helpAuto: "Each lane auto-scales independently.",
    helpManual: "Fixed ±µV range for all lanes.",
  },
  defaultTraceWindow: 256,
  render: ({ height, scale, traceWindow }) => (
    <RawEEGChart
      variant="openbci"
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
      windowSamples={traceWindow}
    />
  ),
};

const BUTTERFLY: DisplaySpec = {
  kind: "butterfly",
  label: "Butterfly EEG",
  description: "Overlaid channels with shared scale (clinical-style)",
  icon: Waypoints,
  defaultScale: { auto: true, value: 200 },
  scaleControl: {
    label: "Amplitude",
    unit: "µV",
    bipolar: true,
    min: 10,
    max: 2000,
    helpAuto: "Single scale from peak across all channels.",
    helpManual: "Fixed ±µV for the shared butterfly gain.",
  },
  defaultTraceWindow: 256,
  render: ({ height, scale, traceWindow }) => (
    <ButterflyEEGChart
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
      windowSamples={traceWindow}
    />
  ),
};

const SPECTROGRAM: DisplaySpec = {
  kind: "spectrogram",
  label: "Spectrogram",
  description: "Rolling STFT heatmap (OpenBCI / EEG toolchain style)",
  icon: LayoutGrid,
  defaultScale: { auto: true, value: 45 },
  scaleControl: {
    label: "dB window",
    unit: "dB",
    bipolar: false,
    min: 15,
    max: 80,
    helpAuto: "Color range tracks min/max dB in the rolling columns.",
    helpManual: "Fixed PSD range: floor −N dB up to +6 dB.",
  },
  render: ({ height, scale }) => (
    <SpectrogramChart
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
    />
  ),
};

const MUSELAB: DisplaySpec = {
  kind: "muselab",
  label: "MuseLab-style",
  description: "Raw traces above spectrum (classic MuseLab layout)",
  icon: PanelTop,
  defaultScale: { auto: true, value: 100 },
  scaleControl: null,
  render: ({ height }) => <MuseLabPanel height={height} />,
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

const FFT_SMOOTHED: DisplaySpec = {
  kind: "fftSmoothed",
  label: "Smoothed FFT",
  description: "Temporally averaged PSD (OpenBCI GUI–like stability)",
  icon: AudioWaveform,
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
      psdTimeSmooth={0.92}
      updateIntervalMs={100}
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
  defaultTraceWindow: 256,
  render: ({ height, scale, traceWindow }) => (
    <BandTracesChart
      layout="overlay"
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
      windowSamples={traceWindow}
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
  defaultTraceWindow: 256,
  render: ({ height, scale, traceWindow }) => (
    <BandTracesChart
      layout="stacked"
      height={height}
      autoScale={scale.auto}
      scaleValue={scale.value}
      windowSamples={traceWindow}
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
  openbciTs: OPENBCI_TS,
  butterfly: BUTTERFLY,
  spectrogram: SPECTROGRAM,
  muselab: MUSELAB,
  fft: FFT,
  fftSmoothed: FFT_SMOOTHED,
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
  "openbciTs",
  "butterfly",
  "spectrogram",
  "muselab",
  "fft",
  "fftSmoothed",
  "waterfall",
  "bandsCombined",
  "bandsMulti",
  "bands",
  "bandHistory",
  "bandSparks",
  "brain",
  "osc",
];
