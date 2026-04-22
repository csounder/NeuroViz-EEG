"use client";

import { create } from "zustand";
import type {
  BandPowers,
  BandName,
  BrainStateResult,
  DeviceInfo,
  EEGMessage,
  NeuroVisSettings,
  ServerMessage,
} from "./types";
import { BAND_NAMES } from "./types";
import { classifyBrainState } from "./utils";
import { dsp } from "./dspPipeline";
import { bandFilters } from "./bandFilters";
import { recorder } from "./recorder";

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

interface NeuroState {
  // WebSocket connection
  wsStatus: ConnectionStatus;
  wsUrl: string;
  lastMessageAt: number | null;

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
  bandHistory: { t: number; rel: BandPowers }[]; // last N seconds
  fft: FftSnapshot | null;
  brainState: BrainStateResult | null;

  // Motion
  motion: {
    accel: number[] | null;
    gyro: number[] | null;
    ppg: number[] | null;
    fnirs: number[] | null;
  };

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
}

const ROLLING_SAMPLES = 1024; // ~4 seconds at 256Hz
const BAND_HISTORY_LEN = 600; // 60s @ 10Hz

function pushRing<T>(arr: T[], value: T, max: number): T[] {
  const next = arr.length >= max ? arr.slice(arr.length - max + 1) : arr.slice();
  next.push(value);
  return next;
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

/** Call when starting the browser simulator so WS rate estimates don't skew biquads. */
export function resetBandFilterStreamEstimator() {
  lastEegTimestampMs = null;
  smoothedBandFilterFs = 256;
}

export const useNeuroStore = create<NeuroState>((set, get) => ({
  wsStatus: "idle",
  wsUrl:
    process.env.NEXT_PUBLIC_NEUROVIS_WS_URL || "ws://localhost:8080",
  lastMessageAt: null,

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
  bandHistory: [],
  fft: null,
  brainState: null,

  motion: { accel: null, gyro: null, ppg: null, fnirs: null },

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
    }));
  },
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
        set({
          settings: m.settings ?? {},
          devices: m.devices ?? [],
          lastMessageAt: now,
        });
        break;
      }
      case "eeg": {
        const m = msg as EEGMessage;
        // Real-device EEG usually arrives throttled (10 Hz), so filters
        // designed for 256 Hz would be wrong — CAR is the one stage that
        // works at any rate, so we apply only when enabled.
        const processed =
          m.raw && dsp.getConfig().masterEnabled && dsp.getConfig().carEnabled
            ? dsp.processEEG(m.raw).values
            : m.raw;
        if (processed && recorder.status().recording) {
          recorder.pushEEG(
            processed[0] ?? 0,
            processed[1] ?? 0,
            processed[2] ?? 0,
            processed[3] ?? 0,
            dsp.lastArtifact ? 1 : 0,
          );
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

        set({
          latestEEG: m,
          rollingRaw: rolling,
          rollingBandRaw,
          latestBandTraces,
          deviceName: m.deviceName ?? get().deviceName,
          packetCount: m.packetCount ?? get().packetCount,
          fft: m.fft
            ? {
                freqs: m.fft.freqs,
                magnitudes: m.fft.magnitudes,
                timestamp: m.timestamp ?? now,
              }
            : get().fft,
          lastMessageAt: now,
        });
        break;
      }
      case "bandPowers": {
        const m = msg as any;
        const abs = dsp.normalizeBandPowers(
          m.absolute as BandPowers,
          "ALL",
        );
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
          bandHistory: history,
          brainState: state,
          lastMessageAt: now,
        });
        break;
      }
      case "motionData": {
        // also forward to recorder so real-device sessions capture motion
        const m = msg as any;
        if (recorder.status().recording && Array.isArray(m.values)) {
          recorder.pushMotion(m.sensor, m.values);
        }
        // fall through to existing motion handling below
        const sensor = m.sensor as keyof NeuroState["motion"];
        set((st) => ({
          motion: { ...st.motion, [sensor]: m.values ?? null },
          lastMessageAt: now,
        }));
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
        set({
          settings: { ...get().settings, ...(m.settings ?? {}) },
          lastMessageAt: now,
        });
        break;
      }
      case "calibration_status": {
        const m = msg as any;
        set({
          calibration: {
            isCalibrating: Boolean(m.isCalibrating),
            percent: m.percentComplete ?? 0,
            samples: m.samplesCollected ?? 0,
            secondsElapsed: m.secondsElapsed ?? 0,
            secondsTotal: m.secondsTotal ?? 90,
          },
          lastMessageAt: now,
        });
        break;
      }
      default:
        set({ lastMessageAt: now });
    }
  },
}));
