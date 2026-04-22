"use client";

import { useEffect, useState } from "react";

// Presets — named bundles of {OSC config, filter/DSP config, range settings}.
// Stored in localStorage so they persist across sessions, exported/imported as
// JSON for sharing between machines or Csound/Max pieces.

export type PresetScope = "osc" | "dsp" | "ranges" | "full";

export interface OscPresetData {
  oscHost?: string;
  oscPort?: number;
  oscPrefix?: string;
  oscRate?: number;
  oscSmoothing?: number;
  oscScale?: number;
  oscStreams?: {
    rawEEG?: boolean;
    bandPowers?: boolean;
    bandAbsolute?: boolean;
    bandRelative?: boolean;
    motion?: boolean;
    motionAccel?: boolean;
    motionGyro?: boolean;
    ppg?: boolean;
    fnirs?: boolean;
  };
  oscSending?: boolean;
}

export interface DspPresetData {
  filter?: {
    type?: string; // kept for backwards compatibility (single value)
    types?: string[]; // multi-select filter chain
    enabled?: boolean;
  };
  smooth?: { type?: string; amount?: number; enabled?: boolean };
  gate?: { type?: string; threshold?: number; enabled?: boolean };
  shape?: { type?: string; amount?: number; enabled?: boolean };
  notch?: { hz?: number; enabled?: boolean };
  applyCAR?: boolean;
  applyNotch?: boolean;
  applyBandpass?: boolean;
  smoothingAmount?: number;
}

export interface RangesPresetData {
  oscScaleMode?: "normalize" | "raw" | "none";
  oscOutputScaler?: number;
  oscAllowNegative?: boolean;
  // Per-band range overrides (0..1 usually)
  bandRanges?: {
    delta?: [number, number];
    theta?: [number, number];
    alpha?: [number, number];
    beta?: [number, number];
    gamma?: [number, number];
  };
  applyBaseline?: boolean;
  logTransform?: boolean;
}

export interface Preset {
  id: string; // slug
  name: string;
  description?: string;
  scope: PresetScope;
  createdAt: number;
  updatedAt: number;
  // Exactly one of these is populated per scope (or all, if scope=full)
  osc?: OscPresetData;
  dsp?: DspPresetData;
  ranges?: RangesPresetData;
}

const STORAGE_KEY = "neurovis.presets.v1";

function read(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(presets: Preset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    // Notify listeners in other tabs / components
    window.dispatchEvent(new CustomEvent("neurovis:presets-changed"));
  } catch {}
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `preset-${Date.now()}`
  );
}

export const presetStore = {
  list(scope?: PresetScope): Preset[] {
    const all = read();
    return scope ? all.filter((p) => p.scope === scope || p.scope === "full") : all;
  },
  get(id: string): Preset | undefined {
    return read().find((p) => p.id === id);
  },
  save(input: Omit<Preset, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const now = Date.now();
    const presets = read();
    let id = input.id ?? slug(input.name);
    // Ensure unique id
    if (!input.id && presets.some((p) => p.id === id)) {
      id = `${id}-${now.toString(36).slice(-4)}`;
    }
    const existing = presets.find((p) => p.id === id);
    const preset: Preset = {
      id,
      name: input.name,
      description: input.description,
      scope: input.scope,
      osc: input.osc,
      dsp: input.dsp,
      ranges: input.ranges,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing
      ? presets.map((p) => (p.id === id ? preset : p))
      : [...presets, preset];
    write(next);
    return preset;
  },
  delete(id: string) {
    write(read().filter((p) => p.id !== id));
  },
  rename(id: string, name: string) {
    const presets = read();
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    p.name = name;
    p.updatedAt = Date.now();
    write(presets);
  },
  exportAll(): string {
    return JSON.stringify(
      { format: "neurovis-presets", version: 1, presets: read() },
      null,
      2,
    );
  },
  import(json: string): { added: number; updated: number } {
    try {
      const data = JSON.parse(json);
      const incoming: Preset[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.presets)
          ? data.presets
          : [];
      if (!incoming.length) return { added: 0, updated: 0 };
      const existing = read();
      const byId = new Map(existing.map((p) => [p.id, p]));
      let added = 0;
      let updated = 0;
      for (const p of incoming) {
        if (!p.id || !p.name || !p.scope) continue;
        if (byId.has(p.id)) updated++;
        else added++;
        byId.set(p.id, p);
      }
      write([...byId.values()]);
      return { added, updated };
    } catch {
      return { added: 0, updated: 0 };
    }
  },
};

/** Convenience React hook that subscribes to preset changes. */
export function usePresets(scope?: PresetScope): Preset[] {
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => {
    const refresh = () => setPresets(presetStore.list(scope));
    refresh();
    const handler = () => refresh();
    window.addEventListener("neurovis:presets-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("neurovis:presets-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [scope]);
  return presets;
}
