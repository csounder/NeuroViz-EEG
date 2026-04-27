"use client";

import { create } from "zustand";
import type {
  BandEdgePreset,
  BandPowers,
  BandName,
  BrainStateResult,
  DeviceInfo,
  EEGMessage,
  EegTraceSource,
  NeuroVisSettings,
  ResearchEventBridgeMessage,
  ServerMessage,
} from "./types";
import { BAND_NAMES } from "./types";
import { classifyBrainState } from "./utils";
import { dsp } from "./dspPipeline";
import {
  BAND_EDGE_LS_KEY,
  coerceBandEdgePreset,
} from "./bandEdgePreset";
import { bandFilters } from "./bandFilters";
import { recorder } from "./recorder";
import type {
  ResearchEyesContext,
  ResearchEventLog,
  ResearchEventSource,
  ResearchStreamSample,
  StimulusClockSnapshot,
} from "./researchTypes";
import {
  RESEARCH_EVENTS_MAX,
  RESEARCH_TIMELINE_MAX,
} from "./researchTypes";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

interface FftSnapshot {
  freqs: number[];
  magnitudes: number[][];
  timestamp: number;
}

interface MindMonitorKnownStreams {
  horseshoe: number[] | null;
  blink: boolean | null;
  jawClench: boolean | null;
  concentration: number | null;
  mellow: number | null;
  annotation: string | null;
  rawFft: Record<string, number[]>;
  updatedAt: number | null;
}

interface NeuroState {
  // WebSocket connection
  wsStatus: ConnectionStatus;
  wsUrl: string;
  /** Increment to force `useNeuroVisSocket` to tear down and open a fresh WebSocket. */
  wsReconnectEpoch: number;
  lastMessageAt: number | null;

  /**
   * Mind Monitor compatibility: Hamming FFT / 0–110 Hz bins, MuseIO `raw_fft*`
   * OSC. Band integration edges are controlled by `bandEdgePreset`.
   */
  mindMonitorMode: boolean;

  /**
   * Welch / biquad band edges (δ–γ). Synced to the Node bridge for band powers
   * (Csound, Concert, Stimulus, REST). Browser trace bank uses the same profile.
   */
  bandEdgePreset: BandEdgePreset;

  /**
   * Which samples feed `rollingRaw`, band-trace biquads, and the recorder for EEG packets.
   * Does not change server OSC or server-computed band powers.
   */
  eegTraceSource: EegTraceSource;

  // Device / settings
  devices: DeviceInfo[];
  activeDeviceName: string | null;
  settings: NeuroVisSettings;
  batteryPct: number | null;
  touching: boolean | null;
  deviceName: string | null;
  packetCount: number;

  // Browser-side simulator
  clientSim: {
    running: boolean;
    profile: string; // SimProfile
    manualBands: BandPowers | null;
    oscRelayActive: boolean;
    packetsSent: number;
    startedAt: number | null;
  };

  // Streams
  latestEEG: EEGMessage | null;
  rollingRaw: number[][]; // per-channel ring buffers for Raw EEG chart
  /** Per-band, per-channel filtered traces (band → 4 × ring buffer). */
  rollingBandRaw: Record<BandName, number[][]>;
  /** Latest per-band 4-channel filtered sample (for OSC preview + parity with relay). */
  latestBandTraces: Record<BandName, number[]> | null;
  latestBandsAbs: BandPowers | null;
  latestBandsRel: BandPowers | null;
  latestBandsAt: number | null;
  bandHistory: { t: number; rel: BandPowers }[]; // last N seconds
  fft: FftSnapshot | null;
  brainState: BrainStateResult | null;
  /** Smoothed estimate of EEG packet rate (Hz) from inter-arrival times (dashboard stream). */
  estimatedEegHz: number | null;

  /** In-browser stream for Research event-locked views & rolling export (~WebSocket EEG rate). */
  researchTimeline: ResearchStreamSample[];
  researchEvents: ResearchEventLog[];
  /** Latest `stimulus_clock` broadcast (does not consume researchEvents slots). */
  lastStimulusClock: StimulusClockSnapshot | null;
  researchEyesContext: ResearchEyesContext;

  // Motion
  motion: {
    accel: number[] | null;
    gyro: number[] | null;
    ppg: number[] | null;
    fnirs: number[] | null;
  };
  mindMonitorOsc: {
    addresses: Record<string, { args: unknown[]; timestamp: number; count: number }>;
    recent: { address: string; args: unknown[]; timestamp: number }[];
  };
  mindMonitor: MindMonitorKnownStreams;

  // Calibration
  calibration: {
    isCalibrating: boolean;
    percent: number;
    samples: number;
    secondsElapsed: number;
    secondsTotal: number;
  };

  // Actions
  setWsStatus: (s: ConnectionStatus) => void;
  /** Close and reconnect the app WebSocket (same tab). */
  requestWsReconnect: () => void;
  setMindMonitorMode: (enabled: boolean) => void;
  setEegTraceSource: (source: EegTraceSource) => void;
  /** Apply `eegTraceSource` from localStorage (client only). Call once after mount to avoid SSR hydration mismatch. */
  hydrateEegTraceSourceFromStorage: () => void;
  /** Apply `bandEdgePreset` from localStorage (client only). */
  hydrateBandEdgePresetFromStorage: () => void;
  setBandEdgePreset: (preset: BandEdgePreset) => void;
  ingest: (msg: ServerMessage) => void;
  setDevices: (devices: DeviceInfo[]) => void;
  setActiveDevice: (name: string | null) => void;
  setSettings: (settings: NeuroVisSettings) => void;

  setClientSim: (patch: Partial<NeuroState["clientSim"]>) => void;
  feedSimEEG: (raw: number[]) => void;
  feedSimBandTraces: (perBandPerChannel: Record<BandName, number[]>) => void;
  feedSimBands: (absolute: BandPowers, relative: BandPowers) => void;
  feedSimMotion: (
    sensor: "accel" | "gyro" | "ppg" | "fnirs",
    values: number[],
  ) => void;

  logResearchEvent: (
    label: string,
    source: ResearchEventSource,
    detail?: string,
    meta?: { audioPositionMs?: number },
  ) => void;
  clearResearchTimeline: () => void;
  clearResearchEvents: () => void;
  setResearchEyesContext: (c: ResearchEyesContext) => void;
}

const ROLLING_SAMPLES = 1024; // ~4 seconds at 256Hz
const BAND_HISTORY_LEN = 600; // 60s @ 10Hz

function pushRing<T>(arr: T[], value: T, max: number): T[] {
  const next = arr.length >= max ? arr.slice(arr.length - max + 1) : arr.slice();
  next.push(value);
  return next;
}

const EEG_TRACE_LS_KEY = "neurovis.eegTraceSource";

const EEG_TRACE_DEFAULT: EegTraceSource = "browser_dsp";

function readEegTraceSourceFromLocalStorage(): EegTraceSource | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(EEG_TRACE_LS_KEY);
    if (v === "server_dsp" || v === "device_raw" || v === "browser_dsp") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function readBandEdgePresetFromLocalStorage(): BandEdgePreset | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(BAND_EDGE_LS_KEY);
    if (v == null || v === "") return null;
    return coerceBandEdgePreset(v);
  } catch {
    return null;
  }
}

/** Smooth WebSocket EEG rate so biquad bandpass edges stay sane (20–512 Hz). */
let lastEegTimestampMs: number | null = null;
let smoothedBandFilterFs = 256;

function tickBandFilterSampleRate(timestampMs: number) {
  if (lastEegTimestampMs !== null) {
    const dt = timestampMs - lastEegTimestampMs;
    if (dt > 2 && dt < 500) {
      const inst = 1000 / dt;
      const clamped = Math.min(512, Math.max(20, inst));
      smoothedBandFilterFs = smoothedBandFilterFs * 0.88 + clamped * 0.12;
      bandFilters.setSampleRate(Math.round(smoothedBandFilterFs));
    }
  }
  lastEegTimestampMs = timestampMs;
}

function appendBandTraces(
  prev: Record<BandName, number[][]>,
  perBand: Record<BandName, number[]>,
): Record<BandName, number[][]> {
  const next = { ...prev } as Record<BandName, number[][]>;
  for (const b of BAND_NAMES) {
    const row = perBand[b];
    if (!row) continue;
    next[b] = prev[b].map((buf, ch) => {
      const v = row[ch];
      if (v === undefined || v === null) return buf;
      return pushRing(buf, v, ROLLING_SAMPLES);
    });
  }
  return next;
}

function toNumbers(args: unknown[]) {
  return args.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

/** OSC args may arrive as plain numbers or `{ type, value }` objects from some relays. */
function oscArgNumber(v: unknown): number {
  if (v != null && typeof v === "object" && "value" in (v as object)) {
    return Number((v as { value: unknown }).value);
  }
  return Number(v);
}

function ppgTripleFromOscArgs(args: unknown[]): number[] | null {
  if (!Array.isArray(args) || args.length < 3) return null;
  const ppg = [oscArgNumber(args[0]), oscArgNumber(args[1]), oscArgNumber(args[2])];
  return ppg.every((x) => Number.isFinite(x)) ? ppg : null;
}

/** Mind Monitor PPG is `/muse/ppg` (64 Hz); custom OSC prefix may yield paths ending in `/ppg`. */
function isMindMonitorPpgOscAddress(addrLower: string): boolean {
  if (addrLower.includes("/elements/")) return false;
  return addrLower === "/muse/ppg" || addrLower.endsWith("/ppg");
}

function deriveMindMonitorKnownStream(
  current: MindMonitorKnownStreams,
  address: string,
  args: unknown[],
  timestamp: number,
): MindMonitorKnownStreams {
  const nums = toNumbers(args);
  if (address === "/muse/elements/horseshoe") {
    return { ...current, horseshoe: nums.slice(0, 4), updatedAt: timestamp };
  }
  if (address === "/muse/elements/blink") {
    return { ...current, blink: Boolean(nums[0]), updatedAt: timestamp };
  }
  if (address === "/muse/elements/jaw_clench") {
    return { ...current, jawClench: Boolean(nums[0]), updatedAt: timestamp };
  }
  if (address === "/muse/elements/experimental/concentration") {
    return { ...current, concentration: nums[0] ?? null, updatedAt: timestamp };
  }
  if (address === "/muse/elements/experimental/mellow") {
    return { ...current, mellow: nums[0] ?? null, updatedAt: timestamp };
  }
  if (address === "/muse/annotation") {
    return { ...current, annotation: String(args[0] ?? ""), updatedAt: timestamp };
  }
  const rawFft = address.match(/^\/muse\/elements\/raw_fft(\d*)$/);
  if (rawFft) {
    const channel = rawFft[1] || "all";
    return {
      ...current,
      rawFft: { ...current.rawFft, [channel]: nums },
      updatedAt: timestamp,
    };
  }
  return current;
}

/** Call when starting the browser simulator so WS rate estimates don't skew biquads. */
export function resetBandFilterStreamEstimator() {
  lastEegTimestampMs = null;
  smoothedBandFilterFs = 256;
}

export const useNeuroStore = create<NeuroState>((set, get) => ({
  wsStatus: "idle",
  wsUrl:
    process.env.NEXT_PUBLIC_NEUROVIS_WS_URL || "ws://localhost:8080",
  wsReconnectEpoch: 0,
  lastMessageAt: null,

  mindMonitorMode: false,

  bandEdgePreset: "neurovis",

  // Must match SSR — read localStorage in hydrateEegTraceSourceFromStorage() after mount.
  eegTraceSource: EEG_TRACE_DEFAULT,

  devices: [],
  activeDeviceName: null,
  settings: {},
  batteryPct: null,
  touching: null,
  deviceName: null,
  packetCount: 0,

  latestEEG: null,
  rollingRaw: [[], [], [], []],
  rollingBandRaw: BAND_NAMES.reduce(
    (acc, b) => {
      acc[b] = [[], [], [], []];
      return acc;
    },
    {} as Record<BandName, number[][]>,
  ),
  latestBandTraces: null,
  latestBandsAbs: null,
  latestBandsRel: null,
  latestBandsAt: null,
  bandHistory: [],
  fft: null,
  brainState: null,
  estimatedEegHz: null,

  researchTimeline: [],
  researchEvents: [],
  lastStimulusClock: null,
  researchEyesContext: "unspecified",

  motion: { accel: null, gyro: null, ppg: null, fnirs: null },
  mindMonitorOsc: { addresses: {}, recent: [] },
  mindMonitor: {
    horseshoe: null,
    blink: null,
    jawClench: null,
    concentration: null,
    mellow: null,
    annotation: null,
    rawFft: {},
    updatedAt: null,
  },

  clientSim: {
    running: false,
    profile: "relaxed_eyes_closed",
    manualBands: null,
    oscRelayActive: false,
    packetsSent: 0,
    startedAt: null,
  },

  calibration: {
    isCalibrating: false,
    percent: 0,
    samples: 0,
    secondsElapsed: 0,
    secondsTotal: 90,
  },

  setWsStatus: (s) => set({ wsStatus: s }),
  requestWsReconnect: () =>
    set((st) => ({ wsReconnectEpoch: st.wsReconnectEpoch + 1 })),
  setMindMonitorMode: (enabled) => set({ mindMonitorMode: enabled }),

  setEegTraceSource: (eegTraceSource) => {
    try {
      localStorage.setItem(EEG_TRACE_LS_KEY, eegTraceSource);
    } catch {
      /* ignore */
    }
    set({ eegTraceSource });
  },

  hydrateEegTraceSourceFromStorage: () => {
    const v = readEegTraceSourceFromLocalStorage();
    if (v) set({ eegTraceSource: v });
  },

  hydrateBandEdgePresetFromStorage: () => {
    const v = readBandEdgePresetFromLocalStorage();
    if (v) set({ bandEdgePreset: v });
  },

  setBandEdgePreset: (preset) => {
    const v = coerceBandEdgePreset(preset);
    try {
      localStorage.setItem(BAND_EDGE_LS_KEY, v);
    } catch {
      /* ignore */
    }
    set({ bandEdgePreset: v });
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandEdgePreset: v }),
    }).catch(() => {});
  },

  setDevices: (devices) => set({ devices }),
  setActiveDevice: (name) => set({ activeDeviceName: name }),
  setSettings: (settings) =>
    set((st) => ({ settings: { ...st.settings, ...settings } })),

  setClientSim: (patch) =>
    set((st) => ({ clientSim: { ...st.clientSim, ...patch } })),

  feedSimEEG: (raw) => {
    const now = Date.now();
    const rolling = get().rollingRaw.map((buf, ch) => {
      const v = raw?.[ch];
      if (v === undefined || v === null) return buf;
      return pushRing(buf, v, ROLLING_SAMPLES);
    });
    tickBandFilterSampleRate(now);
    const st0 = get();
    const timelineSample: ResearchStreamSample = {
      wallMs: now,
      eeg: [
        Number(raw?.[0] ?? 0),
        Number(raw?.[1] ?? 0),
        Number(raw?.[2] ?? 0),
        Number(raw?.[3] ?? 0),
      ],
      bandsRel: st0.latestBandsRel,
      bandsAbs: st0.latestBandsAbs,
    };
    set((st) => ({
      latestEEG: {
        type: "eeg",
        timestamp: now,
        raw,
        deviceName: "CLIENT SIM",
      } as EEGMessage,
      rollingRaw: rolling,
      deviceName: "CLIENT SIM",
      packetCount: st.packetCount + 1,
      lastMessageAt: now,
      estimatedEegHz: Math.round(smoothedBandFilterFs * 10) / 10,
      researchTimeline: pushRing(st.researchTimeline, timelineSample, RESEARCH_TIMELINE_MAX),
    }));
  },

  logResearchEvent: (label, source, detail, meta) =>
    set((st) => ({
      researchEvents: pushRing(
        st.researchEvents,
        {
          id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          wallMs: Date.now(),
          label: label.slice(0, 240),
          source,
          detail: detail?.slice(0, 600),
          ...(typeof meta?.audioPositionMs === "number"
            ? { audioPositionMs: meta.audioPositionMs }
            : {}),
        },
        RESEARCH_EVENTS_MAX,
      ),
    })),

  clearResearchTimeline: () => set({ researchTimeline: [] }),
  clearResearchEvents: () => set({ researchEvents: [] }),
  setResearchEyesContext: (researchEyesContext) => set({ researchEyesContext }),
  feedSimBandTraces: (perBand) => {
    const next = appendBandTraces(get().rollingBandRaw, perBand);
    set({ rollingBandRaw: next, latestBandTraces: { ...perBand } });
  },
  feedSimBands: (absolute, relative) => {
    const now = Date.now();
    const history = pushRing(
      get().bandHistory,
      { t: now, rel: relative },
      BAND_HISTORY_LEN,
    );
    set({
      latestBandsAbs: absolute,
      latestBandsRel: relative,
      latestBandsAt: now,
      bandHistory: history,
      brainState: classifyBrainState(relative),
      lastMessageAt: now,
    });
  },
  feedSimMotion: (sensor, values) => {
    set((st) => ({
      motion: { ...st.motion, [sensor]: values },
      lastMessageAt: Date.now(),
    }));
  },

  ingest: (msg) => {
    const now = Date.now();
    switch (msg.type) {
      case "init": {
        const m = msg as any;
        const st = m.settings ?? {};
        set({
          settings: st,
          devices: m.devices ?? [],
          bandEdgePreset: coerceBandEdgePreset(st.bandEdgePreset ?? get().bandEdgePreset),
          lastMessageAt: now,
        });
        break;
      }
      case "eeg": {
        const m = msg as EEGMessage;
        const traceMode = get().eegTraceSource;
        // Choose the µV vector that drives charts / band traces:
        // - server_dsp: Node dsp.js output (matches Research server toggles); falls back to raw.
        // - device_raw: bridge scaling only, no server filtering.
        // - browser_dsp: apply web/lib/dspPipeline.ts to raw (legacy default).
        let pipelineInput = m.raw;
        if (traceMode === "server_dsp") {
          pipelineInput =
            m.processed && m.processed.length >= 4 ? m.processed : m.raw;
        } else if (traceMode === "device_raw") {
          pipelineInput = m.raw;
        }
        const processed =
          pipelineInput &&
          traceMode === "browser_dsp" &&
          dsp.getConfig().masterEnabled &&
          dsp.getConfig().carEnabled
            ? dsp.processEEG(pipelineInput).values
            : pipelineInput;
        if (processed && recorder.status().recording) {
          const n = recorder.getActiveEegChannelCount();
          const row = Array.from({ length: n }, (_, i) => Number(processed[i]) || 0);
          recorder.pushEEGSample(row, dsp.lastArtifact ? 1 : 0);
        }
        const rolling = get().rollingRaw.map((buf, ch) => {
          const v = processed?.[ch];
          if (v === undefined || v === null) return buf;
          return pushRing(buf, v, ROLLING_SAMPLES);
        });

        // Mind-Monitor-style band traces: same path as the browser simulator,
        // driven from streamed EEG so Combined / Multichannel pages animate
        // for server-side sim and hardware — not only clientSim.
        const ts = m.timestamp ?? now;
        let rollingBandRaw = get().rollingBandRaw;
        let latestBandTraces: Record<BandName, number[]> | null =
          get().latestBandTraces;
        const raw4 = processed ?? m.raw;
        if (raw4 && raw4.length >= 4) {
          tickBandFilterSampleRate(ts);
          const slice = [
            Number(raw4[0]),
            Number(raw4[1]),
            Number(raw4[2]),
            Number(raw4[3]),
          ];
          const perBand = bandFilters.process(slice);
          rollingBandRaw = appendBandTraces(rollingBandRaw, perBand);
          latestBandTraces = { ...perBand };
        }

        const serverFft = m.fft as { freqs?: unknown; magnitudes?: unknown } | undefined;
        const validServerFft =
          serverFft &&
          Array.isArray(serverFft.freqs) &&
          serverFft.freqs.length > 0 &&
          Array.isArray(serverFft.magnitudes) &&
          serverFft.magnitudes.length > 0;

        const pre = get();
        const wallMsForSample = Number(m.timestamp) || now;
        const eegTuple: [number, number, number, number] = [
          Number(processed?.[0] ?? m.raw?.[0] ?? 0),
          Number(processed?.[1] ?? m.raw?.[1] ?? 0),
          Number(processed?.[2] ?? m.raw?.[2] ?? 0),
          Number(processed?.[3] ?? m.raw?.[3] ?? 0),
        ];
        const ppgSnap = pre.motion.ppg?.filter((x) => Number.isFinite(x)) ?? [];
        const fnSnap = pre.motion.fnirs?.filter((x) => Number.isFinite(x)) ?? [];
        const timelineSample: ResearchStreamSample = {
          wallMs: wallMsForSample,
          eeg: eegTuple,
          bandsRel: pre.latestBandsRel,
          bandsAbs: pre.latestBandsAbs,
          ppg: ppgSnap.length ? [...ppgSnap] : null,
          fnirs: fnSnap.length ? [...fnSnap] : null,
        };

        set({
          latestEEG: m,
          rollingRaw: rolling,
          rollingBandRaw,
          latestBandTraces,
          deviceName: m.deviceName ?? get().deviceName,
          packetCount: m.packetCount ?? get().packetCount,
          fft: validServerFft
            ? {
                freqs: serverFft.freqs as number[],
                magnitudes: serverFft.magnitudes as number[][],
                timestamp: m.timestamp ?? now,
              }
            : get().fft,
          lastMessageAt: now,
          estimatedEegHz: Math.round(smoothedBandFilterFs * 10) / 10,
          researchTimeline: pushRing(
            pre.researchTimeline,
            timelineSample,
            RESEARCH_TIMELINE_MAX,
          ),
        });
        break;
      }
      case "bandPowers": {
        const m = msg as any;
        const abs = m.absolute as BandPowers;
        const rel = m.relative as BandPowers;
        const state = classifyBrainState(rel);
        const history = pushRing(
          get().bandHistory,
          { t: now, rel },
          BAND_HISTORY_LEN,
        );
        if (recorder.status().recording) {
          recorder.pushBands(abs, rel, state);
        }
        set({
          latestBandsAbs: abs,
          latestBandsRel: rel,
          latestBandsAt: Number(m.timestamp) || now,
          bandHistory: history,
          brainState: state,
          lastMessageAt: now,
        });
        break;
      }
      case "motionData": {
        // also forward to recorder so real-device sessions capture motion
        const m = msg as any;
        const sensor = m.sensor as keyof NeuroState["motion"];
        let values: number[] | null = null;
        if (Array.isArray(m.values)) {
          const mapped = m.values.map((v: unknown) => oscArgNumber(v));
          if (sensor === "ppg" || sensor === "accel" || sensor === "gyro") {
            if (mapped.length < 3 || !mapped.slice(0, 3).every((x: number) => Number.isFinite(x))) {
              values = null;
            } else {
              values = mapped.slice(0, 3);
            }
          } else {
            values = mapped;
          }
        }
        if (recorder.status().recording && values) {
          recorder.pushMotion(m.sensor, values);
        }
        set((st) => ({
          motion: { ...st.motion, [sensor]: values },
          lastMessageAt: now,
        }));
        break;
      }
      case "mindMonitorOsc": {
        const m = msg as any;
        const address = typeof m.address === "string" ? m.address : "";
        if (!address) break;
        const args = Array.isArray(m.args) ? m.args : [];
        const timestamp = Number(m.timestamp) || now;
        set((st) => {
          const previous = st.mindMonitorOsc.addresses[address];
          const addrLower = address.toLowerCase();
          const ppgOsc = isMindMonitorPpgOscAddress(addrLower)
            ? ppgTripleFromOscArgs(args)
            : null;
          return {
            mindMonitor: deriveMindMonitorKnownStream(
              st.mindMonitor,
              address,
              args,
              timestamp,
            ),
            mindMonitorOsc: {
              addresses: {
                ...st.mindMonitorOsc.addresses,
                [address]: {
                  args,
                  timestamp,
                  count: (previous?.count ?? 0) + 1,
                },
              },
              recent: pushRing(
                st.mindMonitorOsc.recent,
                { address, args, timestamp },
                80,
              ),
            },
            ...(ppgOsc ? { motion: { ...st.motion, ppg: ppgOsc } } : {}),
            lastMessageAt: now,
          };
        });
        const low = address.toLowerCase();
        if (
          low.includes("annotation") ||
          low.includes("/marker") ||
          low.includes("stimulus") ||
          low.includes("trial")
        ) {
          queueMicrotask(() => {
            const gist = args.length
              ? args.map((x: unknown) => String(x)).join(" ").slice(0, 96)
              : address;
            get().logResearchEvent(`osc:${gist || address}`, "osc", address.slice(0, 200));
          });
        }
        break;
      }
      case "battery": {
        const m = msg as any;
        set({ batteryPct: m.percentage ?? null, lastMessageAt: now });
        break;
      }
      case "touching": {
        const m = msg as any;
        set({ touching: Boolean(m.value), lastMessageAt: now });
        break;
      }
      case "device_list": {
        const m = msg as any;
        set({ devices: m.devices ?? [], lastMessageAt: now });
        break;
      }
      case "settings_updated": {
        const m = msg as any;
        const st = m.settings ?? {};
        set({
          settings: { ...get().settings, ...st },
          bandEdgePreset: coerceBandEdgePreset(
            st.bandEdgePreset ?? get().bandEdgePreset,
          ),
          lastMessageAt: now,
        });
        break;
      }
      case "calibration_status": {
        const m = msg as any;
        const p =
          typeof m.progress === "number"
            ? m.progress
            : (m.percentComplete ?? 0) / 100;
        set({
          calibration: {
            isCalibrating: Boolean(m.isCalibrating),
            percent: Math.round(Math.max(0, Math.min(1, p)) * 100),
            samples: m.samplesCollected ?? 0,
            secondsElapsed: m.secondsElapsed ?? 0,
            secondsTotal: m.secondsTotal ?? 90,
          },
          lastMessageAt: now,
        });
        break;
      }
      case "research_event": {
        const m = msg as ResearchEventBridgeMessage;
        const label =
          typeof m.label === "string" && m.label.trim()
            ? m.label.trim().slice(0, 240)
            : "research_event";
        const detail =
          typeof m.detail === "string" ? m.detail.slice(0, 600) : undefined;
        const src = m.source === "bridge" ? "bridge" : "http";
        const ap =
          typeof m.audioPositionMs === "number" && Number.isFinite(m.audioPositionMs)
            ? m.audioPositionMs
            : undefined;
        if (label === "stimulus_clock") {
          const wallMs =
            typeof m.wallMs === "number" && Number.isFinite(m.wallMs) ? m.wallMs : now;
          const stimulusMs = ap ?? 0;
          set({
            lastStimulusClock: {
              wallMs,
              audioPositionMs: stimulusMs,
              detail,
              source: src,
            },
            lastMessageAt: now,
          });
          break;
        }
        get().logResearchEvent(label, src, detail, ap != null ? { audioPositionMs: ap } : undefined);
        set({ lastMessageAt: now });
        break;
      }
      default:
        set({ lastMessageAt: now });
    }
  },
}));
