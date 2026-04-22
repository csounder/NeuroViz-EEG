"use client";

// Client-side DSP pipeline.
//
// Mirrors NeurOSC's chain so every toggle has a visible effect:
//
//   Raw  →  Detrend (DC/drift)
//         →  CAR     (spatial — subtract mean across channels)
//         →  Bandpass (IIR HP → LP, default 1–45 Hz)
//         →  Notch    (IIR, 50 or 60 Hz mains)
//         →  Smoothing (EMA)
//         →  Artifact flag (non-destructive)
//  (computed band powers)
//         →  Log₁₀   (optional)
//         →  Z-score (optional, vs 30-s rolling baseline)
//
// Temporal filters are per-channel; CAR is spatial; both must see the signal
// at its native sample rate (256 Hz for Muse) — not the 10 Hz WS throttled
// rate — so they're applied *inside the simulator loop* and by the server
// for real devices.

import { Biquad } from "./biquad";
import type { BandName, BandPowers } from "./types";

export interface DspConfig {
  masterEnabled: boolean;
  // Temporal / spatial on raw samples
  detrendEnabled: boolean;
  carEnabled: boolean;
  bandpassEnabled: boolean;
  bandpassLo: number; // Hz
  bandpassHi: number; // Hz
  notchEnabled: boolean;
  notchHz: 50 | 60;
  smoothEnabled: boolean;
  smoothAlpha: number; // 0..1 (EMA weight for new sample)
  artifactEnabled: boolean;
  artifactAmplitudeUv: number;
  // Band-power normalization
  logTransformEnabled: boolean;
  zScoreEnabled: boolean;
  baselineWindowSec: number;
}

export const DEFAULT_DSP: DspConfig = {
  masterEnabled: true,
  detrendEnabled: true,
  carEnabled: true,
  bandpassEnabled: true,
  bandpassLo: 1,
  bandpassHi: 45,
  notchEnabled: true,
  notchHz: 60,
  smoothEnabled: false,
  smoothAlpha: 0.3,
  artifactEnabled: true,
  artifactAmplitudeUv: 150,
  logTransformEnabled: false,
  zScoreEnabled: false,
  baselineWindowSec: 30,
};

const NUM_CH = 4;
const BANDS: BandName[] = ["delta", "theta", "alpha", "beta", "gamma"];

interface ChannelState {
  hp: Biquad;
  lp: Biquad;
  notch: Biquad;
  /** Running DC estimate for detrend (leaky integrator). */
  dcOffset: number;
  /** Last EMA-smoothed sample (null = uninitialised). */
  smoothed: number | null;
}

/** Rolling baseline store for z-score per band (global, since Muse sends
 *  global band powers not per-channel). Per-channel keys are namespaced. */
type BaselineStore = Map<string, number[]>;

class ClientDsp {
  private cfg: DspConfig = { ...DEFAULT_DSP };
  private fs = 256;
  private channels: ChannelState[] = [];
  private baseline: BaselineStore = new Map();
  private maxBaselineSamples = 0;

  /** Most recent artifact status (true = artifact detected on this frame). */
  lastArtifact = false;

  constructor() {
    this.rebuildChannels();
    this.redesignFilters();
    this.recomputeBaselineCap();
  }

  // ---------------- Configuration ----------------

  getConfig(): DspConfig {
    return { ...this.cfg };
  }

  /** Update any subset of the DSP configuration. */
  setConfig(patch: Partial<DspConfig>) {
    const prev = this.cfg;
    this.cfg = { ...prev, ...patch };

    // If filter frequencies or notch target changed, redesign.
    const bpChanged =
      prev.bandpassLo !== this.cfg.bandpassLo ||
      prev.bandpassHi !== this.cfg.bandpassHi;
    const notchChanged = prev.notchHz !== this.cfg.notchHz;
    if (bpChanged || notchChanged) this.redesignFilters();

    if (prev.baselineWindowSec !== this.cfg.baselineWindowSec) {
      this.recomputeBaselineCap();
    }
  }

  setSampleRate(fs: number) {
    if (fs === this.fs) return;
    this.fs = fs;
    this.redesignFilters();
  }

  /** Drop all filter and baseline state. Call after reconnect or big changes. */
  reset() {
    this.rebuildChannels();
    this.redesignFilters();
    this.baseline.clear();
  }

  /** Clear rolling baselines only (keeps filter state). */
  resetBaseline() {
    this.baseline.clear();
  }

  // ---------------- Raw EEG (per-sample) ----------------

  /**
   * Process one 4-channel sample. Returns the processed sample plus whether
   * an artifact was detected on this frame. Safe to call at any rate; the
   * filter coefficients are tuned for `fs` (call setSampleRate to match).
   */
  processEEG(raw: number[]): { values: number[]; artifact: boolean } {
    if (!this.cfg.masterEnabled) {
      return { values: raw.slice(), artifact: false };
    }

    const x = raw.slice();
    // 1. Detrend: leaky DC estimate per channel, then subtract.
    if (this.cfg.detrendEnabled) {
      const dcAlpha = 0.001; // ~1000-sample time constant → very slow drift
      for (let i = 0; i < x.length; i++) {
        const s = this.channels[i];
        s.dcOffset = s.dcOffset * (1 - dcAlpha) + x[i] * dcAlpha;
        x[i] = x[i] - s.dcOffset;
      }
    }

    // 2. CAR — subtract mean across channels (spatial). Needs ≥ 2 channels.
    if (this.cfg.carEnabled && x.length >= 2) {
      let sum = 0;
      for (let i = 0; i < x.length; i++) sum += x[i];
      const mean = sum / x.length;
      for (let i = 0; i < x.length; i++) x[i] -= mean;
    }

    // 3. Bandpass: highpass → lowpass cascade (RBJ biquads).
    if (this.cfg.bandpassEnabled) {
      for (let i = 0; i < x.length; i++) {
        const s = this.channels[i];
        x[i] = s.hp.process(x[i]);
        x[i] = s.lp.process(x[i]);
      }
    }

    // 4. Notch.
    if (this.cfg.notchEnabled) {
      for (let i = 0; i < x.length; i++) {
        x[i] = this.channels[i].notch.process(x[i]);
      }
    }

    // 5. Smoothing — simple EMA.
    if (this.cfg.smoothEnabled) {
      const α = Math.max(0.01, Math.min(1, this.cfg.smoothAlpha));
      for (let i = 0; i < x.length; i++) {
        const s = this.channels[i];
        s.smoothed =
          s.smoothed === null ? x[i] : s.smoothed * (1 - α) + x[i] * α;
        x[i] = s.smoothed;
      }
    }

    // 6. Artifact detection (non-destructive).
    let artifact = false;
    if (this.cfg.artifactEnabled) {
      const limit = this.cfg.artifactAmplitudeUv;
      for (let i = 0; i < x.length; i++) {
        if (Math.abs(x[i]) > limit) {
          artifact = true;
          break;
        }
      }
    }
    this.lastArtifact = artifact;
    return { values: x, artifact };
  }

  // ---------------- Band powers ----------------

  /**
   * Apply log + z-score normalisation to one band-power set. `channelKey`
   * can be anything stable (Muse sends global bands → we pass "ALL").
   */
  normalizeBandPowers(
    absolute: BandPowers,
    channelKey = "ALL",
  ): BandPowers {
    const out: BandPowers = { ...absolute };
    for (const band of BANDS) {
      let v = out[band] ?? 0;
      if (this.cfg.logTransformEnabled) {
        v = Math.log10(Math.max(v, 1e-10));
      }
      if (this.cfg.zScoreEnabled) {
        v = this.zScore(channelKey, band, v);
      }
      out[band] = v;
    }
    return out;
  }

  private zScore(ch: string, band: BandName, v: number): number {
    const key = `${ch}::${band}`;
    let hist = this.baseline.get(key);
    if (!hist) {
      hist = [];
      this.baseline.set(key, hist);
    }
    hist.push(v);
    if (hist.length > this.maxBaselineSamples) hist.shift();

    if (hist.length < 10) return v; // not enough data yet — return raw
    let sum = 0;
    for (const x of hist) sum += x;
    const mean = sum / hist.length;
    let vsum = 0;
    for (const x of hist) vsum += (x - mean) * (x - mean);
    const std = Math.sqrt(vsum / hist.length);
    if (std < 1e-10) return 0;
    return (v - mean) / std;
  }

  /** Returns how ready the z-score baseline is (0..1, per the window size). */
  baselineProgress(channelKey = "ALL"): number {
    const key = `${channelKey}::alpha`; // alpha is representative
    const hist = this.baseline.get(key);
    if (!hist) return 0;
    return Math.max(0, Math.min(1, hist.length / this.maxBaselineSamples));
  }

  /**
   * Jump-start the rolling baseline for a band with a synthetic window drawn
   * from a given mean/std. Called by the calibration flow so z-score is
   * immediately meaningful after a guided calibration, instead of needing
   * another 30 s of history to settle.
   */
  seedBaseline(
    channelKey: string,
    band: BandName,
    mean: number,
    std: number,
  ) {
    const key = `${channelKey}::${band}`;
    const n = this.maxBaselineSamples;
    const hist: number[] = [];
    for (let i = 0; i < n; i++) {
      // Draw from a normal-like distribution (Box–Muller) so the baseline
      // reflects the calibration's measured variance.
      const u1 = Math.max(1e-9, Math.random());
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      hist.push(mean + std * z);
    }
    this.baseline.set(key, hist);
  }

  // ---------------- Internals ----------------

  private rebuildChannels() {
    this.channels = [];
    for (let i = 0; i < NUM_CH; i++) {
      this.channels.push({
        hp: Biquad.highpass(this.fs, 1, 0.707),
        lp: Biquad.lowpass(this.fs, 45, 0.707),
        notch: Biquad.notch(this.fs, 60, 30),
        dcOffset: 0,
        smoothed: null,
      });
    }
  }

  private redesignFilters() {
    for (const s of this.channels) {
      s.hp.configHighpass(this.fs, this.cfg.bandpassLo, 0.707);
      s.lp.configLowpass(this.fs, this.cfg.bandpassHi, 0.707);
      s.notch.configNotch(this.fs, this.cfg.notchHz, 30);
      s.hp.reset();
      s.lp.reset();
      s.notch.reset();
    }
  }

  private recomputeBaselineCap() {
    // Baselines are updated at the band-power rate (~10 Hz typical)
    const ratePerSec = 10;
    this.maxBaselineSamples = Math.max(
      30,
      Math.round(this.cfg.baselineWindowSec * ratePerSec),
    );
  }
}

/** Module-level singleton — shared by the simulator loop, WS ingest, etc. */
export const dsp = new ClientDsp();
