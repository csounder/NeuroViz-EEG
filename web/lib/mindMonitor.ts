/**
 * Mind Monitor (iOS) — documented signal conventions we emulate in NeuroVis.
 *
 * References (public help / technical manual):
 * - Absolute band powers: log of PSD integrated per canonical band; discrete
 *   spectrum: FFT of raw EEG with a Hamming window; spectrogram uses the same
 *   discrete values over time.
 * - Published band edges (Hz): δ 1–4, θ 4–8, α 7.5–13, β 13–30, γ 30–44.
 * - MuseIO-style OSC: `/muse/elements/raw_fft0` … `raw_fft3` each carry 129
 *   floats: log PSD from 0–110 Hz (dB-scale coefficients; ~−40…+20 typical).
 *
 * We do not claim bit-identical output to Interaxon’s closed stack; this mode
 * targets address compatibility and visually similar processing for Csound /
 * MuseLab-style receivers.
 */

import type { BandName } from "./types";

/** Mind Monitor technical manual band limits (Hz). */
export const MIND_MONITOR_BAND_EDGES: Record<BandName, [number, number]> = {
  delta: [1, 4],
  theta: [4, 8],
  alpha: [7.5, 13],
  beta: [13, 30],
  gamma: [30, 44],
};

export const MIND_MONITOR_FFT_MAX_HZ = 110;
export const MIND_MONITOR_RAW_FFT_BINS = 129;
export const MIND_MONITOR_FFT_SIZE = 256;

/** Linear interpolation of PSD (dB) at frequency f Hz from FFT bins. */
export function resamplePsdToMindMonitorBins(
  psdDb: Float64Array,
  freqs: Float64Array,
  binCount = MIND_MONITOR_RAW_FFT_BINS,
  maxHz = MIND_MONITOR_FFT_MAX_HZ,
): number[] {
  const out: number[] = [];
  if (!psdDb.length || !freqs.length) {
    for (let i = 0; i < binCount; i++) out.push(-80);
    return out;
  }
  const fMaxData = freqs[freqs.length - 1] ?? maxHz;

  for (let i = 0; i < binCount; i++) {
    const f =
      binCount <= 1 ? 0 : (i / (binCount - 1)) * maxHz;
    if (f <= freqs[0]) {
      out.push(psdDb[0]);
      continue;
    }
    if (f >= fMaxData) {
      out.push(psdDb[psdDb.length - 1]);
      continue;
    }
    let k = 1;
    while (k < freqs.length && freqs[k] < f) k++;
    const f0 = freqs[k - 1];
    const f1 = freqs[k];
    const t = (f - f0) / (f1 - f0 || 1);
    out.push(psdDb[k - 1] * (1 - t) + psdDb[k] * t);
  }
  return out;
}
