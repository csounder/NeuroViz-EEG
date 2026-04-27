/**
 * Short-baseline connectivity for 4-channel Muse layouts (TP9, AF7, AF8, TP10).
 * PLV uses Hilbert phases on band-pass traces from the client filter bank — exploratory,
 * not source-level connectivity.
 */

import { fftRadix2, prevPow2 } from "./fft";
import type { BandName } from "./types";

const CH = ["TP9", "AF7", "AF8", "TP10"] as const;

export type ConnectivityPairSpec = { key: string; a: number; b: number };

/** Standard pairs for mobile EEG: frontal, temporal, and cross-hemisphere diagonals. */
export const DEFAULT_CONNECTIVITY_PAIRS: ConnectivityPairSpec[] = [
  { key: "AF7–AF8", a: 1, b: 2 },
  { key: "TP9–TP10", a: 0, b: 3 },
  { key: "AF7–TP9", a: 1, b: 0 },
  { key: "AF8–TP10", a: 2, b: 3 },
];

export type BandPlvResult = {
  band: BandName;
  pairs: { label: string; plv: number | null }[];
};

function ifftRadix2(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fftRadix2(re, im);
  const inv = 1 / n;
  for (let i = 0; i < n; i++) {
    re[i] *= inv;
    im[i] *= -inv;
  }
}

/** Analytic signal (real + j·Hilbert) via FFT; `re`/`im` overwritten with z[n]. */
function analyticSignalInPlace(re: Float64Array, im: Float64Array) {
  const n = re.length;
  const half = n >> 1;
  fftRadix2(re, im);
  // Single-sided spectrum: double interior positive freqs; zero negative freqs.
  for (let k = 1; k < half; k++) {
    re[k] *= 2;
    im[k] *= 2;
  }
  for (let k = half + 1; k < n; k++) {
    re[k] = 0;
    im[k] = 0;
  }
  ifftRadix2(re, im);
}

function tailSegment(buf: number[] | undefined, maxN: number): Float64Array | null {
  if (!buf?.length) return null;
  const n = prevPow2(Math.min(buf.length, maxN));
  if (n < 64) return null;
  const out = new Float64Array(n);
  const start = buf.length - n;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[start + i] ?? 0;
  mean /= n;
  for (let i = 0; i < n; i++) out[i] = (buf[start + i] ?? 0) - mean;
  return out;
}

/** Phase locking value |⟨e^{i(φ_a−φ_b)}⟩| on equal-length analytic phases. */
function plvFromPhases(cosD: number[], sinD: number[]): number | null {
  const m = Math.min(cosD.length, sinD.length);
  if (m < 32) return null;
  let sc = 0;
  let ss = 0;
  for (let i = 0; i < m; i++) {
    sc += cosD[i];
    ss += sinD[i];
  }
  sc /= m;
  ss /= m;
  const plv = Math.hypot(sc, ss);
  return Math.min(1, Math.max(0, plv));
}

function pairwisePlvOnSegments(a: Float64Array, b: Float64Array): number | null {
  if (a.length !== b.length || a.length < 64) return null;
  const reA = new Float64Array(a);
  const imA = new Float64Array(a.length);
  analyticSignalInPlace(reA, imA);
  const reB = new Float64Array(b);
  const imB = new Float64Array(b.length);
  analyticSignalInPlace(reB, imB);
  const cosD: number[] = [];
  const sinD: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const pa = Math.atan2(imA[i], reA[i]);
    const pb = Math.atan2(imB[i], reB[i]);
    const d = pa - pb;
    cosD.push(Math.cos(d));
    sinD.push(Math.sin(d));
  }
  return plvFromPhases(cosD, sinD);
}

/**
 * @param rollingBandRaw — per-band [channel][samples] from bandFilters
 */
export function bandPlvPairwise(
  rollingBandRaw: Record<BandName, number[][]> | null | undefined,
  band: "alpha" | "beta",
  sampleRateHz: number,
  pairs: ConnectivityPairSpec[] = DEFAULT_CONNECTIVITY_PAIRS,
  maxSamples = 512,
): BandPlvResult | null {
  if (sampleRateHz < 32) return null;
  const bank = rollingBandRaw?.[band];
  if (!bank || bank.length < 4) return null;

  const out: { label: string; plv: number | null }[] = [];
  for (const p of pairs) {
    const segA = tailSegment(bank[p.a], maxSamples);
    const segB = tailSegment(bank[p.b], maxSamples);
    if (!segA || !segB || segA.length !== segB.length) {
      out.push({ label: `${p.key}`, plv: null });
      continue;
    }
    out.push({ label: `${p.key} (${CH[p.a]}–${CH[p.b]})`, plv: pairwisePlvOnSegments(segA, segB) });
  }
  return { band, pairs: out };
}
