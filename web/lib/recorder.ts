"use client";

// Session recorder.
//
// Captures the live streams into a ring of typed arrays while "armed". Works
// the same whether data comes from the simulator (256 Hz native) or a real
// device over WebSocket. Output is a pair of CSV files and a JSON manifest
// that other tools (Python, R, Csound, Max) can load directly.
//
// DESIGN:
//   - Module-level singleton so the recording survives page navigations the
//     same way the simulator does.
//   - Everything is kept in memory for the tab session. On stop we return the
//     Recording object; the UI is responsible for offering downloads.
//   - Metadata of past recordings is persisted to localStorage so the
//     /recordings list survives reloads even after the raw data is gone.

import type { BandPowers, BandName } from "./types";
import { BAND_NAMES } from "./types";
import type { DspConfig } from "./dspPipeline";
import type { BrainStateResult } from "./types";

export interface Annotation {
  t_ms: number;
  label: string;
  detail?: string;
}

export interface RecordingManifest {
  id: string;
  name: string;
  started_at: string; // ISO 8601
  duration_ms: number;
  sample_rate: number; // raw EEG rate
  device: string;
  source: "simulator" | "device";
  simulator_profile?: string;
  dsp?: Partial<DspConfig>;
  eeg_samples: number;
  band_samples: number;
  channels: string[];
  band_names: BandName[];
  annotations: Annotation[];
  /** Schema hints so downstream tools know what to expect. */
  schema: {
    eeg_csv: string[];
    bands_csv: string[];
    annotations_csv: string[];
    t_unit: "ms";
  };
}

export interface Recording extends RecordingManifest {
  // Raw EEG (kept in memory as typed arrays for efficiency)
  eeg: {
    t_ms: Float64Array;
    ch1: Float32Array;
    ch2: Float32Array;
    ch3: Float32Array;
    ch4: Float32Array;
    artifact: Uint8Array;
  };
  bands: {
    t_ms: Float64Array;
    rel: Record<BandName, Float32Array>;
    abs: Record<BandName, Float32Array>;
    state: string[];
    accel: [Float32Array, Float32Array, Float32Array];
    gyro: [Float32Array, Float32Array, Float32Array];
    ppg: Float32Array;
  };
}

const CHANNELS = ["TP9", "AF7", "AF8", "TP10"] as const;

/** Estimated memory per second at 256 Hz EEG + 10 Hz band:
 *    256 * (8 + 4*4 + 1)  +  10 * (8 + 5*4*2 + 3*4 + 3*4 + 4) = ~6.8 KB/s
 *  So 10 minutes ≈ 4 MB; 60 minutes ≈ 24 MB. Fine for a browser tab. */

// Growable typed-array buffer.
class Growable<T extends Float32Array | Float64Array | Uint8Array> {
  private arr: T;
  private n = 0;
  constructor(private ctor: new (size: number) => T, initialCap = 1024) {
    this.arr = new ctor(initialCap);
  }
  push(v: number) {
    if (this.n >= this.arr.length) {
      const next = new this.ctor(this.arr.length * 2) as T;
      (next as any).set(this.arr as any, 0);
      this.arr = next;
    }
    (this.arr as any)[this.n++] = v;
  }
  get length() {
    return this.n;
  }
  /** Return a tight view (copy) of the collected data. */
  toTyped(): T {
    const out = new this.ctor(this.n) as T;
    (out as any).set((this.arr as any).subarray(0, this.n));
    return out;
  }
}

type Listener = (s: RecorderStatus) => void;

export interface RecorderStatus {
  recording: boolean;
  startedAt: number;
  elapsedMs: number;
  eegSamples: number;
  bandSamples: number;
  annotationCount: number;
  lastRecordingId: string | null;
}

class SessionRecorder {
  private eegT = new Growable(Float64Array);
  private eegCh = [
    new Growable(Float32Array),
    new Growable(Float32Array),
    new Growable(Float32Array),
    new Growable(Float32Array),
  ];
  private eegArtifact = new Growable(Uint8Array);

  private bandT = new Growable(Float64Array);
  private relByBand = BAND_NAMES.map(() => new Growable(Float32Array));
  private absByBand = BAND_NAMES.map(() => new Growable(Float32Array));
  private stateStream: string[] = [];
  private accel: [Growable<Float32Array>, Growable<Float32Array>, Growable<Float32Array>] = [
    new Growable(Float32Array),
    new Growable(Float32Array),
    new Growable(Float32Array),
  ];
  private gyro: [Growable<Float32Array>, Growable<Float32Array>, Growable<Float32Array>] = [
    new Growable(Float32Array),
    new Growable(Float32Array),
    new Growable(Float32Array),
  ];
  private ppg = new Growable(Float32Array);

  private annotations: Annotation[] = [];
  private startedAtMs = 0;
  private running = false;
  private name = "";
  private source: "simulator" | "device" = "simulator";
  private device = "UNKNOWN";
  private sampleRate = 256;
  private simulatorProfile: string | undefined;
  private dspSnapshot: Partial<DspConfig> | undefined;

  /** Live side channel state (filled as data arrives between band ticks). */
  private lastAccel: [number, number, number] = [0, 0, 0];
  private lastGyro: [number, number, number] = [0, 0, 0];
  private lastPpg = 0;
  private lastState: BrainStateResult | null = null;

  private listeners = new Set<Listener>();

  private statusTimer: ReturnType<typeof setInterval> | null = null;

  // ---------------- Lifecycle ----------------

  start(opts?: {
    name?: string;
    source?: "simulator" | "device";
    device?: string;
    sampleRate?: number;
    simulatorProfile?: string;
    dsp?: Partial<DspConfig>;
  }) {
    if (this.running) return;
    this.resetBuffers();
    this.startedAtMs = Date.now();
    this.running = true;
    this.name = opts?.name ?? defaultName();
    this.source = opts?.source ?? "simulator";
    this.device = opts?.device ?? "UNKNOWN";
    this.sampleRate = opts?.sampleRate ?? 256;
    this.simulatorProfile = opts?.simulatorProfile;
    this.dspSnapshot = opts?.dsp;
    this.annotations = [];
    this.statusTimer = setInterval(() => this.emit(), 250);
    this.emit();
  }

  stop(): Recording | null {
    if (!this.running) return null;
    this.running = false;
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
    const rec = this.finalize();
    savedRecordingsMeta.unshift({
      id: rec.id,
      name: rec.name,
      started_at: rec.started_at,
      duration_ms: rec.duration_ms,
      eeg_samples: rec.eeg_samples,
      band_samples: rec.band_samples,
      source: rec.source,
      device: rec.device,
    });
    persistMetadata();
    activeRecordings.set(rec.id, rec);
    this.emit();
    return rec;
  }

  addAnnotation(label: string, detail?: string) {
    if (!this.running) return;
    const t_ms = Date.now() - this.startedAtMs;
    this.annotations.push({ t_ms, label, detail });
    this.emit();
  }

  removeRecording(id: string) {
    activeRecordings.delete(id);
    const idx = savedRecordingsMeta.findIndex((r) => r.id === id);
    if (idx >= 0) savedRecordingsMeta.splice(idx, 1);
    persistMetadata();
    fireRecordingsChanged();
  }

  status(): RecorderStatus {
    return {
      recording: this.running,
      startedAt: this.startedAtMs,
      elapsedMs: this.running ? Date.now() - this.startedAtMs : 0,
      eegSamples: this.eegT.length,
      bandSamples: this.bandT.length,
      annotationCount: this.annotations.length,
      lastRecordingId: savedRecordingsMeta[0]?.id ?? null,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  // ---------------- Data ingestion hooks ----------------

  pushEEG(ch1: number, ch2: number, ch3: number, ch4: number, artifact = 0) {
    if (!this.running) return;
    const t = Date.now() - this.startedAtMs;
    this.eegT.push(t);
    this.eegCh[0].push(ch1);
    this.eegCh[1].push(ch2);
    this.eegCh[2].push(ch3);
    this.eegCh[3].push(ch4);
    this.eegArtifact.push(artifact ? 1 : 0);
  }

  pushBands(abs: BandPowers, rel: BandPowers, state?: BrainStateResult | null) {
    if (!this.running) return;
    const t = Date.now() - this.startedAtMs;
    this.bandT.push(t);
    BAND_NAMES.forEach((b, i) => {
      this.relByBand[i].push(rel[b] ?? 0);
      this.absByBand[i].push(abs[b] ?? 0);
    });
    this.stateStream.push(state?.state ?? "neutral");
    this.accel[0].push(this.lastAccel[0]);
    this.accel[1].push(this.lastAccel[1]);
    this.accel[2].push(this.lastAccel[2]);
    this.gyro[0].push(this.lastGyro[0]);
    this.gyro[1].push(this.lastGyro[1]);
    this.gyro[2].push(this.lastGyro[2]);
    this.ppg.push(this.lastPpg);
  }

  pushMotion(sensor: "accel" | "gyro" | "ppg", values: number[]) {
    if (sensor === "accel")
      this.lastAccel = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    else if (sensor === "gyro")
      this.lastGyro = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    else if (sensor === "ppg") this.lastPpg = values[0] ?? 0;
  }

  // ---------------- Internals ----------------

  private resetBuffers() {
    this.eegT = new Growable(Float64Array);
    this.eegCh = [
      new Growable(Float32Array),
      new Growable(Float32Array),
      new Growable(Float32Array),
      new Growable(Float32Array),
    ];
    this.eegArtifact = new Growable(Uint8Array);
    this.bandT = new Growable(Float64Array);
    this.relByBand = BAND_NAMES.map(() => new Growable(Float32Array));
    this.absByBand = BAND_NAMES.map(() => new Growable(Float32Array));
    this.stateStream = [];
    this.accel = [
      new Growable(Float32Array),
      new Growable(Float32Array),
      new Growable(Float32Array),
    ];
    this.gyro = [
      new Growable(Float32Array),
      new Growable(Float32Array),
      new Growable(Float32Array),
    ];
    this.ppg = new Growable(Float32Array);
    this.annotations = [];
  }

  private finalize(): Recording {
    const rel: Record<BandName, Float32Array> = {} as any;
    const abs: Record<BandName, Float32Array> = {} as any;
    BAND_NAMES.forEach((b, i) => {
      rel[b] = this.relByBand[i].toTyped();
      abs[b] = this.absByBand[i].toTyped();
    });
    const manifest: RecordingManifest = {
      id: randomId(),
      name: this.name,
      started_at: new Date(this.startedAtMs).toISOString(),
      duration_ms: Date.now() - this.startedAtMs,
      sample_rate: this.sampleRate,
      device: this.device,
      source: this.source,
      simulator_profile: this.simulatorProfile,
      dsp: this.dspSnapshot,
      eeg_samples: this.eegT.length,
      band_samples: this.bandT.length,
      channels: [...CHANNELS],
      band_names: [...BAND_NAMES],
      annotations: [...this.annotations],
      schema: {
        eeg_csv: ["t_ms", "ch1_tp9", "ch2_af7", "ch3_af8", "ch4_tp10", "artifact"],
        bands_csv: [
          "t_ms",
          ...BAND_NAMES.map((b) => `rel_${b}`),
          ...BAND_NAMES.map((b) => `abs_${b}`),
          "state",
          "accel_x",
          "accel_y",
          "accel_z",
          "gyro_x",
          "gyro_y",
          "gyro_z",
          "ppg",
        ],
        annotations_csv: ["t_ms", "label", "detail"],
        t_unit: "ms",
      },
    };

    return {
      ...manifest,
      eeg: {
        t_ms: this.eegT.toTyped(),
        ch1: this.eegCh[0].toTyped(),
        ch2: this.eegCh[1].toTyped(),
        ch3: this.eegCh[2].toTyped(),
        ch4: this.eegCh[3].toTyped(),
        artifact: this.eegArtifact.toTyped(),
      },
      bands: {
        t_ms: this.bandT.toTyped(),
        rel,
        abs,
        state: [...this.stateStream],
        accel: [
          this.accel[0].toTyped(),
          this.accel[1].toTyped(),
          this.accel[2].toTyped(),
        ],
        gyro: [
          this.gyro[0].toTyped(),
          this.gyro[1].toTyped(),
          this.gyro[2].toTyped(),
        ],
        ppg: this.ppg.toTyped(),
      },
    };
  }

  private emit() {
    const s = this.status();
    for (const fn of this.listeners) fn(s);
  }
}

// ------------- CSV / JSON builders -------------

function csvEscape(s: string): string {
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildEegCsv(rec: Recording): string {
  const lines: string[] = [rec.schema.eeg_csv.join(",")];
  const { eeg } = rec;
  for (let i = 0; i < eeg.t_ms.length; i++) {
    lines.push(
      `${eeg.t_ms[i].toFixed(2)},${eeg.ch1[i].toFixed(3)},${eeg.ch2[i].toFixed(3)},${eeg.ch3[i].toFixed(3)},${eeg.ch4[i].toFixed(3)},${eeg.artifact[i]}`,
    );
  }
  return lines.join("\n");
}

export function buildBandsCsv(rec: Recording): string {
  const lines: string[] = [rec.schema.bands_csv.join(",")];
  const { bands } = rec;
  for (let i = 0; i < bands.t_ms.length; i++) {
    const row: (number | string)[] = [bands.t_ms[i].toFixed(2)];
    BAND_NAMES.forEach((b) => row.push(bands.rel[b][i].toFixed(4)));
    BAND_NAMES.forEach((b) => row.push(bands.abs[b][i].toFixed(4)));
    row.push(bands.state[i] ?? "neutral");
    row.push(bands.accel[0][i].toFixed(3));
    row.push(bands.accel[1][i].toFixed(3));
    row.push(bands.accel[2][i].toFixed(3));
    row.push(bands.gyro[0][i].toFixed(3));
    row.push(bands.gyro[1][i].toFixed(3));
    row.push(bands.gyro[2][i].toFixed(3));
    row.push(bands.ppg[i].toFixed(3));
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export function buildAnnotationsCsv(rec: Recording): string {
  const lines: string[] = [rec.schema.annotations_csv.join(",")];
  for (const a of rec.annotations) {
    lines.push(
      `${a.t_ms.toFixed(2)},${csvEscape(a.label)},${csvEscape(a.detail ?? "")}`,
    );
  }
  return lines.join("\n");
}

export function buildManifestJson(rec: Recording): string {
  const { eeg: _e, bands: _b, ...manifest } = rec;
  return JSON.stringify(manifest, null, 2);
}

export function downloadText(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadRecordingFiles(rec: Recording) {
  const safe = rec.name.replace(/[^a-z0-9_\-]+/gi, "_");
  downloadText(
    `${safe}.manifest.json`,
    buildManifestJson(rec),
    "application/json",
  );
  downloadText(`${safe}.eeg.csv`, buildEegCsv(rec));
  downloadText(`${safe}.bands.csv`, buildBandsCsv(rec));
  if (rec.annotations.length) {
    downloadText(`${safe}.annotations.csv`, buildAnnotationsCsv(rec));
  }
}

// ------------- Saved metadata (localStorage) + in-memory full data -------------

const META_KEY = "neurovis.recordings.meta.v1";
export interface SavedMeta {
  id: string;
  name: string;
  started_at: string;
  duration_ms: number;
  eeg_samples: number;
  band_samples: number;
  source: "simulator" | "device";
  device: string;
}

export const savedRecordingsMeta: SavedMeta[] = readSavedMeta();
export const activeRecordings = new Map<string, Recording>();

function readSavedMeta(): SavedMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persistMetadata() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      META_KEY,
      JSON.stringify(savedRecordingsMeta.slice(0, 100)),
    );
    fireRecordingsChanged();
  } catch {}
}

function fireRecordingsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("neurovis:recordings-changed"));
}

function defaultName(): string {
  const d = new Date();
  return `session-${d.toISOString().slice(0, 16).replace(/[:]/g, "")}`;
}

function randomId(): string {
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ------------- Module singleton -------------

export const recorder = new SessionRecorder();
