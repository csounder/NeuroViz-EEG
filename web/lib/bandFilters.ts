"use client";

// A 5-band × 4-channel bandpass bank.
//
// For every raw EEG sample (ch0..ch3) we produce 5 filtered samples per
// channel — one per canonical EEG band — by running a pair of biquads in
// series (high-pass → low-pass). The filtered outputs let us draw per-band
// time-domain traces without re-doing an FFT, powering Mind-Monitor-style
// multichannel-per-band views.

import { Biquad } from "./biquad";
import { BAND_NAMES, type BandName } from "./types";
import { MIND_MONITOR_BAND_EDGES } from "./mindMonitor";

/** Canonical EEG band edges (Hz) for trace visualization. */
export const BAND_BOUNDS: Record<BandName, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 50],
};

/**
 * Stricter δ low edge (1 Hz) matching Mind Monitor’s δ floor; θ–γ stay on NeuroVis edges.
 * Reduces very-slow drift / motion energy counted as “delta” in wearable EEG.
 */
export const RESEARCH_DC_BAND_BOUNDS: Record<BandName, [number, number]> = {
  ...BAND_BOUNDS,
  delta: [1, 4],
};

export type BandEdgeProfile = "neurovis" | "mindmonitor" | "research_dc";

export function bandBoundsForProfile(profile: BandEdgeProfile): Record<BandName, [number, number]> {
  if (profile === "mindmonitor") return { ...MIND_MONITOR_BAND_EDGES };
  if (profile === "research_dc") return { ...RESEARCH_DC_BAND_BOUNDS };
  return { ...BAND_BOUNDS };
}

const NUM_CHANNELS = 4;

class BandFilterBank {
  private fs = 256;
  private edgeProfile: BandEdgeProfile = "neurovis";
  /** [band][channel] = [highpass, lowpass] biquads in series. */
  private filters: Record<BandName, Biquad[][]> = {} as any;

  constructor() {
    this.rebuild(this.fs);
  }

  setSampleRate(fs: number) {
    if (fs === this.fs) return;
    this.fs = fs;
    this.rebuild(fs);
  }

  /** Switch band edges between NeuroVis defaults and Mind Monitor manual. */
  setEdgeProfile(profile: BandEdgeProfile) {
    if (this.edgeProfile === profile) return;
    this.edgeProfile = profile;
    this.rebuild(this.fs);
  }

  getEdgeProfile(): BandEdgeProfile {
    return this.edgeProfile;
  }

  private bandEdges(): Record<BandName, [number, number]> {
    return bandBoundsForProfile(this.edgeProfile);
  }

  private rebuild(fs: number) {
    const bounds = this.bandEdges();
    for (const band of BAND_NAMES) {
      const [lo, hi] = bounds[band];
      const chans: Biquad[][] = [];
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        chans.push([
          Biquad.highpass(fs, lo, 0.707),
          Biquad.lowpass(fs, hi, 0.707),
        ]);
      }
      this.filters[band] = chans;
    }
  }

  reset() {
    for (const band of BAND_NAMES) {
      for (const ch of this.filters[band]) {
        for (const f of ch) f.reset();
      }
    }
  }

  /**
   * Process one 4-channel sample. Returns an object keyed by band, each value
   * is a length-4 array of the band-filtered sample for each channel.
   */
  process(raw: number[]): Record<BandName, number[]> {
    const out = {} as Record<BandName, number[]>;
    for (const band of BAND_NAMES) {
      const row: number[] = [];
      const chans = this.filters[band];
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        let x = raw[ch] ?? 0;
        x = chans[ch][0].process(x); // highpass
        x = chans[ch][1].process(x); // lowpass
        row.push(x);
      }
      out[band] = row;
    }
    return out;
  }
}

/** Module-level singleton shared by the simulator loop + any ingest path. */
export const bandFilters = new BandFilterBank();
