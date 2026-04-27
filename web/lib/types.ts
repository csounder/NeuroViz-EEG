// Shared TypeScript types mirroring the server-enhanced.js WebSocket & REST contract.

/**
 * What drives per-sample EEG in browser charts and the band-pass trace bank.
 * Band power messages (`bandPowers`) are always from the server unless you use clientSim.
 */
export type EegTraceSource = "server_dsp" | "device_raw" | "browser_dsp";

export type BandName = "delta" | "theta" | "alpha" | "beta" | "gamma";

export const BAND_NAMES: BandName[] = [
  "delta",
  "theta",
  "alpha",
  "beta",
  "gamma",
];

export const BAND_RANGES: Record<BandName, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 50],
};

export type BandPowers = Record<BandName, number>;

export interface EEGMessage {
  type: "eeg";
  timestamp: number;
  raw: number[];
  processed?: number[];
  stats?: {
    rms?: number[];
    peak?: number[];
  };
  fft?: {
    freqs: number[];
    magnitudes: number[][];
  };
  deviceName?: string;
  packetCount?: number;
}

export interface BandPowerMessage {
  type: "bandPowers";
  absolute: BandPowers;
  relative: BandPowers;
  timestamp?: number;
}

export interface MotionMessage {
  type: "motionData";
  sensor: "accel" | "gyro" | "ppg" | "fnirs";
  values: number[];
}

export interface BatteryMessage {
  type: "battery";
  percentage: number;
}

export interface TouchingMessage {
  type: "touching";
  value: boolean;
  status?: string;
}

export interface MindMonitorOscMessage {
  type: "mindMonitorOsc";
  address: string;
  args: unknown[];
  timestamp: number;
}

export interface DeviceInfo {
  name: string;
  displayName?: string;
  model?: string;
  rssi?: number;
  specs?: {
    name?: string;
    eegChannels?: number;
    eegSampleRate?: number;
    hasPPG?: boolean;
    hasMotion?: boolean;
    hasfNIRS?: boolean;
    ppgSampleRate?: number;
    motionSampleRate?: number;
    fnirsSampleRate?: number;
  };
}

export interface DeviceListMessage {
  type: "device_list";
  devices: DeviceInfo[];
}

export interface SettingsMessage {
  type: "settings_updated";
  settings: NeuroVisSettings;
}

export interface CalibrationStatusMessage {
  type: "calibration_status";
  isCalibrating: boolean;
  secondsElapsed?: number;
  secondsTotal?: number;
  samplesCollected?: number;
  percentComplete?: number;
}

export interface InitMessage {
  type: "init";
  config: { oscHost: string; oscPort: number };
  settings: NeuroVisSettings;
  devices: DeviceInfo[];
  eegBuffer?: number[][];
}

export interface InstrumentStatusMessage {
  type: "instrument_status";
  instrument?: string;
  status?: string;
  running?: boolean;
  [k: string]: unknown;
}

export interface RecordingCompleteMessage {
  type: "recording_complete";
  path?: string;
  duration?: number;
  samples?: number;
}

export interface BluetoothMessage {
  type: "bluetooth";
  status: string;
  [k: string]: unknown;
}

/** Server → browser: log a research marker (same clock as HTTP /api/research-event). */
export interface ResearchEventBridgeMessage {
  type: "research_event";
  label: string;
  detail?: string;
  source?: "http" | "bridge";
  wallMs?: number;
}

export type ServerMessage =
  | InitMessage
  | EEGMessage
  | BandPowerMessage
  | MotionMessage
  | BatteryMessage
  | TouchingMessage
  | MindMonitorOscMessage
  | DeviceListMessage
  | SettingsMessage
  | CalibrationStatusMessage
  | InstrumentStatusMessage
  | RecordingCompleteMessage
  | BluetoothMessage
  | ResearchEventBridgeMessage
  | { type: string; [k: string]: unknown };

export interface NeuroVisSettings {
  simulatorMode?: boolean;
  oscPrefix?: string;
  oscHost?: string;
  oscPort?: number;
  oscRate?: number;
  oscSmoothing?: number;
  oscScale?: number;
  oscStreams?: {
    rawEEG?: boolean;
    bandPowers?: boolean;
    /** MuseIO `/elements/raw_fft0`…`3` (129 floats) — Mind Monitor compatibility. */
    rawFft?: boolean;
    motion?: boolean;
    ppg?: boolean;
    fnirs?: boolean;
  };
  recordingEnabled?: boolean;
  deviceModel?: string;
  activeDevice?: string | null;
  [k: string]: unknown;
}

// Brain states (client-side classification of band power profile).
export type BrainState =
  | "aroused"
  | "focused"
  | "relaxed"
  | "drowsy"
  | "neutral";

export interface BrainStateResult {
  state: BrainState;
  confidence: number;
  dominant: BandName;
}
