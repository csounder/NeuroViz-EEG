/**
 * Exploratory vigilance / drowsiness proxy from wearable band powers + EMG proxy.
 * Not PERCLOS, not clinical sleep staging — transparent weighted blend with caveats.
 */

import type { BandName } from "./types";

export type VigilanceBreakdown = {
  /** 1 ≈ alert, 0 ≈ very low vigilance (heuristic). */
  vigilance01: number;
  /** Complement of vigilance for plotting “drowsiness pressure”. */
  drowsyPressure01: number;
  weights: {
    delta: number;
    theta: number;
    betaLow: number;
    alphaDrift: number;
    emg: number;
  };
  /** Normalized contributor levels (0–1) before weighting. */
  contributors: {
    delta: number;
    theta: number;
    betaLow: number;
    alphaDrift: number;
    emg: number;
  };
  caveat: string;
};

const CAVEAT =
  "Consumer EEG + band powers only: no camera (PERCLOS), no EOG. Use as a trend / block QA strip, not diagnosis.";

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

/**
 * @param relative — relative band powers (0–1), same as UI
 * @param alphaEma — slow EMA of relative alpha (same clock as updates)
 * @param alphaInst — current relative alpha
 * @param emg01 — high-frequency / EMG proxy in ~0–1
 */
export function computeVigilanceProxy(
  relative: Record<BandName, number> | null | undefined,
  alphaEma: number,
  alphaInst: number,
  emg01: number,
): VigilanceBreakdown | null {
  if (!relative) return null;
  const d = clamp01(relative.delta ?? 0);
  const t = clamp01(relative.theta ?? 0);
  const b = clamp01(relative.beta ?? 0);
  const a = clamp01(relative.alpha ?? 0);
  const emg = clamp01(emg01);

  // “Slow rolling alpha” vs instant: positive when envelope drifts up (eyes closed / drowsy pattern heuristic)
  const alphaDrift = clamp01(Math.max(0, alphaEma - alphaInst) * 2.5 + Math.max(0, alphaEma - 0.35) * 0.4);

  const betaLow = clamp01(1 - b);

  const w = {
    delta: 0.22,
    theta: 0.22,
    betaLow: 0.2,
    alphaDrift: 0.18,
    emg: 0.18,
  };

  const contributors = { delta: d, theta: t, betaLow, alphaDrift, emg };

  const pressure =
    w.delta * d +
    w.theta * t +
    w.betaLow * betaLow +
    w.alphaDrift * alphaDrift +
    w.emg * emg;

  const drowsyPressure01 = clamp01(pressure);
  const vigilance01 = clamp01(1 - drowsyPressure01);

  return {
    vigilance01,
    drowsyPressure01,
    weights: w,
    contributors,
    caveat: CAVEAT,
  };
}
