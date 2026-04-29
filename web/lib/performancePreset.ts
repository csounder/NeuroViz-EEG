import type { V12RenderControls } from "@/components/csound/CsoundV12Renderer";
import {
  CONCERT_SCENES,
  CONCERT_SHIFT_SCENES,
  type ConcertScene,
} from "@/components/concert/ConcertVisualizer";
import { coerceBandEdgePreset } from "@/lib/bandEdgePreset";
import type { BandEdgePreset, BandName } from "@/lib/types";

export const PERFORMANCE_PRESET_FORMAT = "neurovis-performance-preset" as const;
export const PERFORMANCE_PRESET_VERSION = 1 as const;

const BANDS: BandName[] = ["delta", "theta", "alpha", "beta", "gamma"];
const SCENE_IDS = new Set<string>([
  ...CONCERT_SCENES.map((s) => s.id),
  ...CONCERT_SHIFT_SCENES.map((s) => s.id),
]);

export type PerformancePresetConcertSlice = {
  scene: ConcertScene;
  intensity: number;
  trails: number;
  showHud: boolean;
  showControls: boolean;
};

export type NeuroVisPerformancePresetV1 = {
  format: typeof PERFORMANCE_PRESET_FORMAT;
  version: typeof PERFORMANCE_PRESET_VERSION;
  name: string;
  description?: string;
  author?: string;
  createdAt: string;
  v12: V12RenderControls;
  concert?: PerformancePresetConcertSlice;
  research?: {
    bandEdgePreset: BandEdgePreset;
  };
};

export type PerformancePresetCapture = {
  v12: V12RenderControls;
  concert?: PerformancePresetConcertSlice;
  research?: { bandEdgePreset: BandEdgePreset };
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function numOr(x: unknown, fallback: number): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function asBand(v: unknown, fallback: BandName): BandName {
  return typeof v === "string" && (BANDS as string[]).includes(v) ? (v as BandName) : fallback;
}

function parseV12(obj: unknown): V12RenderControls | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  return {
    harmonyBand: asBand(o.harmonyBand, "alpha"),
    bassDriver: asBand(o.bassDriver, "delta"),
    melodyDriver: asBand(o.melodyDriver, "gamma"),
    rhythmDriver: asBand(o.rhythmDriver, "beta"),
    registerDriver: asBand(o.registerDriver, "alpha"),
    responseMode: clamp(Math.round(numOr(o.responseMode, 1)), 0, 99),
    orchestration: clamp(Math.round(numOr(o.orchestration, 0)), 0, 99),
    motion: clamp(Math.round(numOr(o.motion, 0)), 0, 99),
    palette: clamp(Math.round(numOr(o.palette, 2)), 0, 99),
    cc1Mode: o.cc1Mode === "complexity" ? "complexity" : "volume",
    melodyVolume: clamp(numOr(o.melodyVolume, 0.7), 0, 1),
    melodyComplexity: clamp(numOr(o.melodyComplexity, 0.35), 0, 1),
  };
}

function parseConcertSlice(obj: unknown): PerformancePresetConcertSlice | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const scene = o.scene;
  if (typeof scene !== "string" || !SCENE_IDS.has(scene)) return null;
  return {
    scene: scene as ConcertScene,
    intensity: clamp(numOr(o.intensity, 1), 0.25, 2.25),
    trails: clamp(numOr(o.trails, 0.9), 0.68, 0.97),
    showHud: Boolean(o.showHud),
    showControls: o.showControls !== false,
  };
}

export function buildPerformancePreset(
  capture: PerformancePresetCapture,
  meta: { name: string; description?: string; author?: string },
): NeuroVisPerformancePresetV1 {
  const trimmed = meta.name.trim() || "Untitled performance preset";
  return {
    format: PERFORMANCE_PRESET_FORMAT,
    version: PERFORMANCE_PRESET_VERSION,
    name: trimmed,
    description: meta.description?.trim() || undefined,
    author: meta.author?.trim() || undefined,
    createdAt: new Date().toISOString(),
    v12: capture.v12,
    concert: capture.concert,
    research: capture.research,
  };
}

export function parsePerformancePreset(json: unknown): NeuroVisPerformancePresetV1 | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  if (root.format !== PERFORMANCE_PRESET_FORMAT) return null;
  const version = Number(root.version);
  if (version !== PERFORMANCE_PRESET_VERSION) return null;
  const name = typeof root.name === "string" ? root.name.trim() : "";
  if (!name) return null;
  const v12 = parseV12(root.v12);
  if (!v12) return null;
  const createdAt =
    typeof root.createdAt === "string" && root.createdAt.length > 0
      ? root.createdAt
      : new Date().toISOString();
  const concert =
    root.concert === undefined ? undefined : parseConcertSlice(root.concert) ?? undefined;
  let research: NeuroVisPerformancePresetV1["research"];
  if (root.research && typeof root.research === "object") {
    const r = root.research as Record<string, unknown>;
    if (typeof r.bandEdgePreset === "string") {
      research = { bandEdgePreset: coerceBandEdgePreset(r.bandEdgePreset) };
    }
  }
  return {
    format: PERFORMANCE_PRESET_FORMAT,
    version: PERFORMANCE_PRESET_VERSION,
    name,
    description: typeof root.description === "string" ? root.description : undefined,
    author: typeof root.author === "string" ? root.author : undefined,
    createdAt,
    v12,
    concert,
    research,
  };
}

export function serializePerformancePreset(p: NeuroVisPerformancePresetV1): string {
  return `${JSON.stringify(p, null, 2)}\n`;
}

export function downloadPerformancePreset(p: NeuroVisPerformancePresetV1): void {
  const json = serializePerformancePreset(p);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = p.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  a.href = url;
  a.download = `neurovis-performance-${safe || "preset"}-${p.createdAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** What `applyPerformancePreset` can change — use in setters on the concert page. */
export type PerformancePresetApplyResult = {
  v12: V12RenderControls;
  concert?: PerformancePresetConcertSlice;
  bandEdgePreset?: BandEdgePreset;
};

export function applyPerformancePreset(p: NeuroVisPerformancePresetV1): PerformancePresetApplyResult {
  const out: PerformancePresetApplyResult = { v12: p.v12 };
  if (p.concert) out.concert = p.concert;
  if (p.research?.bandEdgePreset) out.bandEdgePreset = p.research.bandEdgePreset;
  return out;
}

const SAVED_KEY = "neurovis.performancePresets.v1";

export type SavedPerformancePresetEntry = {
  id: string;
  name: string;
  updatedAt: number;
  preset: NeuroVisPerformancePresetV1;
};

function readSavedRaw(): SavedPerformancePresetEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: SavedPerformancePresetEntry[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : "";
      const name = typeof r.name === "string" ? r.name : "";
      const updatedAt = Number(r.updatedAt) || 0;
      const preset = parsePerformancePreset(r.preset);
      if (!id || !name || !preset) continue;
      out.push({ id, name, updatedAt, preset });
    }
    return out;
  } catch {
    return [];
  }
}

function writeSaved(list: SavedPerformancePresetEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

export const performancePresetLocal = {
  list(): SavedPerformancePresetEntry[] {
    return readSavedRaw().sort((a, b) => b.updatedAt - a.updatedAt);
  },
  save(preset: NeuroVisPerformancePresetV1, id?: string): SavedPerformancePresetEntry {
    const list = readSavedRaw();
    const now = Date.now();
    const entryId = id ?? `pp-${now}-${Math.random().toString(36).slice(2, 9)}`;
    const next: SavedPerformancePresetEntry = {
      id: entryId,
      name: preset.name,
      updatedAt: now,
      preset: { ...preset, name: preset.name, createdAt: preset.createdAt || new Date().toISOString() },
    };
    const idx = list.findIndex((e) => e.id === entryId);
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    writeSaved(list);
    return next;
  },
  delete(id: string): void {
    writeSaved(readSavedRaw().filter((e) => e.id !== id));
  },
  get(id: string): SavedPerformancePresetEntry | undefined {
    return readSavedRaw().find((e) => e.id === id);
  },
};
