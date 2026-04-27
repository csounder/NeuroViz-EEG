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
import { buildChannelsTsv, buildEegJsonBidsStub } from "./researchBidsSidecars";
import type { DspConfig } from "./dspPipeline";
import type { BrainStateResult } from "./types";

export interface Annotation {
  /** Milliseconds since recording start (aligns with `eeg.t_ms` / `bands.t_ms`). */
  t_ms: number;
  /** Wall-clock ISO time when the marker was placed (for MNE/alignment). */
  wall_time_iso?: string;
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
  /** Browser EEG trace path during capture (matches NeuroVis settings). */
  eeg_trace_source?: string;
  /** Effective EEG packet rate observed during the session (Hz, approximate). */
  estimated_eeg_hz?: number;
  /** Software / schema hints for reproducibility. */
  provenance?: {
    export_schema: string;
    neurovis_web?: string;
    /** Aligns with Research page rolling export (UI-rate timeline). */
    rolling_export_schema?: string;
    /** Present when `channels.tsv` + `eeg.json` ship beside manifest (BIDS-style stubs). */
    bids_sidecar_files?: string[];
    bids_sidecar_note?: string;
    /** Effective EEG column count in this export (four default; Cyton/Daisy up to sixteen). */
    eeg_ui_channel_count?: number;
    eeg_hardware_channel_note?: string;
    bids_entities?: { subject: string; session: string; task: string };
    note?: string;
    analysis_scope?: {
      intent: string;
      clinical_use: boolean;
      notes: string[];
    };
  };
  /** Epoch ms at recording start; eeg row `wall_ms` ≈ this + t_ms. */
  recording_anchor_wall_ms?: number;
  /** Schema hints so downstream tools know what to expect. */
  schema: {
    eeg_csv: string[];
    bands_csv: string[];
    annotations_csv: string[];
    epochs_json: string;
    channels_tsv: string;
    eeg_json: string;
    t_unit: "ms";
  };
}

export interface Recording extends RecordingManifest {
  // Raw EEG (kept in memory as typed arrays for efficiency)
  eeg: {
    t_ms: Float64Array;
    /** One array per EEG column (length matches `channels` in manifest). */
    channelData: Float32Array[];
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
    /** Optical / aux channels at band-packet rate (Athena fNIRS); padded to FNIRS_EXPORT_CH. */
    fnirs: Float32Array[];
  };
}

const DEFAULT_EEG_CHANNEL_NAMES = ["TP9", "AF7", "AF8", "TP10"] as const;
/** Padded columns in bands.csv / rolling export for multi-λ fNIRS. */
export const FNIRS_EXPORT_CH = 6;

function normalizeChannelNames(labels: string[] | undefined, n: number): string[] {
  const base = labels?.filter(Boolean) ?? [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = base[i]?.trim();
    if (raw) out.push(raw);
    else if (n === 4 && !labels?.length) out.push(DEFAULT_EEG_CHANNEL_NAMES[i] ?? `Ch${i + 1}`);
    else out.push(`Ch${i + 1}`);
  }
  return out;
}

/** CSV column names for session exports (keep in sync with `finalize()`; used by tests). */
export function buildRecordingExportColumnSchemas(channelNames: string[]) {
  return {
    eeg_csv: ["t_ms", "wall_ms", ...channelNames.map((_, i) => `eeg_${i + 1}`), "artifact"],
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
      ...Array.from({ length: FNIRS_EXPORT_CH }, (_, i) => `fnirs_${i + 1}`),
    ],
    annotations_csv: ["t_ms", "wall_time_iso", "label", "detail"],
  };
}

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
  private eegCh: Growable<Float32Array>[] = [];
  private eegArtifact = new Growable(Uint8Array);
  private eegChannelCount = 4;

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
  private fnirsCh: Growable<Float32Array>[] = Array.from({ length: FNIRS_EXPORT_CH }, () => new Growable(Float32Array));
  private lastFnirs: number[] = Array(FNIRS_EXPORT_CH).fill(0);

  private annotations: Annotation[] = [];
  private startedAtMs = 0;
  private running = false;
  private name = "";
  private source: "simulator" | "device" = "simulator";
  private device = "UNKNOWN";
  private sampleRate = 256;
  private simulatorProfile: string | undefined;
  private dspSnapshot: Partial<DspConfig> | undefined;
  private eegTraceSource: string | undefined;
  private estimatedEegHzSession: number | undefined;
  private channelNames: string[] = [...DEFAULT_EEG_CHANNEL_NAMES];

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
    eegTraceSource?: string;
    estimatedEegHz?: number;
    /** Labels for manifest / BIDS; length must match `eegChannelCount`. */
    channelLabels?: string[];
    /** OpenBCI Cyton/Daisy: 8 or 16; default 4. */
    eegChannelCount?: number;
  }) {
    if (this.running) return;
    const reqN = Math.min(16, Math.max(1, opts?.eegChannelCount ?? 4));
    this.eegChannelCount = reqN;
    const labels = opts?.channelLabels;
    this.channelNames = normalizeChannelNames(labels, reqN);
    this.resetBuffers();
    this.startedAtMs = Date.now();
    this.running = true;
    this.name = opts?.name ?? defaultName();
    this.source = opts?.source ?? "simulator";
    this.device = opts?.device ?? "UNKNOWN";
    this.sampleRate = opts?.sampleRate ?? 256;
    this.simulatorProfile = opts?.simulatorProfile;
    this.dspSnapshot = opts?.dsp;
    this.eegTraceSource = opts?.eegTraceSource;
    this.estimatedEegHzSession = opts?.estimatedEegHz;
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
    this.annotations.push({
      t_ms,
      wall_time_iso: new Date().toISOString(),
      label,
      detail,
    });
    this.emit();
  }

  /** Read-only copy of markers for the active recording (empty when not recording). */
  getLiveAnnotations(): Annotation[] {
    return this.running ? this.annotations.map((a) => ({ ...a })) : [];
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

  /** Active EEG column count for the current or last-configured session (default 4 when idle). */
  getActiveEegChannelCount(): number {
    return this.running ? this.eegChannelCount : 4;
  }

  // ---------------- Data ingestion hooks ----------------

  /** Full-rate EEG row; length may be &lt; N — missing channels are padded with 0. */
  pushEEGSample(sample: number[], artifact = 0) {
    if (!this.running) return;
    const t = Date.now() - this.startedAtMs;
    this.eegT.push(t);
    for (let i = 0; i < this.eegChannelCount; i++) {
      this.eegCh[i].push(Number(sample[i]) || 0);
    }
    this.eegArtifact.push(artifact ? 1 : 0);
  }

  /** @deprecated Use pushEEGSample — kept for older call sites. */
  pushEEG(ch1: number, ch2: number, ch3: number, ch4: number, artifact = 0) {
    this.pushEEGSample([ch1, ch2, ch3, ch4], artifact);
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
    for (let i = 0; i < FNIRS_EXPORT_CH; i++) {
      this.fnirsCh[i].push(this.lastFnirs[i] ?? 0);
    }
  }

  pushMotion(sensor: "accel" | "gyro" | "ppg" | "fnirs", values: number[]) {
    if (sensor === "accel")
      this.lastAccel = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    else if (sensor === "gyro")
      this.lastGyro = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    else if (sensor === "ppg") this.lastPpg = values[0] ?? 0;
    else if (sensor === "fnirs") {
      for (let i = 0; i < FNIRS_EXPORT_CH; i++) {
        this.lastFnirs[i] = Number(values[i]) || 0;
      }
    }
  }

  // ---------------- Internals ----------------

  private resetBuffers() {
    this.eegT = new Growable(Float64Array);
    this.eegCh = Array.from({ length: this.eegChannelCount }, () => new Growable(Float32Array));
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
    this.fnirsCh = Array.from({ length: FNIRS_EXPORT_CH }, () => new Growable(Float32Array));
    this.lastFnirs = Array(FNIRS_EXPORT_CH).fill(0);
    this.annotations = [];
  }

  private finalize(): Recording {
    const rel: Record<BandName, Float32Array> = {} as any;
    const abs: Record<BandName, Float32Array> = {} as any;
    BAND_NAMES.forEach((b, i) => {
      rel[b] = this.relByBand[i].toTyped();
      abs[b] = this.absByBand[i].toTyped();
    });
    const startedIso = new Date(this.startedAtMs).toISOString();
    const sessionBids = startedIso.slice(0, 10).replace(/-/g, "");
    const exportCols = buildRecordingExportColumnSchemas(this.channelNames);
    const eegHeaderCols = exportCols.eeg_csv;
    const cytonNote =
      this.eegChannelCount > 4
        ? `Session recorder captured ${this.eegChannelCount} EEG columns (OpenBCI Cyton/Daisy-class layout). NeuroVis Research plots and band-derived metrics may still emphasize the first four channels unless extended.`
        : "Standard four-column EEG export for Muse, Ganglion, or simulator. Cyton/Daisy uses eight or sixteen columns when the device name/profile indicates that hardware.";
    const manifest: RecordingManifest = {
      id: randomId(),
      name: this.name,
      started_at: startedIso,
      duration_ms: Date.now() - this.startedAtMs,
      sample_rate: this.sampleRate,
      device: this.device,
      source: this.source,
      simulator_profile: this.simulatorProfile,
      dsp: this.dspSnapshot,
      eeg_samples: this.eegT.length,
      band_samples: this.bandT.length,
      channels: [...this.channelNames],
      band_names: [...BAND_NAMES],
      annotations: [...this.annotations],
      eeg_trace_source: this.eegTraceSource,
      estimated_eeg_hz: this.estimatedEegHzSession ?? this.sampleRate,
      recording_anchor_wall_ms: this.startedAtMs,
      provenance: {
        export_schema: "neurovis-research-v1",
        neurovis_web: "0.1.0",
        rolling_export_schema: "neurovis-research-rolling-v1",
        bids_entities: {
          subject: "NEUROVIS",
          session: sessionBids,
          task: "session",
        },
        bids_sidecar_files: ["channels.tsv", "eeg.json"],
        bids_sidecar_note:
          "Minimal BIDS-EEG stubs next to manifest; not a full BIDS dataset. Rig channels.tsv SamplingFrequency to your analysis if it differs from band row timing.",
        eeg_ui_channel_count: this.eegChannelCount,
        eeg_hardware_channel_note: cytonNote,
        note:
          "Full-rate in-browser recorder. Pair with Research page rolling CSV for ~WS-rate timeline + the same wall clock (recording_anchor_wall_ms / wall_ms). bands.csv includes fnirs_1..fnirs_6 at band-packet rate when optical data is forwarded.",
        analysis_scope: {
          intent: "erp_adjacent_exploratory",
          clinical_use: false,
          notes: [
            "In-browser capture: annotation wall times are client clock; not stim–ADC hardware locked.",
            "Use offline epoching (MNE, EEGLAB, etc.) for publication ERP pipelines and QC.",
          ],
        },
      },
      schema: {
        eeg_csv: eegHeaderCols,
        bands_csv: exportCols.bands_csv,
        annotations_csv: exportCols.annotations_csv,
        epochs_json: "epochs_summary.json",
        channels_tsv: "channels.tsv",
        eeg_json: "eeg.json",
        t_unit: "ms",
      },
    };

    return {
      ...manifest,
      eeg: {
        t_ms: this.eegT.toTyped(),
        channelData: this.eegCh.map((g) => g.toTyped()),
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
        fnirs: this.fnirsCh.map((g) => g.toTyped()),
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

function recordingWallAnchorMs(rec: RecordingManifest): number {
  if (typeof rec.recording_anchor_wall_ms === "number") {
    return rec.recording_anchor_wall_ms;
  }
  return Date.parse(rec.started_at) || 0;
}

export function buildEegCsv(rec: Recording): string {
  const anchor = recordingWallAnchorMs(rec);
  const lines: string[] = [rec.schema.eeg_csv.join(",")];
  const { eeg } = rec;
  const nCh = eeg.channelData.length;
  for (let i = 0; i < eeg.t_ms.length; i++) {
    const wallMs = Math.round(anchor + eeg.t_ms[i]);
    const parts: string[] = [eeg.t_ms[i].toFixed(2), String(wallMs)];
    for (let c = 0; c < nCh; c++) {
      parts.push((eeg.channelData[c][i] ?? 0).toFixed(3));
    }
    parts.push(String(eeg.artifact[i]));
    lines.push(parts.join(","));
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
    for (let j = 0; j < FNIRS_EXPORT_CH; j++) {
      row.push((bands.fnirs[j]?.[i] ?? 0).toFixed(5));
    }
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export function buildAnnotationsCsv(rec: Recording): string {
  const lines: string[] = [rec.schema.annotations_csv.join(",")];
  for (const a of rec.annotations) {
    lines.push(
      `${a.t_ms.toFixed(2)},${csvEscape(a.wall_time_iso ?? "")},${csvEscape(a.label)},${csvEscape(a.detail ?? "")}`,
    );
  }
  return lines.join("\n");
}

export interface EpochExportOptions {
  preMs: number;
  postMs: number;
}

/** Per-event windows aligned to annotation `t_ms` (recording-relative). For offline ERP-style workflows. */
export function buildEpochsSummaryJson(rec: Recording, opts: EpochExportOptions): string {
  const { eeg, bands } = rec;
  const { preMs, postMs } = opts;

  const epochs = rec.annotations.map((ann, index) => {
    const lo = ann.t_ms - preMs;
    const hi = ann.t_ms + postMs;

    const eegIdx: number[] = [];
    for (let i = 0; i < eeg.t_ms.length; i++) {
      const t = eeg.t_ms[i];
      if (t >= lo && t <= hi) eegIdx.push(i);
    }

    const bandIdx: number[] = [];
    for (let i = 0; i < bands.t_ms.length; i++) {
      const t = bands.t_ms[i];
      if (t >= lo && t <= hi) bandIdx.push(i);
    }

    const chStats = rec.channels.map((name, ci) => {
      const arr = eeg.channelData[ci];
      const xs = arr ? eegIdx.map((i) => arr[i]).filter((v) => Number.isFinite(v)) : [];
      return {
        channel: name,
        mean: xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null,
        std: stdSample(xs),
      };
    });

    const relMean = {} as Record<BandName, number | null>;
    const absMean = {} as Record<BandName, number | null>;
    for (const b of BAND_NAMES) {
      const rx = bandIdx.map((i) => bands.rel[b][i]).filter((v) => Number.isFinite(v));
      const ax = bandIdx.map((i) => bands.abs[b][i]).filter((v) => Number.isFinite(v));
      relMean[b] = rx.length ? rx.reduce((s, v) => s + v, 0) / rx.length : null;
      absMean[b] = ax.length ? ax.reduce((s, v) => s + v, 0) / ax.length : null;
    }

    return {
      index,
      label: ann.label,
      detail: ann.detail ?? null,
      wall_time_iso: ann.wall_time_iso ?? null,
      t_ms_event: ann.t_ms,
      window_ms: { pre: preMs, post: postMs, t_ms_start: lo, t_ms_end: hi },
      eeg: {
        n_samples: eegIdx.length,
        channel_stats: chStats,
      },
      bands: {
        n_samples: bandIdx.length,
        rel_mean: relMean,
        abs_mean: absMean,
      },
    };
  });

  return JSON.stringify(
    {
      schema: "neurovis-epochs-summary-v1",
      recording_id: rec.id,
      recording_started_at: rec.started_at,
      epoch_options: opts,
      epochs,
      generated_at: new Date().toISOString(),
    },
    null,
    2,
  );
}

function stdSample(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(Math.max(0, v));
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

export function downloadRecordingFiles(
  rec: Recording,
  epochOpts?: EpochExportOptions,
) {
  const safe = rec.name.replace(/[^a-z0-9_\-]+/gi, "_");
  downloadText(
    `${safe}.manifest.json`,
    buildManifestJson(rec),
    "application/json",
  );
  downloadText(`${safe}.eeg.csv`, buildEegCsv(rec));
  downloadText(`${safe}.bands.csv`, buildBandsCsv(rec));
  downloadText(`${safe}.channels.tsv`, buildChannelsTsv([...rec.channels], rec.sample_rate));
  downloadText(
    `${safe}.eeg.json`,
    JSON.stringify(
      buildEegJsonBidsStub({
        taskName: rec.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 64) || "session",
        samplingFrequency: rec.sample_rate,
        eegChannelCount: rec.channels.length,
        channelNames: [...rec.channels],
        eegReferenceNote: `NeuroVis session recorder; EEG trace source ${rec.eeg_trace_source ?? "unknown"}; device ${rec.device}.`,
        softwareNote: "See manifest.json provenance and analysis_scope.",
      }),
      null,
      2,
    ),
    "application/json",
  );
  if (rec.annotations.length) {
    downloadText(`${safe}.annotations.csv`, buildAnnotationsCsv(rec));
    const pre = epochOpts?.preMs ?? 2000;
    const post = epochOpts?.postMs ?? 2000;
    downloadText(
      `${safe}.epochs_summary.json`,
      buildEpochsSummaryJson(rec, { preMs: pre, postMs: post }),
      "application/json",
    );
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
