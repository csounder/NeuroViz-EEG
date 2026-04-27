/**
 * Pairwise and heart–brain summaries for 4-channel Muse-class layouts.
 * Correlation / coupling metrics are exploratory, not connectivity inference.
 */

import type { ResearchStreamSample } from "./researchTypes";

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 8) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += a[i];
    my += b[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = a[i] - mx;
    const dy = b[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx < 1e-12 || syy < 1e-12) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Pearson r on last `maxSamples` points of frontal alpha-filtered traces (AF7 vs AF8). */
export function frontalAlphaEnvelopeCorrelation(
  alphaBuffers: number[][] | undefined,
  maxSamples = 512,
): number | null {
  if (!alphaBuffers || alphaBuffers.length < 3) return null;
  const af7 = alphaBuffers[1] ?? [];
  const af8 = alphaBuffers[2] ?? [];
  const n = Math.min(maxSamples, af7.length, af8.length);
  if (n < 8) return null;
  const a = af7.slice(-n);
  const b = af8.slice(-n);
  return pearson(a, b);
}

/** Pearson r between aggregate relative α (from band stream) and a PPG amplitude proxy. */
export function hrAlphaCouplingPearson(
  bandTimeseries: { t: number; rel: Record<string, number> }[],
  ppgSeries: { t: number; scalar: number }[],
  maxPairs = 120,
): number | null {
  if (bandTimeseries.length < 8 || ppgSeries.length < 8) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const recent = bandTimeseries.slice(-maxPairs * 2);
  for (const b of recent) {
    let nearest: { t: number; scalar: number } | null = null;
    let best = Infinity;
    for (const p of ppgSeries) {
      const d = Math.abs(p.t - b.t);
      if (d < best && d < 800) {
        best = d;
        nearest = p;
      }
    }
    if (!nearest) continue;
    xs.push(b.rel.alpha ?? 0);
    ys.push(nearest.scalar);
  }
  if (xs.length < 10) return null;
  return pearson(xs, ys);
}

export function ppgSeriesScalars(samples: { t: number; values: number[] }[]): { t: number; scalar: number }[] {
  return samples.map((s) => ({
    t: s.t,
    scalar: s.values.length
      ? s.values.reduce((a, v) => a + Math.abs(Number(v)), 0) / s.values.length
      : 0,
  }));
}

function nearestPpgScalar(
  series: { t: number; scalar: number }[],
  t: number,
  winMs: number,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const p of series) {
    const d = Math.abs(p.t - t);
    if (d <= winMs && d < bestD) {
      bestD = d;
      best = p.scalar;
    }
  }
  return best;
}

/**
 * Correlates sample-to-sample changes in frontal mean (AF7+AF8)/2 with changes in PPG amplitude.
 * High positive r can indicate pulse-linked artifact (exploratory).
 */
export function cardiacFrontalPpgDiffCorrelation(
  timeline: ResearchStreamSample[],
  ppgHistory: { t: number; values: number[] }[],
): { r: number | null; contaminationHint: string | null } {
  const ppg = ppgSeriesScalars(ppgHistory);
  if (timeline.length < 12 || ppg.length < 8) return { r: null, contaminationHint: null };
  const recent = timeline.slice(-Math.min(500, timeline.length));
  const fd: number[] = [];
  const pd: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const cur = recent[i];
    const prev = recent[i - 1];
    const f = (cur.eeg[1] + cur.eeg[2]) / 2;
    const fp = (prev.eeg[1] + prev.eeg[2]) / 2;
    const pn = nearestPpgScalar(ppg, cur.wallMs, 140);
    const pp = nearestPpgScalar(ppg, prev.wallMs, 140);
    if (pn != null && pp != null) {
      fd.push(f - fp);
      pd.push(pn - pp);
    }
  }
  const r = pearson(fd, pd);
  let contaminationHint: string | null = null;
  if (r != null && r >= 0.45) {
    contaminationHint =
      "Δ-frontal vs Δ-PPG correlation is high — possible pulse / cardiac leakage in frontal channels (exploratory).";
  }
  return { r, contaminationHint };
}
