/**
 * Global preset for EEG band integration edges (δ–γ).
 * Drives the browser band-pass trace bank, and syncs to the Node bridge for
 * Welch / FFT band-power bins (Csound, Concert, REST /api/bands, Stimulus).
 */

import type { BandEdgeProfile } from "./bandFilters";
import type { BandEdgePreset } from "./types";

export type { BandEdgePreset };

export const BAND_EDGE_LS_KEY = "neurovis.bandEdgePreset";

export const BAND_EDGE_PRESET_OPTIONS: {
  id: BandEdgePreset;
  label: string;
  summary: string;
}[] = [
  {
    id: "neurovis",
    label: "NeuroVis default",
    summary:
      "δ 0.5–4 Hz — exploratory default. Slightly more sub-1 Hz energy in the δ bucket (drift-sensitive on dry EEG).",
  },
  {
    id: "research_dc",
    label: "Research · stricter δ",
    summary:
      "δ 1–4 Hz (Mind Monitor δ low edge); θ–γ unchanged. Cuts very-slow drift from the δ band without redefining other bands.",
  },
  {
    id: "mindmonitor",
    label: "Mind Monitor (full)",
    summary:
      "All bands match Mind Monitor manual (α 7.5–13 Hz, γ 30–44 Hz, …). Use when matching Mind Monitor OSC/exports.",
  },
];

export function coerceBandEdgePreset(v: unknown): BandEdgePreset {
  if (v === "research_dc" || v === "mindmonitor" || v === "neurovis") return v;
  return "neurovis";
}

/** Same string union as `BandEdgeProfile` — use with `bandFilters.setEdgeProfile`. */
export function presetToBandEdgeProfile(preset: BandEdgePreset): BandEdgeProfile {
  return preset;
}
