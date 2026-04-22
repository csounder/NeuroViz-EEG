/**
 * Mind Monitor–style scaling for band-pass trace amplitudes.
 *
 * Mind Monitor lists per-channel band levels in dB (e.g. 89 dB, 93 dB). The
 * exact Muse SDK formula is proprietary; for visualization we use band-limited
 * **voltage** (µV), map to **power** P = u², then **10·log10(P)** with a
 * calibration offset so typical EEG excursions land in the same numeric band
 * as Mind Monitor (~80–100 dB on screen).
 */

const EPS = 1e-14;

/** Offset chosen so ~10 µV RMS-like samples read near ~90 dB. */
const DB_OFFSET = 70;

export function bandUvToMindMonitorDb(uv: number): number {
  const p = uv * uv + EPS;
  return DB_OFFSET + 10 * Math.log10(p);
}

/** 3-point moving average on ring-buffer index (reduces speckle before log). */
export function smoothUv3(buf: number[], i: number): number {
  const n = buf.length;
  if (n === 0) return 0;
  if (n === 1) return buf[0] ?? 0;
  const il = Math.max(0, i - 1);
  const ir = Math.min(n - 1, i + 1);
  let sum = 0;
  let c = 0;
  for (let k = il; k <= ir; k++) {
    sum += buf[k] ?? 0;
    c++;
  }
  return sum / c;
}

export function sampleUvToMindMonitorDb(buf: number[], i: number): number {
  return bandUvToMindMonitorDb(smoothUv3(buf, i));
}
