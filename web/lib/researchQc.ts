/**
 * Lightweight spectral / QC metrics for consumer EEG (4ch, coarse FFT bins).
 * Intended for Research dashboard flags, not clinical grading.
 */

import { computePSD } from "./fft";
import type { BandName } from "./types";
import { BAND_NAMES } from "./types";

export type SpectralQcResult = {
  mains_hz: 50 | 60;
  line_band_hz: [number, number];
  /** Ratio of power in line band vs broadband (1–45 Hz), per channel mean. */
  line_to_broadband_ratio: number | null;
  /** Power at ~2× and ~3× mains vs broadband (mean across channels). */
  line_harmonic_ratio: number | null;
  /** OLS slope of log10(power) vs log10(freq) in 2–35 Hz (rough 1/f proxy), mean across channels. */
  log_slope_db_per_decade: number | null;
  /** Common reporting: exponent ≈ −slope on log–log power (exploratory). */
  one_over_f_exponent_proxy: number | null;
  flags: string[];
  /** Where the spectrum came from (server rarely sends full FFT today). */
  source: "websocket_fft" | "browser_psd";
};

function nearestBin(freqs: number[], f: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < freqs.length; i++) {
    const d = Math.abs(freqs[i] - f);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function bandPowerSum(
  freqs: number[],
  magRow: number[],
  lo: number,
  hi: number,
): number {
  let s = 0;
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    if (f >= lo && f <= hi && Number.isFinite(magRow[i])) s += magRow[i] * magRow[i];
  }
  return s;
}

/** Pick 50 vs 60 Hz based on which line harmonic band is stronger (coarse). */
function inferMains(freqs: number[], magnitudes: number[][]): 50 | 60 {
  if (!freqs.length || !magnitudes.length) return 60;
  const row = magnitudes[0] ?? [];
  const p50 =
    bandPowerSum(freqs, row, 48, 52) +
    bandPowerSum(freqs, row, 98, 102) * 0.25;
  const p60 =
    bandPowerSum(freqs, row, 58, 62) +
    bandPowerSum(freqs, row, 118, 122) * 0.25;
  return p50 > p60 * 1.15 ? 50 : 60;
}

/**
 * @param magnitudes — FFT magnitude per channel (same length as freqs)
 */
export function computeSpectralQc(
  freqs: number[],
  magnitudes: number[][],
  opts?: { mainsHint?: 50 | 60 },
): SpectralQcResult {
  const flags: string[] = [];
  if (!freqs.length || !magnitudes.length) {
    return {
      mains_hz: opts?.mainsHint ?? 60,
      line_band_hz: [59, 61],
      line_to_broadband_ratio: null,
      line_harmonic_ratio: null,
      log_slope_db_per_decade: null,
      one_over_f_exponent_proxy: null,
      flags: ["no_fft"],
      source: "websocket_fft",
    };
  }

  const mains = opts?.mainsHint ?? inferMains(freqs, magnitudes);
  const fLine = mains;
  const lineLo = fLine - 1.5;
  const lineHi = fLine + 1.5;

  const broadLo = 1;
  const broadHi = 45;

  const ratios: number[] = [];
  const harmRatios: number[] = [];
  const slopes: number[] = [];
  const fNyq = freqs[freqs.length - 1] ?? 55;

  for (const row of magnitudes) {
    if (!row || row.length !== freqs.length) continue;
    const lineP = bandPowerSum(freqs, row, lineLo, lineHi);
    const broadP = bandPowerSum(freqs, row, broadLo, broadHi);
    if (broadP > 1e-18) ratios.push(lineP / broadP);
    const h2lo = 2 * fLine - 2;
    const h2hi = 2 * fLine + 2;
    const h3lo = 3 * fLine - 2;
    const h3hi = 3 * fLine + 2;
    let harmP = 0;
    if (h2hi <= fNyq) harmP += bandPowerSum(freqs, row, h2lo, h2hi);
    if (h3hi <= fNyq) harmP += bandPowerSum(freqs, row, h3lo, h3hi);
    if (broadP > 1e-18) harmRatios.push(harmP / broadP);
    if (broadP > 1e-18 && lineP / broadP > 0.08) {
      /* channel-specific spike handled in mean */
    }

    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      if (f < 2 || f > 35) continue;
      if (f > fLine - 2 && f < fLine + 2) continue;
      const m = row[i];
      if (!Number.isFinite(m) || m <= 0) continue;
      xs.push(Math.log10(f));
      ys.push(Math.log10(m * m));
    }
    if (xs.length >= 6) {
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let num = 0;
      let den = 0;
      for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) * (xs[i] - mx);
      }
      if (den > 1e-12) slopes.push(num / den);
    }
  }

  const line_to_broadband_ratio =
    ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
  const line_harmonic_ratio =
    harmRatios.length > 0 ? harmRatios.reduce((a, b) => a + b, 0) / harmRatios.length : null;
  const log_slope_db_per_decade =
    slopes.length > 0 ? slopes.reduce((a, b) => a + b, 0) / slopes.length : null;
  const one_over_f_exponent_proxy =
    log_slope_db_per_decade != null ? -log_slope_db_per_decade : null;

  if (line_to_broadband_ratio != null && line_to_broadband_ratio > 0.12) {
    flags.push("strong_line_noise");
  }
  if (line_to_broadband_ratio != null && line_to_broadband_ratio > 0.25) {
    flags.push("severe_line_noise");
  }
  if (line_harmonic_ratio != null && line_harmonic_ratio > 0.06) {
    flags.push("line_harmonics");
  }

  return {
    mains_hz: mains,
    line_band_hz: [lineLo, lineHi],
    line_to_broadband_ratio,
    line_harmonic_ratio,
    log_slope_db_per_decade,
    one_over_f_exponent_proxy,
    flags,
    source: "websocket_fft",
  };
}

/**
 * When the WebSocket `eeg.fft` payload is not a full spectrum (common: server sends band summaries only),
 * estimate line noise and 1/f slope from the per-channel raw ring buffers in the browser.
 */
export function spectralQcFromRollingRaw(
  rollingRaw: number[][],
  sampleRateHz: number,
  opts?: { targetN?: number },
): SpectralQcResult | null {
  if (!rollingRaw?.length || sampleRateHz <= 0) return null;
  const targetN = opts?.targetN ?? 256;
  const magnitudes: number[][] = [];
  let freqs: number[] | null = null;

  for (let ch = 0; ch < 4; ch++) {
    const buf = rollingRaw[ch];
    if (!buf || buf.length < 64) continue;
    const psd = computePSD(buf, sampleRateHz, {
      targetN,
      minFreq: 0.5,
      maxFreq: Math.min(55, sampleRateHz / 2 - 1),
      window: "hamming",
    });
    if (!psd || psd.freqs.length < 8) continue;
    if (!freqs) freqs = Array.from(psd.freqs);
    else if (psd.freqs.length !== freqs.length) continue;

    const row = Array.from(psd.psdDb, (db) => Math.sqrt(Math.pow(10, db / 10)));
    magnitudes.push(row);
  }

  if (!freqs || magnitudes.length === 0) return null;
  const qc = computeSpectralQc(freqs, magnitudes);
  const flags =
    sampleRateHz < 45 ? [...qc.flags, "nyquist_below_mains_line"] : qc.flags;
  return { ...qc, flags, source: "browser_psd" };
}

export function formatSpectralQcLine(qc: SpectralQcResult): string {
  const r =
    qc.line_to_broadband_ratio != null ? (qc.line_to_broadband_ratio * 100).toFixed(2) : "—";
  const h =
    qc.line_harmonic_ratio != null ? (qc.line_harmonic_ratio * 100).toFixed(2) : "—";
  const s =
    qc.log_slope_db_per_decade != null ? qc.log_slope_db_per_decade.toFixed(2) : "—";
  const fg = qc.flags.length ? qc.flags.join(", ") : "ok";
  const src = qc.source === "browser_psd" ? "browser PSD" : "WS FFT";
  return `${src} · ${qc.mains_hz} Hz · line/broad ${r}% · harm ${h}% · slope ${s} · ${fg}`;
}

/** Map relative band vector to a simple EMG / muscle proxy (high-frequency share). */
export function emgProxyFromRelative(rel: Record<BandName, number> | null | undefined): number | null {
  if (!rel) return null;
  const g = rel.gamma ?? 0;
  const b = rel.beta ?? 0;
  const den = BAND_NAMES.reduce((s, k) => s + (rel[k] ?? 0), 0) || 1;
  return (g + 0.35 * b) / den;
}
