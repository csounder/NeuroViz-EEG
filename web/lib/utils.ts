import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  BAND_NAMES,
  type BandName,
  type BandPowers,
  type BrainStateResult,
} from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(
  value: number | undefined | null,
  digits = 2,
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Classify brain state from relative band powers (0..1). */
export function classifyBrainState(
  relative: BandPowers | undefined,
): BrainStateResult | null {
  if (!relative) return null;
  let dominant: BandName = "alpha";
  let max = -Infinity;
  for (const band of BAND_NAMES) {
    const v = relative[band] ?? 0;
    if (v > max) {
      max = v;
      dominant = band;
    }
  }
  const total = BAND_NAMES.reduce((s, b) => s + (relative[b] ?? 0), 0) || 1;
  const confidence = clamp(max / total, 0, 1);

  let state: BrainStateResult["state"] = "neutral";
  switch (dominant) {
    case "delta":
      state = "drowsy";
      break;
    case "theta":
      state = "relaxed";
      break;
    case "alpha":
      state = "relaxed";
      break;
    case "beta":
      state = "focused";
      break;
    case "gamma":
      state = "aroused";
      break;
  }
  return { state, confidence, dominant };
}

export const STATE_COPY: Record<
  BrainStateResult["state"],
  { label: string; hint: string; color: string }
> = {
  aroused: {
    label: "Aroused",
    hint: "High-frequency activity — excited, alert, or stressed",
    color: "text-rose-400",
  },
  focused: {
    label: "Focused",
    hint: "Beta-dominant — engaged thinking, problem-solving",
    color: "text-amber-300",
  },
  relaxed: {
    label: "Relaxed",
    hint: "Alpha/theta-dominant — calm, creative, present",
    color: "text-emerald-400",
  },
  drowsy: {
    label: "Drowsy",
    hint: "Delta-heavy — low arousal, approaching sleep",
    color: "text-violet-400",
  },
  neutral: {
    label: "Neutral",
    hint: "Balanced band activity across spectrum",
    color: "text-slate-300",
  },
};

export const BAND_COLORS: Record<BandName, string> = {
  delta: "#a855f7",
  theta: "#6366f1",
  alpha: "#22c55e",
  beta: "#f59e0b",
  gamma: "#ef4444",
};

export const BAND_LABELS: Record<BandName, string> = {
  delta: "Delta",
  theta: "Theta",
  alpha: "Alpha",
  beta: "Beta",
  gamma: "Gamma",
};
