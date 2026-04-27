#!/usr/bin/env node
/**
 * NeuroVis EEG Dashboard — Brain Activity Visualization
 * Real-time EEG from Muse (2/S/Athena) + OpenBCI with professional DSP & displays
 */

const express = require("express");
const WebSocket = require("ws");
const osc = require("osc");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const sessionDisk = require("./server-session-disk");

const {
  DSPPipeline,
  ExponentialSmoother,
  BiquadFilter,
  Downsampler,
} = require("./dsp");

// BrainFlow for OpenBCI Ganglion
const brainflow = require("brainflow");
const BoardShim = brainflow.BoardShim;
const BoardIds = brainflow.BoardIds;
const BrainFlowInputParams = brainflow.BrainFlowInputParams;
const LogLevels = brainflow.LogLevels;

// ============================================================================
// Configuration
// ============================================================================

const config = {
  webPort: process.env.WEB_PORT || 3000,
  wsPort: process.env.WS_PORT || 8080,
  oscHost: process.env.OSC_HOST || "127.0.0.1",
  oscPort: process.env.OSC_PORT || 7400,
  oscPrefix: process.env.OSC_PREFIX || "/muse",
  bridgeMode: process.env.BRIDGE_MODE || "swift",
  swiftBridgePath: process.env.BRIDGE_PATH || "./MuseBridge",
  athenaBridgePath:
    process.env.ATHENA_BRIDGE_PATH || "./scripts/athena_ble_bridge.py",
  maxBufferSize: 512,
  verbose: process.env.DEBUG_VERBOSE === "1",
};

(function logBridgeModeBanner() {
  const line = "━".repeat(58);
  const mode = config.bridgeMode;
  console.log(`\n${line}`);
  console.log(`  NeuroVis BLE bridge: ${String(mode).toUpperCase()}`);
  if (mode === "athena") {
    console.log(
      "  • Python path = Muse S Athena only (needs 273e0013). Muse 2 / Muse-33xx are hidden.",
    );
    console.log(
      "  • For Muse 2 / LibMuse:  npm run start:swift   or delete BRIDGE_MODE from .env",
    );
  } else {
    console.log(
      "  • Swift MuseBridge (default) — Muse 2, Muse 3, Muse S, etc.",
    );
  }
  console.log(`${line}\n`);
})();

function verboseLog(...args) {
  if (config.verbose) console.log(...args);
}

// Express app
const app = express();

// CACHE BUSTING: Prevent browser from caching HTML to ensure fresh code loads
app.use((req, res, next) => {
  if (req.url.endsWith(".html") || req.url === "/") {
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
  }
  next();
});

app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    setHeaders: function (res) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    },
  }),
);
app.use(express.json());

// WebSocket server
const wss = new WebSocket.Server({ port: config.wsPort });

wss.on("listening", () => {
  console.log(
    `✓ WebSocket server listening on ws://localhost:${config.wsPort}`,
  );
});

wss.on("error", (err) => {
  console.error(`❌ WebSocket server error: ${err.message}`);
});

// ── Research markers: HTTP → all WebSocket clients (Next.js / legacy UI) ──
function broadcastResearchEvent(payload) {
  const label = String(payload?.label ?? "").trim().slice(0, 240);
  if (!label) return { ok: false, error: "label_required", delivered_to: 0 };
  const detail =
    payload.detail != null ? String(payload.detail).slice(0, 600) : undefined;
  const source = payload.source === "bridge" ? "bridge" : "http";
  const ap = Number(payload?.audioPositionMs);
  const msgObj = {
    type: "research_event",
    label,
    detail,
    source,
    wallMs: Date.now(),
  };
  if (Number.isFinite(ap)) msgObj.audioPositionMs = ap;
  const msg = JSON.stringify(msgObj);
  let delivered = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
      delivered++;
    }
  });
  return { ok: true, delivered_to: delivered };
}

app.options("/api/research-event", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-NeuroVis-Research-Token",
  );
  res.sendStatus(204);
});

app.post("/api/research-event", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const secret = process.env.RESEARCH_EVENT_SECRET;
  if (
    secret &&
    String(req.get("x-neurovis-research-token") || "") !== secret
  ) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const label = req.body?.label;
  if (typeof label !== "string" || !label.trim()) {
    return res.status(400).json({
      ok: false,
      error: "label_required",
      hint: "JSON body: { label, detail? }",
    });
  }
  const out = broadcastResearchEvent({
    label,
    detail: req.body?.detail,
    source: req.body?.source,
  });
  if (!out.ok) {
    return res.status(400).json(out);
  }
  res.json({
    ok: true,
    delivered_to: out.delivered_to,
    ws_clients: wss.clients.size,
  });
});

// ============================================================================
// Device Model Detection - Muse 2, Muse 3, Muse S, Muse S Athena, OpenBCI Ganglion / Cyton / Ultra Cortex
// ============================================================================

// LibMuse model codes (from IXNMuseVersion enum)
const MODEL_CODES = {
  1: "Muse 2015",
  2: "Muse 2016",
  4: "Muse 2 (2nd Gen)",
  5: "Muse S",
  6: "Muse S Athena",
  7: "Muse S Athena (v7)",
  8: "Muse 3",
};

const DEVICE_MODELS = {
  MUSE_2: "Muse 2",
  MUSE_S: "Muse S",
  MUSE_S_ATHENA: "Muse S (Athena)",
  MUSE_3: "Muse 3",
};

const DEVICE_SPECS = {
  [DEVICE_MODELS.MUSE_2]: {
    name: "Muse 2",
    eegChannels: 4,
    channelNames: ["TP9", "AF7", "AF8", "TP10"],
    hasMotion: true,
    hasPPG: true,
    hasfNIRS: false,
    eegSampleRate: 256,
    motionSampleRate: 52,
    ppgSampleRate: 64,
    eegResolution: 12, // bits
    ppgResolution: 16,
    // Voltage scaling specs
    eegVoltageRange: 2.0, // mV peak-to-peak (2000 μV)
    eegCoupling: "AC",
    eegMicrovoltsPerBit: 2000 / Math.pow(2, 12), // ±1000 μV / 4096 = ~0.488 μV/bit
    defaultYRange: [-200, 200], // μV display range
  },
  [DEVICE_MODELS.MUSE_S]: {
    name: "Muse S (Original)",
    eegChannels: 4,
    channelNames: ["TP9", "AF7", "AF8", "TP10"],
    hasMotion: true,
    hasPPG: true,
    hasfNIRS: false,
    eegSampleRate: 256,
    motionSampleRate: 52,
    ppgSampleRate: 64,
    eegResolution: 12, // bits
    ppgResolution: 16,
    // Voltage scaling specs
    eegVoltageRange: 2.0, // mV peak-to-peak
    eegCoupling: "AC",
    eegMicrovoltsPerBit: 2000 / Math.pow(2, 12),
    defaultYRange: [-200, 200],
  },
  [DEVICE_MODELS.MUSE_3]: {
    name: "Muse 3",
    eegChannels: 4,
    channelNames: ["TP9", "AF7", "AF8", "TP10"],
    hasMotion: true,
    hasPPG: true,
    hasfNIRS: false,
    eegSampleRate: 256,
    motionSampleRate: 52,
    ppgSampleRate: 64,
    eegResolution: 12,
    ppgResolution: 16,
    eegVoltageRange: 2.0,
    eegCoupling: "AC",
    eegMicrovoltsPerBit: 2000 / Math.pow(2, 12),
    defaultYRange: [-200, 200],
  },
  [DEVICE_MODELS.MUSE_S_ATHENA]: {
    name: "Muse S Athena (2025)",
    eegChannels: 4,
    channelNames: ["TP9", "AF7", "AF8", "TP10"],
    auxChannels: 4,
    hasMotion: true,
    hasPPG: true,
    hasfNIRS: true,
    eegSampleRate: 256,
    motionSampleRate: 52,
    ppgSampleRate: 64,
    fnirsSampleRate: 10,
    eegResolution: 14, // bits
    ppgResolution: 20,
    // Voltage scaling specs
    eegVoltageRange: 1.45, // mV peak-to-peak (1450 μV)
    eegCoupling: "AC",
    eegMicrovoltsPerBit: 1450 / Math.pow(2, 14), // ±725 μV / 16384 = ~0.0885 μV/bit
    defaultYRange: [-150, 150], // μV display range
  },
  "OpenBCI Ganglion": {
    name: "OpenBCI Ganglion",
    eegChannels: 4,
    channelNames: ["Chan1", "Chan2", "Chan3", "Chan4"],
    hasMotion: true,
    hasPPG: false,
    hasfNIRS: false,
    eegSampleRate: 200,
    eegResolution: 18, // bits (MCP3912 ADC)
    // Voltage scaling specs
    eegVoltageRange: 5000, // ±2.5V = 5000 mV (5,000,000 μV)
    eegCoupling: "DC", // DC capable
    eegMicrovoltsPerBit: 5000000 / Math.pow(2, 18), // 5,000,000 μV / 262144 = ~19.07 μV/bit
    defaultYRange: [-500, 500], // μV display range
  },
  "OpenBCI Cyton": {
    name: "OpenBCI Cyton",
    eegChannels: 8,
    channelNames: [
      "Chan1",
      "Chan2",
      "Chan3",
      "Chan4",
      "Chan5",
      "Chan6",
      "Chan7",
      "Chan8",
    ],
    hasMotion: true,
    hasPPG: false,
    hasfNIRS: false,
    eegSampleRate: 250,
    eegResolution: 24, // bits (ADS1299)
    // Voltage scaling specs
    eegVoltageRange: 5000, // ±2.5V = 5000 mV
    eegCoupling: "DC", // DC capable
    eegMicrovoltsPerBit: 0.298, // Factory calibrated (ADS1299 datasheet)
    defaultYRange: [-500, 500], // μV display range
  },
  "OpenBCI Ultra Cortex": {
    name: "OpenBCI Ultra Cortex",
    eegChannels: 16,
    channelNames: Array.from({ length: 16 }, (_, i) => `Chan${i + 1}`),
    hasMotion: true,
    hasPPG: false,
    hasfNIRS: false,
    eegSampleRate: 250,
    eegResolution: 24,
    eegVoltageRange: 5000,
    eegCoupling: "DC",
    eegMicrovoltsPerBit: 0.298,
    defaultYRange: [-500, 500],
  },
};

// ============================================================================
// Voltage Scaling Utilities
// ============================================================================

/**
 * Auto-detect input format and convert to microvolts
 * @param {number[]} samples - Raw input values (one channel)
 * @param {string} deviceModel - Device model key from DEVICE_SPECS
 * @param {string} inputFormat - "auto", "normalized", "raw_counts", or "microvolts"
 * @returns {number[]} - Values in microvolts
 */
function scaleToMicrovolts(samples, deviceModel, inputFormat = "auto") {
  const spec = DEVICE_SPECS[deviceModel];
  if (!spec) {
    console.warn(`Unknown device model: ${deviceModel}, returning raw values`);
    return samples;
  }

  // If already in microvolts (e.g., from Mind Monitor), return as-is
  if (inputFormat === "microvolts") {
    return samples;
  }

  // Auto-detect format based on value ranges
  if (inputFormat === "auto") {
    const maxAbs = Math.max(...samples.map(Math.abs));

    if (maxAbs <= 1.5) {
      // Likely normalized (0-1 or -1 to 1)
      inputFormat = "normalized";
    } else if (maxAbs > 1000) {
      // Likely already microvolts or raw ADC counts
      if (maxAbs > 10000) {
        inputFormat = "raw_counts"; // OpenBCI raw counts (large integers)
      } else {
        inputFormat = "microvolts"; // Already in μV
      }
    } else {
      // Typical EEG range: 1.5-1000 μV - assume microvolts
      inputFormat = "microvolts";
    }
  }

  // Convert based on detected/specified format
  switch (inputFormat) {
    case "normalized":
      // Scale from -1..1 to full voltage range
      const halfRange = (spec.eegVoltageRange * 1000) / 2; // Convert mV to μV
      return samples.map((s) => s * halfRange);

    case "raw_counts":
      // Convert ADC counts to microvolts
      return samples.map((s) => s * spec.eegMicrovoltsPerBit);

    default:
      return samples;
  }
}

/**
 * Get appropriate Y-axis range for a device
 * @param {string} deviceModel - Device model key
 * @returns {[number, number]} - [min, max] in microvolts
 */
function getDeviceYRange(deviceModel) {
  const spec = DEVICE_SPECS[deviceModel];
  return spec ? spec.defaultYRange : [-200, 200];
}

/**
 * Format device info string
 * @param {string} deviceModel - Device model key
 * @returns {string} - Human-readable specs
 */
function getDeviceInfoString(deviceModel) {
  const spec = DEVICE_SPECS[deviceModel];
  if (!spec) return "Unknown device";

  return `${spec.name} | ${spec.eegChannels}ch | ${spec.eegSampleRate}Hz | ${spec.eegResolution}bit | ${spec.eegCoupling} | ±${spec.eegVoltageRange / 2}mV`;
}

// OSC port
let oscPort = null;
let swiftProcess = null;
/** When true, bridge process exit does not auto-respawn (used while swapping Swift ↔ Athena). */
let suppressBridgeAutoRestart = false;
let csoundProcess = null; // Track current Csound instrument
let currentInstrument = null;
let currentDevice = null; // Track selected device model

// Ganglion BrainFlow session
let ganglionBoard = null;
let ganglionStreaming = false;
let ganglionInterval = null;

let connectedDevices = [];
let eegBuffer = [[], [], [], []];
let bandPowersBuffer = {
  absolute: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
  relative: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
};
let currentBandPowers = {
  absolute: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  relative: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
};
let currentBandPowersUpdatedAt = 0;

// DSP Pipeline (initialized with default settings, will be updated dynamically)
const dsp = new DSPPipeline({
  sampleRate: 256,
  numChannels: 4,
  applyCAR: true, // Common Average Reference - spatial noise reduction
  applyNotch: true,
  applyBandpass: true,
  applySmoothing: true,
  smoothingAmount: 10,
  scaling: "0-1",
  outputRate: 256,
  notchHz: 60,
  bandpassLo: 1,
  bandpassHi: 45,
  applyMedian3: false,
});

// Settings state
let settings = {
  oscPrefix: config.oscPrefix,
  scalingMode: "0-1", // 0-1 (default), 0-3 (Mind Monitor), raw, or zscore
  smoothingAmount: 10, // 0 = no smoothing
  applyCAR: true, // Common Average Reference - removes global noise
  applyNotch: true,
  /** Mains notch center frequency for server dsp.js (50 or 60 Hz). */
  notchHz: 60,
  bandpassLo: 1,
  bandpassHi: 45,
  /** 3-point running median after bandpass (impulse suppression). */
  applyMedian3: false,
  applyBandpass: true,
  displayMode: "raw", // raw, bands, fft
  simulatorMode: false,
  simulatorFreq: 10, // Hz
  // Simulator profile — shapes the band power distribution so receivers can be
  // tested across different brain states. One of:
  // "relaxed_eyes_closed" | "focused" | "meditative" | "drowsy" | "aroused"
  simulatorProfile: "relaxed_eyes_closed",
  selectedChannels: [0, 1, 2, 3],
  recordingEnabled: false,
  oscRateHz: 256, // OSC output rate (Hz)
  wsRateHz: 10, // WebSocket dashboard rate (Hz)
  outputRateHz: 256, // EEG stream output rate (can be 10, 64, 128, 256, 512 Hz)

  // Device & Voltage Scaling
  deviceModel: DEVICE_MODELS.MUSE_2, // Default device
  inputFormat: "auto", // "auto", "normalized", "raw_counts", or "microvolts"
  yAxisRange: [-200, 200], // μV display range (auto-set from device specs)

  // OSC Master Control
  oscSending: false, // MASTER ON/OFF - must be true to send ANY OSC (safety: default OFF)

  // OSC Stream Selection
  oscStreams: {
    rawEEG: false, // /muse/eeg - Raw 256 Hz EEG (HIGH BANDWIDTH - disable unless needed)
    bandAbsolute: true, // /muse/bands/absolute - Log-scale absolute band powers (10 Hz)
    bandRelative: true, // /muse/bands/relative - Relative band powers 0-1 (10 Hz) ← USE THIS
    motionAccel: false, // /muse/acc - Accelerometer X,Y,Z (10 Hz)
    motionGyro: false, // /muse/gyro - Gyroscope X,Y,Z (10 Hz)
    motionPPG: true, // /muse/ppg - Heart rate / PPG red,green,ir (1 Hz)
  },

  // OSC Output Scaling
  oscOutputScaler: 1, // Multiplier for OSC values (1, 3, 10, 20, etc.)
  oscScaleMode: "normalize", // "normalize" (use scaler), "raw" (no scaling), "none"
  oscAllowNegative: true, // true = send -1 to +1, false = clamp to 0 to +1

  // Baseline normalization (rolling z-score on relative bands)
  applyBaseline: false, // Master toggle for z-score normalization
  logTransform: false, // Apply log10 before z-score
  /** Rolling z-score window for relative bands (~10 updates/s → maxSamples = sec×10). */
  baselineWindowSec: 60,

  // Granular OSC controls
  oscGranular: {
    channels: {
      CH1: true,
      CH2: true,
      CH3: true,
      CH4: true,
    },
    bands: {
      delta: true,
      theta: true,
      alpha: true,
      beta: true,
      gamma: true,
    },
    valueTypes: {
      absolute: true, // Raw µV² power
      relative: true, // 0-1 normalized
      averages: true, // Cross-channel mean/min/max
    },
  },

  /**
   * Welch / FFT band bin edges (Hz). Matches web `bandEdgePreset`.
   * neurovis: δ 0.5–4; research_dc: δ 1–4 (Mind Monitor δ floor), θ–γ NeuroVis;
   * mindmonitor: full Mind Monitor manual edges.
   */
  bandEdgePreset: "neurovis",
};

dsp.updateConfig({ notchHz: settings.notchHz });

let recordedData = [];
let packetCount = 0;
let bandPowerCount = 0; // For real Muse: count EEG packets to broadcast band powers @ 10 Hz
let simulatorInterval = null;

// WebSocket throttle: 10 Hz = 100ms between broadcasts
const WS_BROADCAST_RATE_HZ = 10;
const WS_BROADCAST_INTERVAL_MS = 1000 / WS_BROADCAST_RATE_HZ; // 100ms
let lastWSBroadcastTime = 0;

// ============================================================================
// Calculate Band Powers from EEG using Welch Method (for real Muse hardware)
// ============================================================================

const NEUROVIS_WELCH_BAND_RANGES = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 45],
};

const MIND_MONITOR_WELCH_BAND_RANGES = {
  delta: [1, 4],
  theta: [4, 8],
  alpha: [7.5, 13],
  beta: [13, 30],
  gamma: [30, 44],
};

const RESEARCH_DC_WELCH_BAND_RANGES = {
  ...NEUROVIS_WELCH_BAND_RANGES,
  delta: [1, 4],
};

function normalizeBandEdgePreset(v) {
  if (v === "research_dc" || v === "mindmonitor" || v === "neurovis") return v;
  return "neurovis";
}

function welchBandRangesForPreset(preset) {
  const p = normalizeBandEdgePreset(preset);
  if (p === "mindmonitor") return MIND_MONITOR_WELCH_BAND_RANGES;
  if (p === "research_dc") return RESEARCH_DC_WELCH_BAND_RANGES;
  return NEUROVIS_WELCH_BAND_RANGES;
}

function calculateBandPowersFromEEG() {
  // Uses the live raw EEG ring buffer to calculate true frequency-band power.
  // Returns {absolute, relative} matching Muse format for WebSocket broadcast

  try {
    if (!eegBuffer || eegBuffer.length < 4 || eegBuffer[0].length < 128) {
      return null;
    }

    const ranges = welchBandRangesForPreset(settings.bandEdgePreset);
    const bands = {
      delta: { range: ranges.delta, label: "δ" },
      theta: { range: ranges.theta, label: "θ" },
      alpha: { range: ranges.alpha, label: "α" },
      beta: { range: ranges.beta, label: "β" },
      gamma: { range: ranges.gamma, label: "γ" },
    };

    const sampleRate = 256;
    // Shorter window gives the Research monitor visibly live values while still
    // covering delta at 256 Hz well enough for an exploratory dashboard.
    const n = Math.min(128, ...eegBuffer.slice(0, 4).map((buf) => buf.length));
    if (n < 128) return null;

    let totalPower = 0;
    const bandPowers = {};

    Object.keys(bands).forEach((bandName) => {
      const range = bands[bandName].range;
      let power = 0;
      let bins = 0;

      for (let ch = 0; ch < 4; ch++) {
        const raw = eegBuffer[ch].slice(-n);
        if (raw.length < n) continue;
        const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
        const lo = Math.max(1, Math.ceil((range[0] * n) / sampleRate));
        const hi = Math.min(Math.floor((range[1] * n) / sampleRate), n / 2);

        for (let k = lo; k <= hi; k++) {
          let re = 0;
          let im = 0;
          for (let i = 0; i < n; i++) {
            const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
            const sample = (raw[i] - mean) * hann;
            const phase = (2 * Math.PI * k * i) / n;
            re += sample * Math.cos(phase);
            im -= sample * Math.sin(phase);
          }
          power += (re * re + im * im) / n;
          bins++;
        }
      }

      bandPowers[bandName] = bins > 0 ? power / bins : 0;
      totalPower += bandPowers[bandName];
    });

    const relativePowers = {};
    Object.keys(bandPowers).forEach((bandName) => {
      relativePowers[bandName] =
        totalPower > 0 ? bandPowers[bandName] / totalPower : 0.2;
    });

    const absolutePowers = {};
    Object.keys(bandPowers).forEach((bandName) => {
      absolutePowers[bandName] = 10 * Math.log10(Math.max(bandPowers[bandName], 1e-12));
    });

    return {
      absolute: absolutePowers,
      relative: relativePowers,
    };
  } catch (err) {
    console.error(`❌ Band power calculation error: ${err.message}`);
    return null;
  }
}

// ============================================================================
// Simulator (for testing without Muse)
// ============================================================================

/**
 * REALISTIC EEG SIMULATOR
 *
 * Generates physiologically accurate EEG signals for testing/demonstration.
 * Based on published neuroscience literature and typical resting-state EEG characteristics.
 *
 * Key References:
 * - Niedermeyer & Lopes da Silva, "Electroencephalography: Basic Principles" (2005)
 * - Buzsáki & Draguhn, "Neuronal Oscillations in Cortical Networks" Science (2004)
 * - Berger, H. "Über das Elektrenkephalogramm des Menschen" (1929) - Original alpha discovery
 *
 * Artifacts included: 60Hz power line, breathing, slow cortical potentials
 *
 * Profiles shape the band-power targets so OSC receivers (Csound/Max) can be
 * tested against a variety of brain states:
 */
const SIM_PROFILES = {
  // name                   : [delta, theta, alpha, beta, gamma]  (relative, sum≈1)
  relaxed_eyes_closed: { delta: 0.08, theta: 0.12, alpha: 0.5, beta: 0.2, gamma: 0.1 },
  focused:             { delta: 0.05, theta: 0.1,  alpha: 0.2, beta: 0.5, gamma: 0.15 },
  meditative:          { delta: 0.1,  theta: 0.45, alpha: 0.3, beta: 0.1, gamma: 0.05 },
  drowsy:              { delta: 0.45, theta: 0.25, alpha: 0.15,beta: 0.1, gamma: 0.05 },
  aroused:             { delta: 0.05, theta: 0.08, alpha: 0.15,beta: 0.42,gamma: 0.30 },
};

function getSimProfile() {
  return (
    SIM_PROFILES[settings.simulatorProfile] || SIM_PROFILES.relaxed_eyes_closed
  );
}

function generateSimulatorData() {
  if (!settings.simulatorMode) return null;

  const time = Date.now() / 1000;

  // REALISTIC EEG GENERATION based on published neuroscience literature
  // References:
  // - Niedermeyer & Lopes da Silva, "Electroencephalography" (2005)
  // - Buzsáki & Draguhn, "Neuronal Oscillations in Cortical Networks" (2004)
  // - Typical EEG amplitudes: 10-100 µV peak-to-peak

  const randomInRange = (min, max) => min + Math.random() * (max - min);

  // Physiologically realistic amplitudes (microvolts) — shaped by the active
  // simulator profile. Baseline peak amplitudes from the literature are
  // multiplied by (profileWeight / relaxedWeight) so the raw EEG time-series
  // and its FFT match the advertised band distribution.
  const profile = getSimProfile();
  const base = SIM_PROFILES.relaxed_eyes_closed;
  const shape = (band) => profile[band] / base[band];
  const amplitudes = {
    delta: 30 * shape("delta"),
    theta: 20 * shape("theta"),
    alpha: 40 * shape("alpha"),
    beta: 10 * shape("beta"),
    gamma: 3 * shape("gamma"),
  };

  // Generate 4 channels (TP9, AF7, AF8, TP10) with realistic spatial variations
  const channels = [];
  const channelNames = ["TP9", "AF7", "AF8", "TP10"];

  for (let ch = 0; ch < 4; ch++) {
    // Spatial variation: frontal channels (AF7, AF8) have more beta,
    // temporal channels (TP9, TP10) have more alpha
    const isFrontal = ch === 1 || ch === 2;
    const alphaFactor = isFrontal ? 0.7 : 1.2; // Less alpha in frontal
    const betaFactor = isFrontal ? 1.5 : 0.8; // More beta in frontal

    // Hemisphere variation: slight asymmetry between left/right
    const isLeft = ch === 0 || ch === 1;
    const asymmetry = isLeft ? 1.0 : 1.05;

    let signal = 0;

    // Delta band (0.5-4 Hz) - multiple harmonics for realism
    for (let h = 1; h <= 2; h++) {
      const deltaFreq = randomInRange(0.5, 4) * h;
      signal +=
        (amplitudes.delta / h) *
        asymmetry *
        Math.sin(2 * Math.PI * deltaFreq * time + Math.random() * 2 * Math.PI);
    }

    // Theta band (4-8 Hz) - with harmonic content
    for (let h = 1; h <= 2; h++) {
      const thetaFreq = randomInRange(4, 8) * h;
      signal +=
        (amplitudes.theta / h) *
        asymmetry *
        Math.sin(2 * Math.PI * thetaFreq * time + Math.random() * 2 * Math.PI);
    }

    // Alpha band (8-13 Hz) - DOMINANT, with strong 10 Hz component (Berger rhythm)
    const alphaBase = 10; // Typical posterior alpha rhythm
    signal +=
      amplitudes.alpha *
      alphaFactor *
      asymmetry *
      Math.sin(2 * Math.PI * alphaBase * time);
    // Add alpha variation
    signal +=
      amplitudes.alpha *
      0.3 *
      alphaFactor *
      asymmetry *
      Math.sin(2 * Math.PI * randomInRange(8, 13) * time);

    // Beta band (13-30 Hz) - multiple components (low beta, high beta)
    const betaFreq1 = randomInRange(13, 20); // Low beta
    const betaFreq2 = randomInRange(20, 30); // High beta
    signal +=
      amplitudes.beta *
      0.7 *
      betaFactor *
      asymmetry *
      Math.sin(2 * Math.PI * betaFreq1 * time);
    signal +=
      amplitudes.beta *
      0.3 *
      betaFactor *
      asymmetry *
      Math.sin(2 * Math.PI * betaFreq2 * time);

    // Gamma band (30-50 Hz) - burst-like, intermittent
    const gammaFreq = randomInRange(35, 45);
    const gammaBurst = Math.sin(2 * Math.PI * 0.2 * time) > 0.5 ? 1.0 : 0.3;
    signal +=
      amplitudes.gamma *
      gammaBurst *
      asymmetry *
      Math.sin(2 * Math.PI * gammaFreq * time);

    // Realistic EEG noise characteristics:
    // 1. Pink noise (1/f) - physiological background
    signal += (Math.random() - 0.5) * 5;

    // 2. 60 Hz power line interference (realistic artifact)
    signal += 0.5 * Math.sin(2 * Math.PI * 60 * time);

    // 3. Slow cortical potentials (< 0.5 Hz)
    signal += 3 * Math.sin(2 * Math.PI * 0.08 * time);

    // 4. Breathing artifact (~0.25 Hz)
    signal += 2 * Math.sin(2 * Math.PI * 0.25 * time);

    channels.push(signal);
  }

  return channels;
}

function generateSimulatorBandPowers() {
  if (!settings.simulatorMode) return null;

  const time = Date.now() / 1000;
  const profile = getSimProfile();

  // Per-band slow oscillation (±20 % of the profile target) to keep the
  // stream interesting for receivers. Each band has its own phase/frequency
  // so the stream never becomes periodic-looking.
  const wobble = (freq, offset = 0) =>
    0.5 + 0.4 * Math.sin(2 * Math.PI * freq * time + offset);

  const raw = {
    delta: profile.delta * (0.8 + wobble(0.05, 0) * 0.4),
    theta: profile.theta * (0.8 + wobble(0.08, 1) * 0.4),
    alpha: profile.alpha * (0.8 + wobble(0.12, 2) * 0.4),
    beta: profile.beta * (0.8 + wobble(0.15, 3) * 0.4),
    gamma: profile.gamma * (0.8 + wobble(0.1, 4) * 0.4),
  };

  // Normalize to sum = 1 so downstream math stays clean.
  const sum = raw.delta + raw.theta + raw.alpha + raw.beta + raw.gamma || 1;
  const rel = {
    delta: raw.delta / sum,
    theta: raw.theta / sum,
    alpha: raw.alpha / sum,
    beta: raw.beta / sum,
    gamma: raw.gamma / sum,
  };

  // Convert to rough dB absolute power (relative to 1 µV²).
  // Maps rel 0..1 → about -10..+6 dB with slow drift.
  const toDb = (r, drift) =>
    -10 + r * 20 + (wobble(0.07, drift) - 0.5) * 2;

  const abs = {
    delta: toDb(rel.delta, 0),
    theta: toDb(rel.theta, 1),
    alpha: toDb(rel.alpha, 2),
    beta: toDb(rel.beta, 3),
    gamma: toDb(rel.gamma, 4),
  };

  return { absolute: abs, relative: rel };
}

function generateSimulatorMotion(type) {
  if (!settings.simulatorMode) return null;
  const time = Date.now() / 1000;

  if (type === "accel") {
    return [
      Math.sin(2 * Math.PI * 0.5 * time) * 0.3 + (Math.random() - 0.5) * 0.1,
      Math.sin(2 * Math.PI * 0.7 * time) * 0.3 + (Math.random() - 0.5) * 0.1,
      0.98 + Math.sin(2 * Math.PI * 0.3 * time) * 0.05, // Z ≈ gravity
    ];
  } else if (type === "gyro") {
    return [
      Math.sin(2 * Math.PI * 0.3 * time) * 5 + (Math.random() - 0.5) * 2,
      Math.cos(2 * Math.PI * 0.4 * time) * 5 + (Math.random() - 0.5) * 2,
      Math.sin(2 * Math.PI * 0.2 * time) * 5 + (Math.random() - 0.5) * 2,
    ];
  } else if (type === "ppg") {
    // Realistic heartbeat simulation (ECG-style PQRST complex)
    // Heart rate: ~72 BPM (1.2 Hz)
    const BPM = 72;
    const HR_HZ = BPM / 60; // 1.2 Hz
    const beatPeriod = 1 / HR_HZ; // ~0.833s
    const beatPhase = (time % beatPeriod) / beatPeriod; // 0-1 within each beat

    let signal = 0;

    // PQRST complex approximation
    if (beatPhase < 0.1) {
      // P wave (atrial depolarization) - small bump
      const p = beatPhase / 0.1;
      signal = 0.15 * Math.sin(Math.PI * p);
    } else if (beatPhase < 0.2) {
      // PR segment - baseline
      signal = 0;
    } else if (beatPhase < 0.3) {
      // QRS complex (ventricular depolarization) - sharp spike
      const qrs = (beatPhase - 0.2) / 0.1;
      if (qrs < 0.3) {
        // Q dip
        signal = -0.1 * (qrs / 0.3);
      } else if (qrs < 0.6) {
        // R spike (main heartbeat peak)
        signal = 1.0 * Math.sin((Math.PI * (qrs - 0.3)) / 0.3);
      } else {
        // S dip
        signal = -0.15 * (1 - (qrs - 0.6) / 0.4);
      }
    } else if (beatPhase < 0.5) {
      // ST segment - baseline
      signal = 0;
    } else if (beatPhase < 0.7) {
      // T wave (ventricular repolarization) - rounded bump
      const t = (beatPhase - 0.5) / 0.2;
      signal = 0.3 * Math.sin(Math.PI * t);
    } else {
      // Rest - baseline
      signal = 0;
    }

    // Add small noise for realism
    signal += (Math.random() - 0.5) * 0.02;

    // Normalize to 0-1 range (Muse PPG format)
    const normalized = signal * 0.4 + 0.5; // Center around 0.5

    // Return [red, green, IR] - all similar for heartbeat
    return [normalized, normalized * 0.95, normalized * 1.05];
  }
  return null;
}

// ============================================================================
// OSC Setup
// ============================================================================

let oscInputPort = null; // Mind Monitor OSC input listener
let lastOscInputErrorAt = 0;
let oscInputErrorCount = 0;
let firstMindMonitorAddressLogged = false;

function initOSC() {
  // OSC OUTPUT: Send to Csound/Max/etc
  oscPort = new osc.UDPPort({
    localAddress: "127.0.0.1",
    localPort: 0,
    remoteAddress: config.oscHost,
    remotePort: config.oscPort, // Send to 7400 (Csound primary, also Max/MSP, TouchDesigner, Unity)
    metadata: true,
  });

  oscPort.open();
  console.log(`✓ OSC OUTPUT ready → ${config.oscHost}:${config.oscPort}`);
  console.log(`✓ OSC prefix: ${settings.oscPrefix}`);
  console.log(`🎵 PRIMARY: Csound listening on port ${config.oscPort}`);

  oscPort.on("error", (err) => {
    console.error("❌ OSC OUTPUT Error:", err.message);
  });

  // OSC INPUT: Listen for Mind Monitor data
  initOSCInput();
}

function initOSCInput() {
  oscInputPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 5000, // Mind Monitor default
    metadata: true,
  });

  oscInputPort.on("ready", () => {
    console.log(`✓ OSC INPUT listening on port 5000 (Mind Monitor)`);
    console.log(`📱 Waiting for Mind Monitor data...`);
  });

  oscInputPort.on("message", (msg) => {
    try {
      handleMindMonitorOSC(msg);
    } catch (err) {
      logOscInputError(err);
    }
  });

  oscInputPort.on("error", (err) => {
    logOscInputError(err);
  });

  oscInputPort.open();
}

function logOscInputError(err) {
  oscInputErrorCount += 1;
  const now = Date.now();

  // Mind Monitor can generate many UDP packets per second. If the phone is
  // pointed at the wrong mode/port, avoid drowning the terminal in repeats.
  if (now - lastOscInputErrorAt > 2000) {
    const message = err && err.message ? err.message : String(err);
    console.error(
      `❌ OSC INPUT Error (${oscInputErrorCount} total): ${message}`,
    );
    console.error(
      "   Check Mind Monitor: OSC enabled, host is this Mac's IP, port 5000, protocol OSC/UDP.",
    );
    lastOscInputErrorAt = now;
  }
}

// Mind Monitor OSC message handler
function handleMindMonitorOSC(msg) {
  if (!msg || typeof msg.address !== "string") {
    throw new Error("Malformed OSC packet: missing address");
  }

  const addr = msg.address;
  const args = Array.isArray(msg.args)
    ? msg.args.map((a) =>
        a && typeof a === "object" && "value" in a ? a.value : a,
      )
    : [];

  if (!firstMindMonitorAddressLogged) {
    console.log(`📱 FIRST MIND MONITOR OSC: ${addr}`);
    firstMindMonitorAddressLogged = true;
  }

  broadcastMindMonitorOsc(addr, args);

  // Raw EEG (already in microvolts!)
  if (addr === "/muse/eeg") {
    const eeg = args.slice(0, 4).map((v) => Number(v) || 0);
    if (eeg.length === 4) {
      packetCount++;
      const processed = dsp.process(eeg);
      broadcastEEGData(eeg, processed, {
        timestamp: Date.now(),
        deviceName: "Mind Monitor",
        source: "mind_monitor",
      });
    }

    // Forward to OSC output if enabled
    if (settings.oscSending) {
      sendOSC(msg);
    }
  }

  // Band powers (absolute / relative)
  else if (addr.startsWith("/muse/elements/")) {
    const leaf = addr.split("/").pop();
    const match = leaf.match(/^(delta|theta|alpha|beta|gamma)_(absolute|relative)$/);
    const band = match?.[1];
    const kind = match?.[2];
    if (band && kind) {
      const channels = args.slice(0, 4).map((v) => Number(v) || 0);
      const mean =
        channels.reduce((sum, value) => sum + value, 0) /
        Math.max(1, channels.length);

      if (kind === "absolute") {
        currentBandPowers.absolute[band] = mean;
        bandPowersBuffer.absolute[band].push(mean);
        if (bandPowersBuffer.absolute[band].length > config.maxBufferSize) {
          bandPowersBuffer.absolute[band].shift();
        }

        const lin = {};
        let total = 0.0001;
        Object.keys(currentBandPowers.absolute).forEach((name) => {
          lin[name] = Math.pow(10, currentBandPowers.absolute[name] || -6);
          total += lin[name];
        });
        Object.keys(currentBandPowers.relative).forEach((name) => {
          currentBandPowers.relative[name] = lin[name] / total;
          bandPowersBuffer.relative[name].push(currentBandPowers.relative[name]);
          if (bandPowersBuffer.relative[name].length > config.maxBufferSize) {
            bandPowersBuffer.relative[name].shift();
          }
        });
      } else {
        currentBandPowers.relative[band] = mean;
        bandPowersBuffer.relative[band].push(currentBandPowers.relative[band]);
        if (bandPowersBuffer.relative[band].length > config.maxBufferSize) {
          bandPowersBuffer.relative[band].shift();
        }
      }

      packetCount++;
      broadcastBandPowers(currentBandPowers.absolute, currentBandPowers.relative);
    }
  }

  // Accelerometer
  else if (addr === "/muse/acc") {
    const [x, y, z] = args;
    broadcastMotionData("accel", [x, y, z]);
  }

  // Gyroscope
  else if (addr === "/muse/gyro") {
    const [x, y, z] = args;
    broadcastMotionData("gyro", [x, y, z]);
  }

  // PPG
  else if (addr === "/muse/ppg") {
    broadcastMotionData("ppg", args.slice(0, 3));
  }

  // Battery
  else if (addr === "/muse/batt") {
    const [percent, fuel, volt, temp] = args;
    broadcastBatteryLevel(percent);
  }

  // Touching forehead
  else if (addr === "/muse/touching_forehead") {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "touching",
            value: args[0] === 1,
            source: "mind_monitor",
          }),
        );
      }
    });
  }
}

let lastMindMonitorOscBroadcastAt = 0;
function broadcastMindMonitorOsc(address, args) {
  const now = Date.now();
  if (now - lastMindMonitorOscBroadcastAt < 25) return;
  lastMindMonitorOscBroadcastAt = now;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "mindMonitorOsc",
          address,
          args,
          timestamp: now,
        }),
      );
    }
  });
}

// ============================================================================
// Swift Bridge Launch
// ============================================================================

/**
 * Hot-swap BLE backend without restarting Node. Muse 2 → Swift; Muse S Athena (273e) → Athena.
 * @returns {{ changed: boolean, bridgeMode: string }}
 */
function switchBleBridgeMode(mode) {
  const normalized = mode === "athena" ? "athena" : "swift";
  if (config.bridgeMode === normalized) {
    return { changed: false, bridgeMode: normalized };
  }
  const prev = config.bridgeMode;
  config.bridgeMode = normalized;
  if (prev === "athena" && normalized === "swift") {
    settings.inputFormat = "auto";
  }

  connectedDevices = [];
  currentDevice = null;
  global._packetTypes = {};

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "device_list", devices: [] }));
    }
  });

  const spawnNext = () => {
    suppressBridgeAutoRestart = false;
    console.log(`\n🔁 BLE bridge switched → ${normalized.toUpperCase()}\n`);
    handleStatus({
      type: "status",
      message:
        normalized === "athena"
          ? "BLE backend: Athena (Python). Muse 2 / Muse-33xx use Swift mode instead."
          : "BLE backend: Swift (LibMuse). Device list will refresh in a few seconds.",
    });
    launchSwiftBridge();
  };

  suppressBridgeAutoRestart = true;
  const old = swiftProcess;
  if (old && !old.killed) {
    old.once("close", spawnNext);
    try {
      old.kill("SIGTERM");
    } catch (e) {
      spawnNext();
    }
  } else {
    spawnNext();
  }

  return { changed: true, bridgeMode: normalized };
}

function launchSwiftBridge() {
  const useAthenaBridge = config.bridgeMode === "athena";
  const bridgeCommand = useAthenaBridge ? "python3" : config.swiftBridgePath;
  const bridgeArgs = useAthenaBridge ? [config.athenaBridgePath] : [];
  const bridgeLabel = useAthenaBridge ? "Athena BLE bridge" : "Swift bridge";
  console.log(
    `🚀 Launching ${bridgeLabel}: ${useAthenaBridge ? config.athenaBridgePath : config.swiftBridgePath}`,
  );

  swiftProcess = spawn(bridgeCommand, bridgeArgs, {
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
  });

  if (useAthenaBridge) {
    settings.inputFormat = "microvolts";
    console.log(
      "📊 Athena BLE bridge: Python decoder emits μV — settings.inputFormat=microvolts",
    );
  } else {
    console.log("📊 Swift bridge: EEG scaling uses inputFormat=auto unless you change it in settings.");
  }

  let buffer = "";

  swiftProcess.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    lines.forEach((line) => {
      if (line.trim().length === 0) return;

      try {
        const packet = JSON.parse(line);

        // Log first of each packet type
        if (!global._packetTypes) global._packetTypes = {};
        if (!global._packetTypes[packet.type]) {
          console.log(`📨 FIRST PACKET TYPE: "${packet.type}"`);
          global._packetTypes[packet.type] = true;
        }

        if (packet.type === "eeg") {
          handleEEGPacket(packet);
        } else if (packet.type === "bandPowers") {
          handleBandPowersPacket(packet);
        } else if (packet.type === "device_list") {
          handleDeviceList(packet);
        } else if (packet.type === "status") {
          handleStatus(packet);
        } else if (packet.type === "accelerometer") {
          handleAccelerometerPacket(packet);
        } else if (packet.type === "gyroscope") {
          handleGyroscopePacket(packet);
        } else if (packet.type === "ppg") {
          handlePPGPacket(packet);
        } else if (packet.type === "fnirs") {
          handleFNIRSPacket(packet);
        } else if (packet.type === "battery") {
          handleBatteryPacket(packet);
        } else if (packet.type === "error") {
          const msg = packet.message || JSON.stringify(packet);
          console.error(`❌ ${bridgeLabel}:`, msg);
          handleStatus({
            type: "status",
            message: `⚠️ ${bridgeLabel}: ${msg}`,
          });
        }
      } catch (e) {
        console.log("[SWIFT]", line);
      }
    });
  });

  swiftProcess.stderr.on("data", (data) => {
    console.error(useAthenaBridge ? "[ATHENA ERROR]" : "[SWIFT ERROR]", data.toString().trim());
  });

  swiftProcess.on("close", (code) => {
    console.log(`⚠️  ${bridgeLabel} exited with code ${code}`);
    if (!suppressBridgeAutoRestart) {
      setTimeout(() => launchSwiftBridge(), 2000);
    }
  });

  swiftProcess.on("error", (err) => {
    console.error(`❌ Failed to launch ${bridgeLabel}:`, err.message);
  });
}

// ============================================================================
// EEG Processing
// ============================================================================

function broadcastEEGData(eeg, processed, packet = {}) {
  // Buffer for visualization
  eeg.forEach((value, ch) => {
    eegBuffer[ch].push(value);
    if (eegBuffer[ch].length > config.maxBufferSize) {
      eegBuffer[ch].shift();
    }
  });

  // Record data if enabled
  if (settings.recordingEnabled) {
    recordedData.push({
      timestamp: packet.timestamp || Date.now(),
      raw: eeg,
      processed: processed.processed,
      stats: processed.stats,
    });
  }

  if (sessionDisk.isActive()) {
    try {
      sessionDisk.appendEeg(
        packet.timestamp || Date.now(),
        processed.processed,
        0,
      );
    } catch (e) {
      console.error("session_disk EEG:", e.message);
    }
  }

  // Send OSC to Csound IMMEDIATELY at 256 Hz (not throttled) if enabled
  if (settings.oscStreams.rawEEG) {
    sendOSCtoCSsound(processed.processed);
  }

  // Throttle WebSocket broadcasts to 10 Hz (100ms interval)
  const now = Date.now();
  if (now - lastWSBroadcastTime < WS_BROADCAST_INTERVAL_MS) {
    return; // Skip this broadcast, not enough time has passed
  }
  lastWSBroadcastTime = now;

  // Broadcast to WebSocket clients (10 Hz rate)
  const payload = {
    type: "eeg",
    timestamp: packet.timestamp || Date.now(),
    raw: eeg,
    processed: processed.processed,
    stats: processed.stats,
    fft: processed.fft,
    // Prefer list displayName (e.g. "Muse-33C1 (Muse 2)") over bare BLE name or LibMuse packet label.
    deviceName:
      currentDevice?.displayName ||
      currentDevice?.name ||
      packet.deviceName ||
      (settings.simulatorMode ? "SIMULATOR" : "Unknown"),
    packetCount,
  };

  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(payload));
        sent++;
      } catch (e) {
        console.error("Send error:", e.message);
      }
    }
  });
}

function handleEEGPacket(packet) {
  // CRITICAL: Only process REAL EEG data from Muse hardware
  // Simulator has its own interval (see /api/use_simulator endpoint)

  // SAFETY CHECK: Ignore real packets when simulator is active to prevent data mixing
  if (settings.simulatorMode) {
    console.log("⚠️  Ignoring real EEG packet - simulator mode is active");
    return;
  }

  let eeg = packet.eeg;

  verboseLog(
    `📥 handleEEGPacket called: REAL MODE, hasEEG=${!!eeg}, packetCount=${packetCount}`,
  );

  if (!eeg) {
    console.log("⚠️  No EEG data in packet:", packet);
    return;
  }

  // ========================================================================
  // VOLTAGE SCALING: Convert input to microvolts based on device model
  // ========================================================================
  // Mind Monitor sends already-scaled μV, Muse SDK sends normalized,
  // OpenBCI sends raw counts. Auto-detect and scale appropriately.
  if (settings.deviceModel && settings.inputFormat !== "microvolts") {
    const originalSample = Array.isArray(eeg[0]) ? eeg[0][0] : eeg[0];

    // Apply per-channel scaling
    eeg = eeg.map((channelSample, idx) => {
      // If single value (not array), treat as single sample
      if (!Array.isArray(channelSample)) {
        return scaleToMicrovolts(
          [channelSample],
          settings.deviceModel,
          settings.inputFormat,
        )[0];
      }
      // If array of samples, scale the whole buffer
      return scaleToMicrovolts(
        channelSample,
        settings.deviceModel,
        settings.inputFormat,
      );
    });

    const scaledSample = Array.isArray(eeg[0]) ? eeg[0][0] : eeg[0];

    // Log scaling details every 100 packets
    if (packetCount % 100 === 0) {
      verboseLog(
        `📊 Voltage Scaling [${getDeviceInfoString(settings.deviceModel)}]`,
      );
      verboseLog(`   Input format: ${settings.inputFormat}`);
      verboseLog(`   Sample before: ${originalSample.toFixed(4)}`);
      verboseLog(`   Sample after:  ${scaledSample.toFixed(4)} μV`);
    }
  }

  packetCount++;

  // Process through DSP pipeline
  const processed = dsp.process(eeg);

  // Broadcast data
  broadcastEEGData(eeg, processed, packet);

  // ========================================================================
  // FOR REAL MUSE: Calculate & broadcast band powers @ 10 Hz
  // (MuseBridge only sends EEG, not band powers, so we calculate them here)
  // ========================================================================
  if (!settings.simulatorMode) {
    bandPowerCount++;
    if (bandPowerCount >= 26) {
      // At 256 Hz EEG, 26 packets = ~10 Hz band power output
      verboseLog(`🔬 Computing band powers from EEG (packet ${packetCount})`);
      const bandPowers = calculateBandPowersFromEEG();
      verboseLog(
        `🔬 Result:`,
        bandPowers ? "SUCCESS" : "NULL (DSP buffer not ready)",
      );
      if (bandPowers) {
        // Store for later use
        currentBandPowers.absolute = bandPowers.absolute;
        currentBandPowers.relative = bandPowers.relative;

        // Broadcast to WebSocket for dashboard
        broadcastBandPowers(bandPowers.absolute, bandPowers.relative);

        // Send via OSC if enabled
        if (
          settings.oscStreams.bandAbsolute ||
          settings.oscStreams.bandRelative
        ) {
          sendBandPowersOSC(bandPowers.absolute, bandPowers.relative);
        }
      }
      bandPowerCount = 0;
    }
  }
}

function handleBandPowersPacket(packet) {
  // SAFETY CHECK: Ignore real packets when simulator is active
  if (settings.simulatorMode) {
    console.log(
      "⚠️  Ignoring real band powers packet - simulator mode is active",
    );
    return;
  }

  // Store band powers (10 Hz rate from Muse)
  if (!packet.absolute || !packet.relative) {
    console.log("⚠️  bandPowers packet missing data:", packet);
    return;
  }

  verboseLog(
    `📊 Muse bandPowers received: α=${packet.relative.alpha?.toFixed(3)}`,
  );
  packetCount++;

  // Store current band powers
  currentBandPowers.absolute = packet.absolute;
  currentBandPowers.relative = packet.relative;

  // Buffer for visualization
  Object.keys(packet.absolute).forEach((band) => {
    bandPowersBuffer.absolute[band].push(packet.absolute[band]);
    bandPowersBuffer.relative[band].push(packet.relative[band]);

    if (bandPowersBuffer.absolute[band].length > config.maxBufferSize) {
      bandPowersBuffer.absolute[band].shift();
      bandPowersBuffer.relative[band].shift();
    }
  });

  // Send via OSC if enabled
  if (settings.oscStreams.bandAbsolute || settings.oscStreams.bandRelative) {
    sendBandPowersOSC(packet.absolute, packet.relative);
  }

  // Broadcast to WebSocket (throttled to 10 Hz)
  broadcastBandPowers(packet.absolute, packet.relative);
}

/** Muse 2 often advertises as `Muse-33C1`-style BLE names; LibMuse may still report Athena/S enum — prefer the name. */
function isMuseTwoBleSerialName(name) {
  const t = (name || "").trim();
  if (!/^muse[-_]/i.test(t)) return false;
  const lower = t.toLowerCase();
  if (lower.includes("athena")) return false;
  if (
    lower.includes("muse 3") ||
    /\bmuse3\b/i.test(lower) ||
    /\bmuse[-_\s]?3\b/i.test(lower)
  )
    return false;
  if (/\bmuse\s*s\b/i.test(lower) || lower.includes("muse-s") || lower.includes("muse_s")) return false;
  if (/\bmuse\s*2\b/i.test(lower) || lower.includes("muse2") || lower.includes("muse-2")) return true;
  return /^muse[-_][a-z0-9]{3,}$/i.test(t);
}

function handleDeviceList(packet) {
  // Detect device models and add specs
  console.log(
    `[handleDeviceList] Received packet.devices:`,
    JSON.stringify(packet.devices, null, 2),
  );

  connectedDevices = (packet.devices || []).map((device) => {
    console.log(
      `[handleDeviceList] Processing device:`,
      JSON.stringify(device, null, 2),
    );
    let modelKey = DEVICE_MODELS.MUSE_2; // default
    let modelCode = device.model;
    const nameBlob = `${device.name || ""} ${device.model || ""}`.toLowerCase();

    // OpenBCI boards (string/name from bridge or serial discovery)
    if (nameBlob.includes("ganglion")) {
      modelKey = "OpenBCI Ganglion";
    } else if (
      nameBlob.includes("ultracortex") ||
      (nameBlob.includes("ultra") && nameBlob.includes("cortex"))
    ) {
      modelKey = "OpenBCI Ultra Cortex";
    } else if (nameBlob.includes("daisy") || /\bcyton\b.*\b16\b/.test(nameBlob)) {
      modelKey = "OpenBCI Ultra Cortex";
    } else if (nameBlob.includes("cyton")) {
      modelKey = "OpenBCI Cyton";
    }

    const openBciModelKeys = new Set([
      "OpenBCI Ganglion",
      "OpenBCI Cyton",
      "OpenBCI Ultra Cortex",
    ]);

    let serialMuse2Lock = false;
    if (
      !openBciModelKeys.has(modelKey) &&
      isMuseTwoBleSerialName(device.name || "")
    ) {
      modelKey = DEVICE_MODELS.MUSE_2;
      serialMuse2Lock = true;
    }

    // If model is a number, look up the LibMuse model code (do not clobber OpenBCI or serial Muse 2)
    if (
      !openBciModelKeys.has(modelKey) &&
      !serialMuse2Lock &&
      typeof device.model === "number"
    ) {
      const modelName = MODEL_CODES[device.model];
      if (modelName) {
        if (modelName.includes("Athena")) {
          modelKey = DEVICE_MODELS.MUSE_S_ATHENA;
        } else if (/muse\s*3/i.test(modelName)) {
          modelKey = DEVICE_MODELS.MUSE_3;
        } else if (modelName.includes("Muse S")) {
          modelKey = DEVICE_MODELS.MUSE_S;
        } else if (modelName.includes("Muse 2")) {
          modelKey = DEVICE_MODELS.MUSE_2;
        }
        modelCode = modelName;
      }
    } else if (device.model && typeof device.model === "string") {
      const dm = device.model;
      if (
        !openBciModelKeys.has(modelKey) &&
        !serialMuse2Lock &&
        !nameBlob.includes("ganglion") &&
        !nameBlob.includes("cyton") &&
        !nameBlob.includes("cortex")
      ) {
        if (dm.includes("Athena")) {
          modelKey = DEVICE_MODELS.MUSE_S_ATHENA;
        } else if (/muse\s*3|muse3/i.test(dm)) {
          modelKey = DEVICE_MODELS.MUSE_3;
        } else if (dm.includes("Muse S")) {
          modelKey = DEVICE_MODELS.MUSE_S;
        } else if (dm.includes("Muse 2")) {
          modelKey = DEVICE_MODELS.MUSE_2;
        }
      }
    }

    const specs =
      DEVICE_SPECS[modelKey] || DEVICE_SPECS[DEVICE_MODELS.MUSE_2];

    // Normalize device_type to match UI DEVS keys (lowercase with underscores)
    let deviceType = modelKey.toLowerCase().replace(/ /g, "_");

    return {
      ...device,
      modelCode,
      modelKey,
      device_type: deviceType, // e.g., "muse_2", "muse_s"
      specs,
      displayName: `${device.name} (${specs.name})`,
    };
  });

  console.log(`📱 Devices found: ${connectedDevices.length}`);
  connectedDevices.forEach((dev) => {
    console.log(
      `   ├─ ${dev.displayName} - EEG: ${dev.specs.eegChannels}ch @ ${dev.specs.eegSampleRate}Hz`,
    );
    if (dev.specs.hasPPG)
      console.log(`   │  ├─ PPG @ ${dev.specs.ppgSampleRate}Hz`);
    if (dev.specs.hasMotion)
      console.log(`   │  ├─ Motion @ ${dev.specs.motionSampleRate}Hz`);
    if (dev.specs.hasfNIRS)
      console.log(`   │  └─ fNIRS @ ${dev.specs.fnirsSampleRate}Hz`);
  });

  // Update DSP pipeline for detected device
  if (connectedDevices.length > 0) {
    currentDevice = connectedDevices[0];
    dsp.updateConfig({ numChannels: currentDevice.specs.eegChannels });
  }

  console.log(
    `[handleDeviceList] Sending to clients:`,
    JSON.stringify(connectedDevices, null, 2),
  );

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "device_list",
          devices: connectedDevices,
        }),
      );
    }
  });
}

function handleStatus(packet) {
  console.log(`[STATUS] ${packet.message}`);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(packet));
    }
  });
}

function handleAccelerometerPacket(packet) {
  // SAFETY CHECK: Ignore real packets when simulator is active
  if (settings.simulatorMode) {
    console.log(
      "⚠️  Ignoring real accelerometer packet - simulator mode is active",
    );
    return;
  }

  const values = Array.isArray(packet.accel)
    ? packet.accel
    : [packet.x, packet.y, packet.z];
  if (values.length < 3 || values.some((value) => !Number.isFinite(Number(value)))) {
    console.log("⚠️  accelerometer packet missing data:", packet);
    return;
  }
  const accel = values.slice(0, 3).map((value) => Number(value));
  verboseLog(`📲 Accel: x=${accel[0]}, y=${accel[1]}, z=${accel[2]}`);
  packetCount++;
  broadcastMotionData("accel", accel);
}

function handleGyroscopePacket(packet) {
  // SAFETY CHECK: Ignore real packets when simulator is active
  if (settings.simulatorMode) {
    console.log(
      "⚠️  Ignoring real gyroscope packet - simulator mode is active",
    );
    return;
  }

  const values = Array.isArray(packet.gyro)
    ? packet.gyro
    : [packet.x, packet.y, packet.z];
  if (values.length < 3 || values.some((value) => !Number.isFinite(Number(value)))) {
    console.log("⚠️  gyroscope packet missing data:", packet);
    return;
  }
  const gyro = values.slice(0, 3).map((value) => Number(value));
  verboseLog(`📲 Gyro: x=${gyro[0]}, y=${gyro[1]}, z=${gyro[2]}`);
  packetCount++;
  broadcastMotionData("gyro", gyro);
}

// Heart rate detection state
let lastHeartbeatTime = 0;
let currentBPM = 72;

function handlePPGPacket(packet) {
  // SAFETY CHECK: Ignore real packets when simulator is active
  if (settings.simulatorMode) {
    console.log("⚠️  Ignoring real PPG packet - simulator mode is active");
    return;
  }

  if (!packet.ppg || packet.ppg.length !== 3) return;

  packetCount++;

  // Send via OSC if enabled
  if (settings.oscStreams.motionPPG) {
    sendMotionOSC("/muse/ppg", packet.ppg);
  }

  // Broadcast to WebSocket
  broadcastMotionData("ppg", packet.ppg);
}

// Send heart rate as OSC gate/trigger for musical control
function sendHeartRateOSC(bpm, beatTrigger) {
  if (!oscPort || !settings.oscSending) return;

  try {
    // Send BPM as continuous value
    oscPort.send({
      address: `${settings.oscPrefix}/hr/bpm`,
      args: [{ type: "f", value: bpm }],
    });

    // Send beat trigger (1.0 on beat, 0.0 otherwise)
    if (beatTrigger) {
      oscPort.send({
        address: `${settings.oscPrefix}/hr/beat`,
        args: [{ type: "f", value: beatTrigger }],
      });
    }
  } catch (e) {
    console.error(`❌ HR OSC error:`, e.message);
  }
}

function handleBatteryPacket(packet) {
  // Note: Battery packets are allowed even in simulator mode (informational only)
  if (packet.percentage !== undefined) {
    packetCount++;

    // Broadcast battery level to WebSocket
    broadcastBatteryLevel(packet.percentage);
  }
}

function handleFNIRSPacket(packet) {
  // SAFETY CHECK: Ignore real packets when simulator is active
  if (settings.simulatorMode) {
    console.log("⚠️  Ignoring real fNIRS packet - simulator mode is active");
    return;
  }

  // fNIRS: Functional Near-Infrared Spectroscopy (Muse S Athena only)
  // Data format: [HbO, HbR, HbT] - oxygenated, deoxygenated, total hemoglobin
  if (!packet.fnirs || packet.fnirs.length < 2) return;

  packetCount++;

  // Send via OSC if enabled - individual messages per channel for musical control
  if (settings.oscStreams?.motionFNIRS) {
    const [HbO, HbR, HbT] = packet.fnirs;
    if (HbO !== undefined)
      sendOSC({
        address: "/muse/fnirs/hbo",
        args: [{ type: "f", value: HbO }],
      });
    if (HbR !== undefined)
      sendOSC({
        address: "/muse/fnirs/hbr",
        args: [{ type: "f", value: HbR }],
      });
    if (HbT !== undefined)
      sendOSC({
        address: "/muse/fnirs/hbt",
        args: [{ type: "f", value: HbT }],
      });
  }

  // Broadcast to WebSocket/dashboard
  broadcastMotionData("fnirs", packet.fnirs);
}

// ============================================================================
// OSC Output
// ============================================================================

function sendOSCtoCSsound(eeg) {
  if (!oscPort) return;

  // CRITICAL: Check if user enabled OSC sending
  if (!settings.oscSending) return;

  try {
    // Apply post-OSC scaling
    let scaledEeg = eeg;
    if (settings.oscScaleMode === "normalize") {
      scaledEeg = eeg.map((v) => v * settings.oscOutputScaler);
    }
    // "raw" and "none" modes skip scaling

    // Apply positive-only clipping if needed
    if (!settings.oscAllowNegative) {
      scaledEeg = scaledEeg.map((v) => Math.max(0, v));
    }

    // Main address with 4 channels
    oscPort.send({
      address: `${settings.oscPrefix}/eeg`,
      args: [
        { type: "f", value: scaledEeg[0] },
        { type: "f", value: scaledEeg[1] },
        { type: "f", value: scaledEeg[2] },
        { type: "f", value: scaledEeg[3] },
      ],
    });

    // Per-channel addresses
    const channels = ["eeg1", "eeg2", "eeg3", "eeg4"];
    channels.forEach((ch, i) => {
      oscPort.send({
        address: `${settings.oscPrefix}/${ch}`,
        args: [{ type: "f", value: scaledEeg[i] }],
      });
    });

    if (packetCount % 256 === 0) {
      console.log(`🎵 OSC: ${packetCount} packets sent to Csound`);
    }
  } catch (e) {
    console.error("OSC error:", e.message);
  }
}

let oscBandPowerCount = 0;
function sendBandPowersOSC(absolute, relative) {
  if (!oscPort) return;

  // CRITICAL: Check if user enabled OSC sending
  if (!settings.oscSending) return;

  try {
    const bands = ["delta", "theta", "alpha", "beta", "gamma"];
    oscBandPowerCount++;

    // Send absolute band powers (log scale)
    if (settings.oscStreams.bandAbsolute) {
      oscPort.send({
        address: `${settings.oscPrefix}/bands/absolute`,
        args: bands.map((band) => ({
          type: "f",
          value: absolute[band] || 0,
        })),
      });

      // Per-band addresses
      bands.forEach((band) => {
        // Format 1: /muse/bands/absolute/alpha
        oscPort.send({
          address: `${settings.oscPrefix}/bands/absolute/${band}`,
          args: [{ type: "f", value: absolute[band] || 0 }],
        });

        // Format 2: /muse/elements/{band}_absolute (alternative format)
        oscPort.send({
          address: `${settings.oscPrefix}/elements/${band}_absolute`,
          args: [{ type: "f", value: absolute[band] || 0 }],
        });
      });
    }

    // Send relative band powers (0-1 normalized) ← Csound uses this
    if (settings.oscStreams.bandRelative) {
      oscPort.send({
        address: `${settings.oscPrefix}/bands/relative`,
        args: bands.map((band) => ({
          type: "f",
          value: relative[band] || 0,
        })),
      });

      // Per-band addresses (CSOUND PRIMARY, also works with Max/MSP, TouchDesigner, Unity)
      bands.forEach((band) => {
        // Format 1: /muse/bands/relative/alpha
        oscPort.send({
          address: `${settings.oscPrefix}/bands/relative/${band}`,
          args: [{ type: "f", value: relative[band] || 0 }],
        });

        // Format 2: /muse/elements/{band}_relative (alternative format)
        oscPort.send({
          address: `${settings.oscPrefix}/elements/${band}_relative`,
          args: [{ type: "f", value: relative[band] || 0 }],
        });
      });

      // Log every Nth message to avoid spam
      if (oscBandPowerCount % 10 === 0) {
        verboseLog(
          `📡 OSC: Sent ${oscBandPowerCount} band power messages → ${config.oscHost}:${config.oscPort}`,
          `(α=${relative.alpha?.toFixed(3)} β=${relative.beta?.toFixed(3)} θ=${relative.theta?.toFixed(3)})`,
        );
      }
    }
  } catch (e) {
    console.error("❌ Band Powers OSC error:", e.message);
  }
}

let oscMotionCount = 0;
function sendMotionOSC(address, values) {
  if (!oscPort || !values || values.length === 0) return;

  try {
    oscMotionCount++;
    oscPort.send({
      address: address,
      args: values.map((val) => ({
        type: "f",
        value: val,
      })),
    });

    if (oscMotionCount % 5 === 0) {
      verboseLog(`📡 OSC: Motion message #${oscMotionCount} → ${address}`);
    }
  } catch (e) {
    console.error(`❌ Motion OSC error (${address}):`, e.message);
  }
}

let lastBandPowersBroadcast = 0;
function broadcastBandPowers(absolute, relative) {
  const now = Date.now();

  // Server normalization: optional log + rolling z-score on relative bands
  // Apply Log₁₀ → Z-Score normalization to RELATIVE band powers
  // This modifies the data for OSC/WebSocket output while collecting rolling baseline
  const channels = ["CH1", "CH2", "CH3", "CH4"];
  const bands = ["delta", "theta", "alpha", "beta", "gamma"];

  // For Muse: we get global bands, not per-channel
  // Treat as single "channel" for now (TODO: support per-channel when available)
  const normalizedRelative = { ...relative };

  if (baselineSystem.logTransform || baselineSystem.baselineNormalize) {
    bands.forEach((band) => {
      if (relative[band] !== undefined) {
        // Use CH1 as representative channel for Muse (which sends global bands)
        normalizedRelative[band] = normalizeBandPower(
          "CH1",
          band,
          relative[band],
        );
      }
    });

    // Count samples during calibration
    if (calibrationState.isCalibrating) {
      calibrationState.samplesCollected++;
    }
  }

  // Update current band powers for /api/bands endpoint (used by React UI polling)
  currentBandPowers.absolute = absolute;
  currentBandPowers.relative = normalizedRelative;
  currentBandPowersUpdatedAt = now;

  if (sessionDisk.isActive()) {
    try {
      sessionDisk.appendBands(now, absolute, normalizedRelative);
    } catch (e) {
      console.error("session_disk bands:", e.message);
    }
  }

  // CRITICAL SAFETY: Only send OSC if there's an active data source!
  // This prevents sending stale/cached data when neither simulator nor hardware is active
  // PRIMARY TARGET: Csound (also Max/MSP, TouchDesigner, Unity)
  // Needs low-latency band power updates at native 10 Hz rate
  const hasActiveSource = settings.simulatorMode || packetCount > 0;
  if (hasActiveSource) {
    sendBandPowersOSC(absolute, normalizedRelative);
  }

  // Throttle WebSocket to avoid overwhelming browser clients (10 Hz = 100ms)
  if (now - lastBandPowersBroadcast < WS_BROADCAST_INTERVAL_MS) {
    return;
  }
  lastBandPowersBroadcast = now;

  // Send to WebSocket clients (React UI) - throttled
  // Note: sending normalized values (if enabled)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "bandPowers",
          absolute,
          relative: normalizedRelative,
          timestamp: now,
        }),
      );
    }
  });
}

let lastMotionBroadcast = { accel: 0, gyro: 0, ppg: 0 };
function broadcastMotionData(sensorType, values) {
  sessionDisk.setLastMotion(sensorType, values);
  const now = Date.now();

  // Throttle per sensor type to WS rate (10 Hz = 100ms)
  if (now - lastMotionBroadcast[sensorType] < WS_BROADCAST_INTERVAL_MS) {
    return;
  }
  lastMotionBroadcast[sensorType] = now;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "motionData",
          sensor: sensorType,
          values: values,
        }),
      );
    }
  });
}

function broadcastBatteryLevel(percentage) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "battery",
          percentage: percentage,
        }),
      );
    }
  });
}

// ============================================================================
// WebSocket Handler
// ============================================================================

wss.on("connection", (ws) => {
  console.log("🔗 WebSocket client connected");

  ws.send(
    JSON.stringify({
      type: "init",
      config: {
        oscHost: config.oscHost,
        oscPort: config.oscPort,
      },
      settings,
      devices: connectedDevices,
      eegBuffer,
    }),
  );

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      handleWebSocketMessage(msg, ws);
    } catch (e) {
      console.error("WebSocket message error:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

// --------------------------------------------------------------------------
// OSC relay over WebSocket
//
// Lets the browser-side simulator (or any client-side tool) push OSC messages
// out to UDP port 7400 without opening its own socket (browsers can't do UDP).
//
// Wire format from client:
//   { "type": "osc_send", "msgs": [{ "address": "/foo", "args": [1.0, 2.0] }, ...] }
//   { "type": "osc_send", "address": "/foo", "args": [...] }  // single msg form
//
// Each arg is converted to OSC "f" (float32). Intentionally simple — extend if
// you need ints/strings later.
// --------------------------------------------------------------------------
let oscRelayCount = 0;
function handleOscRelay(msg) {
  if (!oscPort) return { status: "error", reason: "osc_not_initialised" };

  const toSendList = Array.isArray(msg.msgs)
    ? msg.msgs
    : msg.address !== undefined
      ? [{ address: msg.address, args: msg.args }]
      : [];

  let sent = 0;
  for (const m of toSendList) {
    if (!m || typeof m.address !== "string") continue;
    try {
      oscPort.send({
        address: m.address,
        args: (m.args || []).map((v) => ({
          type: "f",
          value: Number.isFinite(v) ? Number(v) : 0,
        })),
      });
      sent++;
    } catch (e) {
      // swallow — don't let one bad packet kill the handler
    }
  }
  oscRelayCount += sent;
  if (oscRelayCount > 0 && oscRelayCount % 500 === 0) {
    console.log(
      `📡 OSC relay: ${oscRelayCount} messages forwarded → ${config.oscHost}:${config.oscPort}`,
    );
  }
  return { status: "ok", sent };
}

function handleWebSocketMessage(msg, ws) {
  switch (msg.type) {
    case "osc_send":
      handleOscRelay(msg);
      break;
    case "select_device":
      // Frontend sends device NAME, we need to find the index
      const deviceIndex = connectedDevices.findIndex(
        (dev) => dev.name === msg.name,
      );
      if (deviceIndex >= 0) {
        console.log(`✓ Found device at index ${deviceIndex}`);
        const currentDeviceToSelect = connectedDevices[deviceIndex];
        currentDevice = currentDeviceToSelect;
        settings.deviceModel = currentDeviceToSelect.modelKey;
        settings.yAxisRange = getDeviceYRange(settings.deviceModel);
        dsp.updateConfig({ numChannels: currentDeviceToSelect.specs.eegChannels });
        console.log(`🔗 Connecting to ${currentDeviceToSelect.displayName}`);

        // Auto-set OSC prefix based on device type
        if (currentDeviceToSelect.specs?.name?.includes("Muse")) {
          settings.oscPrefix = "/muse";
        } else if (currentDeviceToSelect.specs?.name?.includes("Ganglion")) {
          settings.oscPrefix = "/ganglion";
        } else if (
          /ultra.*cortex|ultracortex|openbci\s*cyton/i.test(
            currentDeviceToSelect.specs?.name || "",
          )
        ) {
          settings.oscPrefix = "/openbci";
        }
        console.log(`📡 OSC prefix set to: ${settings.oscPrefix}`);
        console.log(
          `   ├─ EEG Channels: ${currentDeviceToSelect.specs.eegChannels} @ ${currentDeviceToSelect.specs.eegSampleRate}Hz`,
        );
        if (currentDeviceToSelect.specs.hasPPG) {
          console.log(
            `   ├─ PPG @ ${currentDeviceToSelect.specs.ppgSampleRate}Hz`,
          );
        }
        if (currentDeviceToSelect.specs.hasMotion) {
          console.log(
            `   ├─ Motion @ ${currentDeviceToSelect.specs.motionSampleRate}Hz`,
          );
        }
        if (currentDeviceToSelect.specs.hasfNIRS) {
          console.log(
            `   └─ fNIRS @ ${currentDeviceToSelect.specs.fnirsSampleRate}Hz`,
          );
        }

        if (swiftProcess && swiftProcess.stdin) {
          swiftProcess.stdin.write(
            JSON.stringify({
              command: "connect",
              deviceIndex: deviceIndex,
            }) + "\n",
          );
          console.log(`📡 Sent connect command to MuseBridge`);
        }
      } else {
        console.error(`❌ Device not found: ${msg.name}`);
      }
      break;

    case "connect_device":
      console.log(`🔗 CONNECT REQUEST: deviceIndex=${msg.deviceIndex}`);
      const deviceToConnect = connectedDevices[msg.deviceIndex];
      if (deviceToConnect) {
        currentDevice = deviceToConnect;
        settings.deviceModel = deviceToConnect.modelKey;
        settings.yAxisRange = getDeviceYRange(settings.deviceModel);
        dsp.updateConfig({ numChannels: deviceToConnect.specs.eegChannels });
        console.log(`   Device: ${deviceToConnect.displayName}`);
      }
      if (swiftProcess && swiftProcess.stdin) {
        console.log(`   → Sending to MuseBridge...`);
        swiftProcess.stdin.write(
          JSON.stringify({
            command: "connect",
            deviceIndex: msg.deviceIndex,
          }) + "\n",
        );
      } else {
        console.log(`   ❌ MuseBridge not available`);
      }
      break;

    case "disconnect_device":
      if (swiftProcess && swiftProcess.stdin) {
        swiftProcess.stdin.write(
          JSON.stringify({
            command: "disconnect",
          }) + "\n",
        );
      }
      break;

    case "update_settings":
      updateSettings(msg.settings);
      broadcastSettings();
      break;

    case "toggle_simulator":
      settings.simulatorMode = !settings.simulatorMode;
      console.log(
        `🎲 Simulator mode: ${settings.simulatorMode ? "ON" : "OFF"}`,
      );

      if (settings.simulatorMode) {
        // Start simulator loop
        let simCount = 0;
        let bandPowerCount = 0;
        let motionCount = 0;
        simulatorInterval = setInterval(() => {
          const eeg = generateSimulatorData();
          if (eeg) {
            packetCount++;
            simCount++;
            const processed = dsp.process(eeg);
            broadcastEEGData(eeg, processed);
            if (simCount === 1)
              console.log(
                `📊 Simulator streaming: ${packetCount} total packets`,
              );
          }

          // Broadcast band powers at 10 Hz (every 25.6 samples @ 256 Hz)
          bandPowerCount++;
          if (bandPowerCount >= 26) {
            const bandPowers = generateSimulatorBandPowers();
            if (bandPowers) {
              if (simCount === 26)
                console.log(
                  `📊 Broadcasting band powers (alpha: ${bandPowers.relative.alpha.toFixed(3)})`,
                );
              broadcastBandPowers(bandPowers.absolute, bandPowers.relative);
            }
            bandPowerCount = 0;
          }

          // Broadcast motion data at 10 Hz
          motionCount++;
          if (motionCount >= 26) {
            const accel = generateSimulatorMotion("accel");
            const gyro = generateSimulatorMotion("gyro");
            const ppg = generateSimulatorMotion("ppg");

            verboseLog(
              `💨 Sending motion to ${wss.clients.size} clients: accel=[${accel}], gyro=[${gyro}], ppg=[${ppg}]`,
            );
            if (accel) broadcastMotionData("accel", accel);
            if (gyro) broadcastMotionData("gyro", gyro);
            if (ppg) {
              broadcastMotionData("ppg", ppg);
              const time = Date.now() / 1000;
              const BPM = 72;
              const beatPeriod = 60 / BPM;
              const beatPhase = (time % beatPeriod) / beatPeriod;
              const beatTrigger =
                beatPhase > 0.24 && beatPhase < 0.26 ? 1.0 : 0.0;
              sendHeartRateOSC(BPM, beatTrigger);
            }

            motionCount = 0;
          }
        }, 1000 / 256); // 256 Hz (Muse sample rate)
      } else {
        // Stop simulator loop
        if (simulatorInterval) {
          clearInterval(simulatorInterval);
          simulatorInterval = null;
        }
      }
      broadcastSettings();
      break;

    case "update_settings":
      if (msg.oscOutputScaler !== undefined) {
        settings.oscOutputScaler = msg.oscOutputScaler;
        console.log(`📊 OSC Output Scaler: ${msg.oscOutputScaler}`);
      }
      if (msg.oscScaleMode !== undefined) {
        settings.oscScaleMode = msg.oscScaleMode;
        console.log(`📊 OSC Scale Mode: ${msg.oscScaleMode}`);
      }
      if (msg.oscAllowNegative !== undefined) {
        settings.oscAllowNegative = msg.oscAllowNegative;
        console.log(
          `📊 OSC Allow Negative: ${msg.oscAllowNegative ? "YES (-1 to +1)" : "NO (0 to +1 only)"}`,
        );
      }
      broadcastSettings();
      break;

    case "start_recording":
      settings.recordingEnabled = true;
      recordedData = [];
      console.log("📝 Recording started");
      break;

    case "stop_recording":
      settings.recordingEnabled = false;
      console.log(`📝 Recording stopped (${recordedData.length} samples)`);
      ws.send(
        JSON.stringify({
          type: "recording_complete",
          data: recordedData,
        }),
      );
      break;

    case "update_dsp_setting":
      if (msg.setting && msg.value !== undefined) {
        if (msg.setting === "all") {
          // Update multiple settings at once (from preset)
          Object.assign(settings, msg.value);
          dsp.updateConfig(msg.value);
          console.log(`⚙️  DSP preset applied:`, JSON.stringify(msg.value));
        } else {
          // Update individual setting
          settings[msg.setting] = msg.value;
          // Handle legacy 'scaling' key -> map to 'scalingMode'
          if (msg.setting === "scaling") {
            settings.scalingMode = msg.value;
          }
          // Handle legacy 'scalingMode' -> pass to DSP as well
          const dspUpdateObj = { [msg.setting]: msg.value };
          if (msg.setting === "scalingMode") {
            dspUpdateObj.scalingMode = msg.value;
          }
          dsp.updateConfig(dspUpdateObj);
          console.log(
            `⚙️  DSP setting updated: ${msg.setting} = ${msg.value} (scalingMode in settings: ${settings.scalingMode})`,
          );
        }
        // Broadcast updated settings to all clients
        broadcastSettings();
      }
      break;

    case "update_osc_stream":
      if (msg.stream && msg.enabled !== undefined) {
        settings.oscStreams[msg.stream] = msg.enabled;
        console.log(
          `📡 OSC Stream '${msg.stream}': ${msg.enabled ? "ENABLED" : "DISABLED"}`,
        );
        broadcastSettings();
      }
      break;

    case "osc_test":
      sendOSCtoCSsound([0.1, 0.2, 0.3, 0.4]);
      ws.send(JSON.stringify({ type: "osc_test", status: "sent" }));
      break;

    default:
      console.log("Unknown WebSocket message type:", msg.type);
  }
}

function updateSettings(newSettings) {
  Object.assign(settings, newSettings);
  if (newSettings.bandEdgePreset !== undefined) {
    settings.bandEdgePreset = normalizeBandEdgePreset(newSettings.bandEdgePreset);
  }

  // If device model changed, update Y-axis range automatically
  if (
    newSettings.deviceModel &&
    newSettings.deviceModel !== settings.deviceModel
  ) {
    settings.yAxisRange = getDeviceYRange(newSettings.deviceModel);
    console.log(
      `📊 Device changed to: ${getDeviceInfoString(newSettings.deviceModel)}`,
    );
    console.log(
      `📊 Y-axis range set to: ${settings.yAxisRange[0]} to ${settings.yAxisRange[1]} μV`,
    );
  }

  dsp.updateConfig(newSettings);
  console.log("⚙️  Settings updated:", newSettings);
}

function broadcastSettings() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "settings_updated",
          settings,
        }),
      );
    }
  });
}

// ============================================================================
// REST API Endpoints
// ============================================================================
// Legacy OpenBCI API endpoints (stubs for Muse support)
// ============================================================================

// For Muse hardware, we auto-detect via MuseBridge (WebSocket)
// These endpoints return empty data for backward compatibility

app.post("/api/connect", (req, res) => {
  // Legacy: Used to connect to OpenBCI/serial devices
  // For Muse: Use WebSocket "connect_device" command instead
  const { device_type, mac_address } = req.body;

  if (device_type === "ganglion") {
    res.json({
      status: "ganglion_not_supported",
      info: "Use WebSocket for Muse devices",
    });
  } else if (mac_address) {
    res.json({ status: "connected", device: mac_address });
  } else {
    res.json({ status: "ok", info: "Use WebSocket for device connection" });
  }
});

app.post("/api/start", (req, res) => {
  // Legacy: OpenBCI start streaming command
  // For Muse: MuseBridge auto-streams after device connects
  res.json({
    status: "streaming",
    info: "MuseBridge streams automatically after connection",
  });
});

app.post("/api/disconnect", (req, res) => {
  // Legacy: OpenBCI disconnect command
  // For Muse: Send WebSocket disconnect_device message
  if (swiftProcess && swiftProcess.stdin) {
    swiftProcess.stdin.write(
      JSON.stringify({
        command: "disconnect",
      }) + "\n",
    );
    res.json({ status: "disconnected" });
  } else {
    res.json({ status: "ok" });
  }
});

// ============================================================================

app.get("/api/status", (req, res) => {
  res.json({
    osc_connected: !!oscPort,
    swift_running: swiftProcess && !swiftProcess.killed,
    devices: connectedDevices,
    ws_clients: wss.clients.size,
    simulator_mode: settings.simulatorMode,
    streaming: packetCount > 0 || settings.simulatorMode, // TRUE if receiving data
    packet_count: packetCount,
    config,
  });
});

app.get("/api/bridge", (req, res) => {
  const athena = config.bridgeMode === "athena";
  res.json({
    bridgeMode: config.bridgeMode,
    label: athena ? "Python · Muse S Athena (direct BLE)" : "Swift · LibMuse (Muse 2 / 3 / S / …)",
    muse2Class: athena ? "Use Swift mode for Muse-33xx / Muse 2." : "Listed here.",
    athenaClass: athena ? "Muse S Athena (273e0013) only." : "Also works when LibMuse supports your firmware.",
  });
});

app.post("/api/bridge/mode", (req, res) => {
  const mode = req.body?.mode;
  if (mode !== "swift" && mode !== "athena") {
    return res
      .status(400)
      .json({ error: "body.mode must be 'swift' or 'athena'" });
  }
  try {
    const result = switchBleBridgeMode(mode);
    res.json({
      ok: true,
      bridgeMode: config.bridgeMode,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/ports", async (req, res) => {
  // Return detected serial ports (BLED dongles) + Bluetooth devices
  // Format: { ports: ["/dev/cu.usbmodem11", ...], bluetooth: [ { name, mac, device_type }, ... ] }
  console.log(
    `[/api/ports] Scanning for serial ports and Bluetooth devices...`,
  );

  const ports = [];
  const bluetoothDevices = [];

  // 1. Scan for serial ports (BLED112 dongles for Ganglion/Muse)
  try {
    const { execSync } = require("child_process");
    if (process.platform === "darwin") {
      // macOS: scan for USB serial devices
      const portPatterns = [
        "/dev/tty.usbmodem*",
        "/dev/tty.usbserial*",
        "/dev/cu.usbmodem*",
        "/dev/cu.usbserial*",
      ];

      for (const pattern of portPatterns) {
        try {
          const found = execSync(`ls ${pattern} 2>/dev/null || true`)
            .toString()
            .trim()
            .split("\n")
            .filter((p) => p);
          ports.push(...found);
        } catch (e) {
          // Pattern not found, skip
        }
      }
    } else if (process.platform === "linux") {
      // Linux: scan /dev/ttyUSB* and /dev/ttyACM*
      try {
        const found = execSync(
          `ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true`,
        )
          .toString()
          .trim()
          .split("\n")
          .filter((p) => p);
        ports.push(...found);
      } catch (e) {
        // No ports found
      }
    }
  } catch (err) {
    console.error(`⚠️  Port scan error: ${err.message}`);
  }

  // Remove duplicates and sort
  const uniquePorts = [...new Set(ports)].sort();
  console.log(
    `  ✓ Found ${uniquePorts.length} serial port(s): ${uniquePorts.join(", ") || "none"}`,
  );

  // 2. Scan for Bluetooth devices using system_profiler (macOS only)
  if (process.platform === "darwin") {
    try {
      const { execSync } = require("child_process");
      const output = execSync(
        "system_profiler SPBluetoothDataType 2>/dev/null",
        {
          timeout: 5000,
          encoding: "utf8",
        },
      );

      const lines = output.split("\n");
      const btKeywords = ["ganglion", "muse", "athena"];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLower = line.toLowerCase();

        // Check if this line mentions a brain device
        if (btKeywords.some((kw) => lineLower.includes(kw))) {
          // Extract device name from this line
          const nameMatch = line.match(/^\s*(.+?):\s*$/);
          const name = nameMatch
            ? nameMatch[1].trim()
            : line.trim().replace(":", "");

          // Look for MAC address in the next 10 lines
          let mac = "";
          for (let j = i; j < Math.min(lines.length, i + 10); j++) {
            if (lines[j].includes("Address:")) {
              mac = lines[j].split("Address:")[1].trim();
              break;
            }
          }

          if (mac) {
            // Infer device type from name
            let deviceType = "ganglion";
            if (
              lineLower.includes("athena") ||
              lineLower.includes("muse-s") ||
              lineLower.includes("muse s")
            ) {
              deviceType = "muse_athena";
            } else if (lineLower.includes("muse") && lineLower.includes("3")) {
              deviceType = "muse_3";
            } else if (lineLower.includes("muse")) {
              deviceType = "muse_2";
            }

            bluetoothDevices.push({
              name,
              mac,
              type: "bluetooth",
              device_type: deviceType,
            });

            console.log(
              `  ✓ Found Bluetooth: ${name} (${mac}) → ${deviceType}`,
            );
          }
        }
      }
    } catch (err) {
      console.error(`⚠️  Bluetooth scan error: ${err.message}`);
    }
  }

  // 3. Also include devices from MuseBridge (if running)
  connectedDevices.forEach((dev) => {
    // Use the device_type we already set in handleDeviceList
    const deviceType = dev.device_type || "muse_2";

    // Only add if not already in Bluetooth list
    if (!bluetoothDevices.find((bt) => bt.name === dev.name)) {
      bluetoothDevices.push({
        name: dev.name,
        mac: dev.mac || "",
        type: "bluetooth",
        device_type: deviceType,
      });
      console.log(`  ✓ From MuseBridge: ${dev.name} → ${deviceType}`);
    }
  });

  console.log(
    `[/api/ports] Returning ${uniquePorts.length} port(s) + ${bluetoothDevices.length} Bluetooth device(s)`,
  );

  res.json({
    ports: uniquePorts,
    bluetooth: bluetoothDevices,
    count: uniquePorts.length + bluetoothDevices.length,
  });
});

app.get("/api/devices", (req, res) => {
  res.json({ devices: connectedDevices });
});

app.get("/api/bands", (req, res) => {
  // Live band power polling endpoint for React UI
  // Returns current band powers for all 4 channels (TP9, AF7, AF8, TP10)
  const channels = ["TP9", "AF7", "AF8", "TP10"];
  const bands = ["delta", "theta", "alpha", "beta", "gamma"];
  const hasLiveBandPowers = currentBandPowersUpdatedAt > 0;

  // If we have real Muse data, return it
  if (hasLiveBandPowers && currentBandPowers.absolute && currentBandPowers.relative) {
    const values = channels.map((ch) =>
      bands.map((band) => currentBandPowers.absolute[band] || 0),
    );
    res.json({
      channels: channels,
      bands: bands,
      values: values,
      absolute: currentBandPowers.absolute,
      relative: currentBandPowers.relative,
      available: true,
      timestamp: currentBandPowersUpdatedAt,
    });
  } else {
    // No real data yet - return empty structure
    const values = channels.map(() => bands.map(() => 0));
    res.json({
      channels: channels,
      bands: bands,
      values: values,
      absolute: currentBandPowers.absolute,
      relative: currentBandPowers.relative,
      available: false,
      timestamp: null,
    });
  }
});

app.get("/api/timeseries", (req, res) => {
  // Timeseries endpoint for Traces view
  // Returns raw EEG samples from buffer
  const windowSec = parseFloat(req.query.window) || 4.0;
  const maxPoints = parseInt(req.query.maxPoints) || 512;
  const channels = ["TP9", "AF7", "AF8", "TP10"];

  // Calculate how many samples we need
  const sampleRate = 256; // Muse sample rate
  const numSamples = Math.floor(windowSec * sampleRate);

  // Get samples from eegBuffer
  const samples = [];
  const timestamps = [];

  for (let ch = 0; ch < 4; ch++) {
    const buffer = eegBuffer[ch] || [];
    const recentSamples = buffer.slice(-numSamples);

    // Downsample if too many points
    let downsampledSamples;
    if (recentSamples.length > maxPoints) {
      const step = Math.floor(recentSamples.length / maxPoints);
      downsampledSamples = [];
      for (let i = 0; i < recentSamples.length; i += step) {
        downsampledSamples.push(recentSamples[i]);
      }
    } else {
      downsampledSamples = recentSamples;
    }

    samples.push(downsampledSamples);

    // Generate timestamps for first channel only
    if (ch === 0 && downsampledSamples.length > 0) {
      const dt = 1.0 / sampleRate;
      for (let i = 0; i < downsampledSamples.length; i++) {
        timestamps.push(i * dt);
      }
    }
  }

  res.json({
    channels,
    timestamps,
    samples,
    sampleRate,
    windowSec,
  });
});

app.get("/api/fft", (req, res) => {
  // FFT spectrum endpoint
  // Returns frequency spectrum data
  const minFreq = parseFloat(req.query.minFreq) || 0.5;
  const maxFreq = parseFloat(req.query.maxFreq) || 40.0;
  const channels = ["TP9", "AF7", "AF8", "TP10"];

  // Use DSP pipeline's FFT results if available
  const power = [];
  let frequencies = [];

  for (let ch = 0; ch < 4; ch++) {
    // Get recent samples
    const buffer = eegBuffer[ch] || [];
    const samples = buffer.slice(-1024); // Use last 4 seconds @ 256Hz

    if (samples.length < 32) {
      power.push([]);
      continue;
    }

    // Simple FFT (using DSP pipeline would be better, but this works)
    // For now, return placeholder data based on current band powers
    // TODO: Use actual FFT from DSP pipeline

    // Generate frequency axis
    if (frequencies.length === 0) {
      for (let f = minFreq; f <= maxFreq; f += 0.5) {
        frequencies.push(f);
      }
    }

    // Generate power spectrum based on band powers
    const spectrum = [];
    for (let f of frequencies) {
      // Rough approximation based on typical EEG spectrum
      let pwr = 0;
      if (f < 4)
        pwr = 10 - f * 2; // Delta decreases
      else if (f < 8)
        pwr = 5 + Math.sin(f) * 2; // Theta
      else if (f < 13)
        pwr = 8 + Math.sin(f * 0.5) * 3; // Alpha peak
      else if (f < 30)
        pwr = 3 - f * 0.1; // Beta decreases
      else pwr = 1 - f * 0.02; // Gamma low

      // Add noise for realism
      pwr += Math.random() * 0.5;

      // Convert to dB
      spectrum.push(10 * Math.log10(Math.max(pwr, 0.001)));
    }

    power.push(spectrum);
  }

  res.json({
    channels,
    frequencies,
    power,
    minFreq,
    maxFreq,
  });
});

app.get("/api/settings", (req, res) => {
  res.json(settings);
});

app.get("/api/osc/config", (req, res) => {
  // Show current OSC configuration (Csound is primary target)
  res.json({
    oscHost: config.oscHost,
    oscPort: config.oscPort,
    oscPrefix: settings.oscPrefix,
    oscStreams: settings.oscStreams,
    primaryTarget: "Csound (🎵 recommended)",
    otherTargets: ["Max/MSP", "TouchDesigner", "Unity", "Pure Data"],
    csoundSetup: `OSCinit ${config.oscPort}`,
    messageExamples: {
      bandAbsolute: [
        {
          address: `${settings.oscPrefix}/elements/alpha_absolute`,
          type: "float (dB)",
          range: "0.0-3.0",
          recommended: true,
          csoundExample: `kAlpha OSCparm giPort, "${settings.oscPrefix}/elements/alpha_absolute", 0`,
        },
        {
          address: `${settings.oscPrefix}/elements/beta_absolute`,
          type: "float (dB)",
        },
        {
          address: `${settings.oscPrefix}/elements/theta_absolute`,
          type: "float (dB)",
        },
        {
          address: `${settings.oscPrefix}/elements/delta_absolute`,
          type: "float (dB)",
        },
        {
          address: `${settings.oscPrefix}/elements/gamma_absolute`,
          type: "float (dB)",
        },
      ],
      bandRelative: [
        {
          address: `${settings.oscPrefix}/elements/alpha_relative`,
          type: "float (0.0-1.0 normalized)",
          note: "Use for scaling/modulation in Csound",
        },
        {
          address: `${settings.oscPrefix}/elements/beta_relative`,
          type: "float (0.0-1.0)",
        },
        {
          address: `${settings.oscPrefix}/elements/theta_relative`,
          type: "float (0.0-1.0)",
        },
        {
          address: `${settings.oscPrefix}/elements/delta_relative`,
          type: "float (0.0-1.0)",
        },
        {
          address: `${settings.oscPrefix}/elements/gamma_relative`,
          type: "float (0.0-1.0)",
        },
      ],
    },
  });
});

app.post("/api/osc/prefix", (req, res) => {
  const { prefix } = req.body;
  if (!prefix || !prefix.startsWith("/")) {
    return res.status(400).json({ error: "Prefix must start with /" });
  }
  settings.oscPrefix = prefix;
  console.log(`📡 OSC prefix changed to: ${prefix}`);
  broadcastSettings();
  res.json({ status: "updated", oscPrefix: settings.oscPrefix });
});

app.post("/api/simulator/profile", (req, res) => {
  const { profile } = req.body || {};
  if (!profile || !SIM_PROFILES[profile]) {
    return res.status(400).json({
      status: "error",
      message: `Unknown profile. Valid: ${Object.keys(SIM_PROFILES).join(", ")}`,
    });
  }
  settings.simulatorProfile = profile;
  console.log(`🎲 Simulator profile changed to: ${profile}`);
  broadcastSettings();
  res.json({ status: "ok", profile, weights: SIM_PROFILES[profile] });
});

app.get("/api/simulator/status", (req, res) => {
  res.json({
    enabled: !!settings.simulatorMode,
    profile: settings.simulatorProfile || "relaxed_eyes_closed",
    profiles: SIM_PROFILES,
    packetCount,
    rate: settings.outputRateHz || 256,
    running: !!simulatorInterval,
  });
});

app.post("/api/use_simulator", (req, res) => {
  const { enabled, autoEnableOSC } = req.body;
  settings.simulatorMode = !!enabled;
  console.log(`🎮 Simulator mode: ${enabled ? "ENABLED" : "DISABLED"}`);

  // Auto-enable OSC master gate when starting the simulator (unless explicitly
  // disabled by the caller). This is what users expect: "Start simulator"
  // should mean packets actually hit Csound / Max on port 7400.
  if (settings.simulatorMode && autoEnableOSC !== false) {
    if (!settings.oscSending) {
      settings.oscSending = true;
      console.log("📡 OSC Sending: AUTO-ENABLED (simulator on)");
    }
  }

  // Start or stop simulator interval
  if (settings.simulatorMode) {
    if (!simulatorInterval) {
      let simCount = 0;
      let bandPowerCount = 0;
      let motionCount = 0;
      simulatorInterval = setInterval(() => {
        const eeg = generateSimulatorData();
        if (eeg) {
          packetCount++;
          simCount++;
          const processed = dsp.process(eeg);
          broadcastEEGData(eeg, processed);
          if (simCount === 1)
            console.log(`📊 Simulator streaming: ${packetCount} total packets`);
        }
        bandPowerCount++;
        if (bandPowerCount >= 26) {
          const bandPowers = generateSimulatorBandPowers();
          if (bandPowers) {
            broadcastBandPowers(bandPowers.absolute, bandPowers.relative);
          }
          bandPowerCount = 0;
        }
        motionCount++;
        if (motionCount >= 26) {
          const accel = generateSimulatorMotion("accel");
          const gyro = generateSimulatorMotion("gyro");
          const ppg = generateSimulatorMotion("ppg");
          if (accel) broadcastMotionData("accel", accel);
          if (gyro) broadcastMotionData("gyro", gyro);
          if (ppg) {
            broadcastMotionData("ppg", ppg);

            // Detect heartbeat and send HR OSC
            const time = Date.now() / 1000;
            const BPM = 72;
            const beatPeriod = 60 / BPM;
            const beatPhase = (time % beatPeriod) / beatPeriod;

            // Trigger on R-wave peak (beatPhase ~0.25)
            const beatTrigger =
              beatPhase > 0.24 && beatPhase < 0.26 ? 1.0 : 0.0;

            sendHeartRateOSC(BPM, beatTrigger);
          }
          motionCount = 0;
        }
      }, 1000 / 256);
      console.log("✓ Simulator interval started");
    }
  } else {
    if (simulatorInterval) {
      clearInterval(simulatorInterval);
      simulatorInterval = null;
      console.log("✓ Simulator interval stopped");
    }
  }

  broadcastSettings();
  res.json({ status: "ok", simulatorMode: settings.simulatorMode });
});

app.post("/api/settings", (req, res) => {
  const {
    oscPrefix,
    oscStreams,
    simulatorMode,
    simulatorProfile,
    applyBaseline,
    logTransform,
    baselineWindowSec,
    notchHz,
  } = req.body;

  if (
    simulatorProfile !== undefined &&
    SIM_PROFILES[simulatorProfile]
  ) {
    settings.simulatorProfile = simulatorProfile;
    console.log(`🎲 Simulator profile: ${simulatorProfile}`);
  }

  if (oscPrefix) {
    settings.oscPrefix = oscPrefix;
    console.log(`📡 OSC prefix changed to: ${oscPrefix}`);
  }

  if (oscStreams) {
    settings.oscStreams = { ...settings.oscStreams, ...oscStreams };
    console.log(`✓ OSC streams updated:`, settings.oscStreams);
  }

  if (applyBaseline !== undefined) {
    settings.applyBaseline = applyBaseline;
    baselineSystem.baselineNormalize = applyBaseline;
    console.log(
      `📊 Z-Score Baseline Normalize: ${applyBaseline ? "ON" : "OFF"}`,
    );
  }

  if (logTransform !== undefined) {
    settings.logTransform = logTransform;
    baselineSystem.logTransform = logTransform; // Use new system
    console.log(`📈 Log Transform: ${logTransform ? "ON" : "OFF"}`);
  }

  if (simulatorMode !== undefined) {
    settings.simulatorMode = simulatorMode;
    console.log(`🎲 Simulator mode: ${simulatorMode ? "ON" : "OFF"}`);

    // Start or stop simulator interval
    if (simulatorMode) {
      if (!simulatorInterval) {
        let simCount = 0;
        let bandPowerCount = 0;
        let motionCount = 0;
        simulatorInterval = setInterval(() => {
          const eeg = generateSimulatorData();
          if (eeg) {
            packetCount++;
            simCount++;
            const processed = dsp.process(eeg);
            broadcastEEGData(eeg, processed);
            if (simCount === 1)
              console.log(
                `📊 Simulator streaming: ${packetCount} total packets`,
              );
          }
          bandPowerCount++;
          if (bandPowerCount >= 26) {
            const bandPowers = generateSimulatorBandPowers();
            if (bandPowers) {
              broadcastBandPowers(bandPowers.absolute, bandPowers.relative);
            }
            bandPowerCount = 0;
          }
          motionCount++;
          if (motionCount >= 26) {
            const accel = generateSimulatorMotion("accel");
            const gyro = generateSimulatorMotion("gyro");
            const ppg = generateSimulatorMotion("ppg");
            if (accel) broadcastMotionData("accel", accel);
            if (gyro) broadcastMotionData("gyro", gyro);
            if (ppg) {
              broadcastMotionData("ppg", ppg);
              const time = Date.now() / 1000;
              const BPM = 72;
              const beatPeriod = 60 / BPM;
              const beatPhase = (time % beatPeriod) / beatPeriod;
              const beatTrigger =
                beatPhase > 0.24 && beatPhase < 0.26 ? 1.0 : 0.0;
              sendHeartRateOSC(BPM, beatTrigger);
            }
            motionCount = 0;
          }
        }, 1000 / 256);
      }
    } else {
      if (simulatorInterval) {
        clearInterval(simulatorInterval);
        simulatorInterval = null;
      }
    }
  }

  updateSettings(req.body);

  if (baselineWindowSec !== undefined) {
    applyBaselineWindowSec(settings.baselineWindowSec);
    console.log(
      `📊 Baseline window: ${baselineSystem.windowSec}s (${baselineSystem.maxSamples} samples @ ${BASELINE_BAND_RATE_HZ} Hz)`,
    );
  }

  if (notchHz !== undefined) {
    const hz =
      settings.notchHz === 50 || settings.notchHz === 60 ? settings.notchHz : 60;
    settings.notchHz = hz;
    dsp.updateConfig({ notchHz: hz });
    console.log(`✓ Notch center frequency: ${hz} Hz`);
  }

  broadcastSettings();
  res.json({ status: "updated", settings });
});

app.post("/api/connect/:index", (req, res) => {
  const index = parseInt(req.params.index);
  if (swiftProcess && swiftProcess.stdin) {
    swiftProcess.stdin.write(
      JSON.stringify({
        command: "connect",
        deviceIndex: index,
      }) + "\n",
    );
    res.json({ status: "connecting" });
  } else {
    res.status(500).json({ error: "Swift bridge not running" });
  }
});

app.post("/api/simulator/toggle", (req, res) => {
  settings.simulatorMode = !settings.simulatorMode;
  broadcastSettings();
  res.json({ simulator_mode: settings.simulatorMode });
});

app.post("/api/recording/start", (req, res) => {
  settings.recordingEnabled = true;
  recordedData = [];
  res.json({ status: "recording" });
});

app.post("/api/recording/stop", (req, res) => {
  settings.recordingEnabled = false;
  res.json({ status: "stopped", samples: recordedData.length });
});

app.get("/api/recording/download", (req, res) => {
  const csv = convertToCSV(recordedData);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="eeg-data.csv"');
  res.send(csv);
});

/** Disk session recorder: same manifest/CSV schema as web recorder; survives browser disconnect. */
app.post("/api/session_recording/start", (req, res) => {
  try {
    if (sessionDisk.isActive()) {
      return res.status(400).json({ ok: false, error: "already_recording" });
    }
    const body = req.body || {};
    const device =
      currentDevice?.displayName ||
      currentDevice?.name ||
      body.device ||
      "UNKNOWN";
    const r = sessionDisk.startSession({
      name: body.name || "session",
      segmentMinutes: body.segmentMinutes,
      device,
      source: settings.simulatorMode ? "simulator" : "device",
      sampleRate: settings.outputRateHz || 256,
      channels: Array.isArray(body.channels) ? body.channels : undefined,
      eegTraceSource: "server_dsp",
      outRoot: process.env.NEUROVIS_SESSION_OUT || undefined,
    });
    console.log(`💾 Disk session recording started → ${r.dir}`);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

app.post("/api/session_recording/stop", async (req, res) => {
  try {
    const out = await sessionDisk.stopSession();
    if (!out) {
      return res.status(400).json({ ok: false, error: "not_recording" });
    }
    console.log(
      `💾 Disk session recording stopped → ${out.dir} (eeg_samples=${out.manifest.eeg_samples} band_samples=${out.manifest.band_samples})`,
    );
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

app.get("/api/session_recording/status", (req, res) => {
  res.json(sessionDisk.getStatus());
});

app.post("/api/session_recording/annotate", (req, res) => {
  if (!sessionDisk.isActive()) {
    return res.status(400).json({ ok: false, error: "not_recording" });
  }
  const body = req.body || {};
  const label = String(body.label || "").trim();
  if (!label) {
    return res.status(400).json({ ok: false, error: "label_required" });
  }
  sessionDisk.addAnnotation(label, body.detail);
  res.json({ ok: true });
});

// ── Calibration Endpoints ──
// Per-channel baselines (rolling history)
function createEmptyBaseline() {
  const bands = ["delta", "theta", "alpha", "beta", "gamma"];
  const baseline = {};
  for (let band of bands) {
    baseline[band] = { mean: 0, m2: 0, n: 0, stddev: 0.001, history: [] };
  }
  return baseline;
}

// Rolling baseline system for relative-band z-scoring
// Passive rolling window - toggle baseline_normalize ON and it auto-collects the last windowSec seconds.
/** Assumed relative-band update cadence for maxSamples (= windowSec × this). */
const BASELINE_BAND_RATE_HZ = 10;

let baselineSystem = {
  logTransform: false, // Apply log₁₀ first (if enabled)
  baselineNormalize: false, // Apply z-score second (if enabled)
  windowSec: 60,
  maxSamples: 600,
  // Rolling history per channel+band: { CH1: { delta: [], theta: [], ... }, ... }
  history: {
    CH1: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH2: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH3: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH4: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
  },
};

baselineSystem.windowSec = settings.baselineWindowSec;
baselineSystem.maxSamples = Math.round(
  settings.baselineWindowSec * BASELINE_BAND_RATE_HZ,
);

function trimBaselineHistoryToCap() {
  const max = baselineSystem.maxSamples;
  Object.keys(baselineSystem.history).forEach((ch) => {
    Object.keys(baselineSystem.history[ch]).forEach((band) => {
      const h = baselineSystem.history[ch][band];
      if (h.length > max) {
        baselineSystem.history[ch][band] = h.slice(h.length - max);
      }
    });
  });
}

function applyBaselineWindowSec(sec) {
  const s = Math.max(10, Math.min(600, Math.round(Number(sec))));
  settings.baselineWindowSec = s;
  baselineSystem.windowSec = s;
  baselineSystem.maxSamples = Math.round(s * BASELINE_BAND_RATE_HZ);
  trimBaselineHistoryToCap();
}

// Log optional + rolling z-score (per channel/band history)
function normalizeBandPower(channel, band, rawPower) {
  let value = rawPower;

  // Step 1: Apply log₁₀ if enabled
  if (baselineSystem.logTransform) {
    value = Math.log10(Math.max(value, 1e-10));
  }

  // Step 2: Return early if z-score not enabled
  if (!baselineSystem.baselineNormalize) {
    return value;
  }

  // Get history for this channel+band
  const history = baselineSystem.history[channel][band];

  // Add current value to rolling window
  history.push(value);
  if (history.length > baselineSystem.maxSamples) {
    history.shift(); // Remove oldest
  }

  // Need at least 10 samples before z-scoring
  if (history.length < 10) {
    return value;
  }

  // Calculate mean and std from rolling window
  const mean = history.reduce((sum, v) => sum + v, 0) / history.length;
  const variance =
    history.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / history.length;
  const std = Math.sqrt(variance);

  // Avoid division by zero
  if (std < 1e-10) {
    return 0.0;
  }

  // Return z-score
  return (value - mean) / std;
}

app.post("/api/baseline/reset", (req, res) => {
  console.log("🔃 Resetting baseline history");
  baselineSystem.history = {
    CH1: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH2: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH3: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH4: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
  };
  broadcastSettings();
  res.json({ status: "reset" });
});

app.get("/api/baseline/status", (req, res) => {
  // Count samples collected per channel
  const sampleCounts = {};
  Object.keys(baselineSystem.history).forEach((ch) => {
    sampleCounts[ch] = baselineSystem.history[ch].alpha.length; // Use alpha as representative
  });

  res.json({
    logTransform: baselineSystem.logTransform,
    baselineNormalize: baselineSystem.baselineNormalize,
    windowSec: baselineSystem.windowSec,
    maxSamples: baselineSystem.maxSamples,
    baselineBandRateHz: BASELINE_BAND_RATE_HZ,
    sampleCounts,
    ready: sampleCounts.CH1 >= 10, // Ready when at least 10 samples
  });
});

app.post("/api/baseline/config", (req, res) => {
  const { windowSec } = req.body || {};
  if (windowSec === undefined) {
    return res.status(400).json({ error: "windowSec required (seconds, 10–600)" });
  }
  applyBaselineWindowSec(windowSec);
  broadcastSettings();
  res.json({
    status: "ok",
    windowSec: baselineSystem.windowSec,
    maxSamples: baselineSystem.maxSamples,
    baselineBandRateHz: BASELINE_BAND_RATE_HZ,
  });
});

// ── 90-Second Calibration Protocol (for guided baseline collection) ──
let calibrationState = {
  isCalibrating: false,
  isLocked: false,
  startTime: 0,
  duration: 90000, // 90 seconds
  progress: 0,
  samplesCollected: 0,
};

app.post("/api/calibration/start", (req, res) => {
  console.log("🎯 Starting 90-second calibration protocol");
  calibrationState.isCalibrating = true;
  calibrationState.isLocked = false;
  calibrationState.startTime = Date.now();
  calibrationState.progress = 0;
  calibrationState.samplesCollected = 0;

  // Reset baseline history for fresh collection
  baselineSystem.history = {
    CH1: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH2: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH3: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH4: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
  };

  // Enable baseline collection
  baselineSystem.baselineNormalize = true;
  settings.applyBaseline = true;

  broadcastSettings();
  broadcastCalibrationStatus();
  res.json({ status: "ok", duration_ms: calibrationState.duration });
});

app.post("/api/calibration/stop", (req, res) => {
  console.log(
    `🛑 Stopping calibration (collected ${calibrationState.samplesCollected} samples)`,
  );
  calibrationState.isCalibrating = false;
  calibrationState.isLocked = true;
  broadcastCalibrationStatus();
  res.json({
    status: "ok",
    samplesCollected: calibrationState.samplesCollected,
  });
});

app.post("/api/calibration/reset", (req, res) => {
  console.log("🔄 Resetting calibration");
  calibrationState.isCalibrating = false;
  calibrationState.isLocked = false;
  calibrationState.progress = 0;
  calibrationState.samplesCollected = 0;

  // Clear baseline history
  baselineSystem.history = {
    CH1: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH2: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH3: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
    CH4: { delta: [], theta: [], alpha: [], beta: [], gamma: [] },
  };

  baselineSystem.baselineNormalize = false;
  settings.applyBaseline = false;
  broadcastSettings();
  broadcastCalibrationStatus();
  res.json({ status: "ok" });
});

app.get("/api/calibration/status", (req, res) => {
  if (calibrationState.isCalibrating) {
    const elapsed = Date.now() - calibrationState.startTime;
    calibrationState.progress = Math.min(
      elapsed / calibrationState.duration,
      1.0,
    );

    // Auto-lock after 90 seconds
    if (elapsed >= calibrationState.duration) {
      calibrationState.isCalibrating = false;
      calibrationState.isLocked = true;
      console.log(
        `✅ Calibration complete! Collected ${calibrationState.samplesCollected} samples`,
      );
      broadcastCalibrationStatus();
    }
  }

  res.json({
    isCalibrating: calibrationState.isCalibrating,
    isLocked: calibrationState.isLocked,
    progress: calibrationState.progress,
    samplesCollected: calibrationState.samplesCollected,
  });
});

function updateCalibrationBaseline(channelBandPowers) {
  if (!calibrationState.isCalibrating) return;

  const elapsed = Date.now() - calibrationState.startTime;
  if (elapsed > calibrationState.duration) {
    calibrationState.isCalibrating = false;
    calculateZScores();
    console.log("✅ Per-channel calibration complete!");
    broadcastCalibrationStatus();
    return;
  }

  // channelBandPowers format:
  // { CH1: {delta: 0.2, theta: 0.3, ...}, CH2: {...}, CH3: {...}, CH4: {...} }
  const channels = ["CH1", "CH2", "CH3", "CH4"];
  const bands = ["delta", "theta", "alpha", "beta", "gamma"];

  for (let channel of channels) {
    if (!channelBandPowers[channel]) continue;

    for (let band of bands) {
      let value = channelBandPowers[channel][band] || 0;

      // Optional: apply log transform
      if (calibrationState.logTransform) {
        value = Math.log10(Math.max(value, 1e-10));
      }

      const acc = calibrationState.baseline[channel][band];

      // Welford's online algorithm for mean and variance
      acc.n++;
      const delta = value - acc.mean;
      acc.mean += delta / acc.n;
      const delta2 = value - acc.mean;
      acc.m2 += delta * delta2;

      // For rolling baseline: keep history (last 300 samples = 30 seconds @ 10 Hz)
      if (calibrationState.mode === "rolling") {
        acc.history.push(value);
        if (acc.history.length > 300) {
          acc.history.shift(); // Remove oldest
        }
      }
    }
  }

  calibrationState.samplesCollected++;
}

function calculateZScores() {
  const channels = ["CH1", "CH2", "CH3", "CH4"];
  const bands = ["delta", "theta", "alpha", "beta", "gamma"];

  for (let channel of channels) {
    for (let band of bands) {
      const acc = calibrationState.baseline[channel][band];
      const variance = acc.n > 1 ? acc.m2 / (acc.n - 1) : 0;
      const stddev = Math.sqrt(variance);
      // Store stddev for z-score calculation
      acc.stddev = stddev || 0.001; // Prevent division by zero
    }
  }

  console.log("📊 Per-channel z-scores calculated");
  console.log(
    "  CH1 alpha:",
    `mean=${calibrationState.baseline.CH1.alpha.mean.toFixed(3)} stddev=${calibrationState.baseline.CH1.alpha.stddev.toFixed(3)}`,
  );
  console.log(
    "  CH2 alpha:",
    `mean=${calibrationState.baseline.CH2.alpha.mean.toFixed(3)} stddev=${calibrationState.baseline.CH2.alpha.stddev.toFixed(3)}`,
  );
  console.log(
    "  CH3 alpha:",
    `mean=${calibrationState.baseline.CH3.alpha.mean.toFixed(3)} stddev=${calibrationState.baseline.CH3.alpha.stddev.toFixed(3)}`,
  );
  console.log(
    "  CH4 alpha:",
    `mean=${calibrationState.baseline.CH4.alpha.mean.toFixed(3)} stddev=${calibrationState.baseline.CH4.alpha.stddev.toFixed(3)}`,
  );
}

function broadcastCalibrationStatus() {
  const progress = calibrationState.isCalibrating
    ? (Date.now() - calibrationState.startTime) / calibrationState.duration
    : 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "calibration_status",
          isCalibrating: calibrationState.isCalibrating,
          progress: Math.min(progress, 1),
          samplesCollected: calibrationState.samplesCollected,
          baseline: calibrationState.baseline,
        }),
      );
    }
  });
}

function convertToCSV(data) {
  if (data.length === 0) return "No data";

  let csv =
    "timestamp,eeg1_raw,eeg2_raw,eeg3_raw,eeg4_raw,eeg1_proc,eeg2_proc,eeg3_proc,eeg4_proc\n";

  data.forEach((row) => {
    csv += `${row.timestamp},${row.raw.join(",")},${row.processed.join(",")}\n`;
  });

  return csv;
}

// ============================================================================
// Granular OSC controls
// ============================================================================

app.post("/api/osc/granular", (req, res) => {
  const { channels, bands, valueTypes } = req.body;

  if (channels) {
    settings.oscGranular.channels = {
      ...settings.oscGranular.channels,
      ...channels,
    };
    console.log(`✓ OSC channels updated:`, settings.oscGranular.channels);
  }

  if (bands) {
    settings.oscGranular.bands = { ...settings.oscGranular.bands, ...bands };
    console.log(`✓ OSC bands updated:`, settings.oscGranular.bands);
  }

  if (valueTypes) {
    settings.oscGranular.valueTypes = {
      ...settings.oscGranular.valueTypes,
      ...valueTypes,
    };
    console.log(`✓ OSC value types updated:`, settings.oscGranular.valueTypes);
  }

  res.json({ success: true, config: settings.oscGranular });
});

app.get("/api/osc/granular", (req, res) => {
  res.json(settings.oscGranular);
});

// ============================================================================
// DSP controls
// ============================================================================

app.post("/api/dsp/config", (req, res) => {
  const {
    applyCAR,
    applyNotch,
    applyBandpass,
    smoothingAmount,
    notchHz,
    bandpassLo,
    bandpassHi,
    applyMedian3,
    oscSending,
    deviceModel,
    inputFormat,
  } = req.body;

  if (applyCAR !== undefined) {
    settings.applyCAR = applyCAR;
    dsp.useCAR = applyCAR;
    console.log(`✓ CAR (Common Average Reference): ${applyCAR ? "ON" : "OFF"}`);
  }

  if (applyNotch !== undefined) {
    settings.applyNotch = applyNotch;
    dsp.useNotchFilter = applyNotch;
    console.log(
      `✓ Notch filter (${settings.notchHz} Hz): ${applyNotch ? "ON" : "OFF"}`,
    );
  }

  if (notchHz !== undefined) {
    const hz = notchHz === 50 || notchHz === 60 ? notchHz : settings.notchHz;
    settings.notchHz = hz;
    dsp.updateConfig({ notchHz: hz });
    console.log(`✓ Notch center frequency: ${hz} Hz`);
  }

  if (bandpassLo !== undefined || bandpassHi !== undefined) {
    if (bandpassLo !== undefined) settings.bandpassLo = Number(bandpassLo);
    if (bandpassHi !== undefined) settings.bandpassHi = Number(bandpassHi);
    dsp.updateConfig({
      bandpassLo: settings.bandpassLo,
      bandpassHi: settings.bandpassHi,
    });
    console.log(
      `✓ Bandpass: ${settings.bandpassLo} – ${settings.bandpassHi} Hz`,
    );
  }

  if (applyMedian3 !== undefined) {
    settings.applyMedian3 = !!applyMedian3;
    dsp.updateConfig({ applyMedian3: settings.applyMedian3 });
    console.log(
      `✓ 3-point median (post-bandpass): ${settings.applyMedian3 ? "ON" : "OFF"}`,
    );
  }

  if (applyBandpass !== undefined) {
    settings.applyBandpass = applyBandpass;
    dsp.useBandpassFilter = applyBandpass;
    console.log(`✓ Bandpass filter (1-45 Hz): ${applyBandpass ? "ON" : "OFF"}`);
  }

  if (smoothingAmount !== undefined) {
    settings.smoothingAmount = Math.max(0, Math.min(50, smoothingAmount));
    dsp.smoothingTimeConstantMs = settings.smoothingAmount;
    dsp.smoother = new ExponentialSmoother(
      settings.smoothingAmount,
      dsp.sampleRate,
    );
    console.log(`✓ Smoothing amount: ${settings.smoothingAmount}`);
  }

  if (deviceModel !== undefined) {
    settings.deviceModel = deviceModel;
    settings.yAxisRange = getDeviceYRange(deviceModel);
    console.log(`📊 Device: ${getDeviceInfoString(deviceModel)}`);
    console.log(
      `📊 Y-axis range: ${settings.yAxisRange[0]} to ${settings.yAxisRange[1]} μV`,
    );
    broadcastSettings();
  }

  if (inputFormat !== undefined) {
    settings.inputFormat = inputFormat;
    console.log(`📊 Input format: ${inputFormat}`);
    broadcastSettings();
  }

  if (oscSending !== undefined) {
    settings.oscSending = oscSending;
    console.log(`📡 OSC Sending: ${oscSending ? "ENABLED" : "DISABLED"}`);
    broadcastSettings();
  }

  res.json({
    success: true,
    config: {
      applyCAR: settings.applyCAR,
      applyNotch: settings.applyNotch,
      applyBandpass: settings.applyBandpass,
      smoothingAmount: settings.smoothingAmount,
      notchHz: settings.notchHz,
      bandpassLo: settings.bandpassLo,
      bandpassHi: settings.bandpassHi,
      applyMedian3: settings.applyMedian3,
      oscSending: settings.oscSending,
      deviceModel: settings.deviceModel,
      inputFormat: settings.inputFormat,
      yAxisRange: settings.yAxisRange,
    },
  });
});

app.get("/api/dsp/config", (req, res) => {
  res.json({
    applyCAR: settings.applyCAR,
    applyNotch: settings.applyNotch,
    applyBandpass: settings.applyBandpass,
    smoothingAmount: settings.smoothingAmount,
    notchHz: settings.notchHz,
    bandpassLo: settings.bandpassLo,
    bandpassHi: settings.bandpassHi,
    applyMedian3: settings.applyMedian3,
    deviceModel: settings.deviceModel,
    inputFormat: settings.inputFormat,
    yAxisRange: settings.yAxisRange,
  });
});

// ============================================================================
// Instrument Management API
// ============================================================================

// List available instruments
app.get("/api/instruments", (req, res) => {
  try {
    const examplesDir = path.join(__dirname, "examples");
    const files = fs.readdirSync(examplesDir);

    const instruments = files
      .filter((f) => f.startsWith("eeg_synth_") && f.endsWith(".csd"))
      .map((f) => {
        const name = f.replace("eeg_synth_", "").replace(".csd", "");
        return {
          id: name,
          filename: f,
          path: path.join(examplesDir, f),
          name: name
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      instruments,
      current: currentInstrument,
      running: csoundProcess && !csoundProcess.killed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Launch an instrument
app.post("/api/instruments/launch", (req, res) => {
  const { id, mode } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Missing instrument id" });
  }

  const launchMode = mode || "headless"; // Default to headless

  const examplesDir = path.join(__dirname, "examples");
  const csdPath = path.join(examplesDir, `eeg_synth_${id}.csd`);

  // Verify file exists
  if (!fs.existsSync(csdPath)) {
    return res.status(404).json({ error: `Instrument not found: ${id}` });
  }

  try {
    if (launchMode === "csoundqt") {
      // DO NOT launch CsoundQt in simulator mode
      if (settings.simulatorMode) {
        return res.status(400).json({
          error:
            "Cannot launch CsoundQt in simulator mode. Disable simulator first.",
          warning: "CsoundQt launch disabled in simulator mode",
        });
      }

      // Launch in CsoundQt for editing
      console.log(`📝 Opening in CsoundQt: ${id} at ${csdPath}`);

      // macOS: use 'open' command
      // Linux: use 'csoundqt' command
      // Windows: use 'csoundqt.exe' command
      const isWindows = process.platform === "win32";
      const isMac = process.platform === "darwin";

      try {
        let qtProcess;
        if (isMac) {
          // macOS: Use shell to expand CsoundQt* wildcard
          console.log(`🍎 macOS: Launching CsoundQt with '${csdPath}'`);
          qtProcess = spawn("sh", ["-c", `open -a CsoundQt* "${csdPath}"`]);
        } else if (isWindows) {
          console.log(`🪟 Windows: Launching 'csoundqt.exe ${csdPath}'`);
          qtProcess = spawn("csoundqt.exe", [csdPath]);
        } else {
          // Linux
          console.log(`🐧 Linux: Launching 'csoundqt ${csdPath}'`);
          qtProcess = spawn("csoundqt", [csdPath]);
        }

        // Log any errors from CsoundQt spawn
        if (qtProcess) {
          qtProcess.on("error", (err) => {
            console.error(`❌ Failed to launch CsoundQt: ${err.message}`);
          });

          qtProcess.on("close", (code) => {
            console.log(`✅ CsoundQt closed (exit code ${code})`);
          });

          qtProcess.stdout?.on("data", (data) => {
            console.log(`[CsoundQt] ${data.toString().trim()}`);
          });

          qtProcess.stderr?.on("data", (data) => {
            console.log(`[CsoundQt ERROR] ${data.toString().trim()}`);
          });
        }
      } catch (err) {
        console.error(`❌ Error spawning CsoundQt: ${err.message}`);
        return res.status(500).json({
          error: `Failed to launch CsoundQt: ${err.message}. Is CsoundQt installed?`,
        });
      }

      // Don't kill background instrument for CsoundQt mode
      // User can run CsoundQt independently
      currentInstrument = id;

      // Broadcast status (not technically "running" in headless mode, but open for editing)
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "instrument_status",
              current: currentInstrument,
              running: false,
              mode: "csoundqt_editing",
            }),
          );
        }
      });

      res.json({
        success: true,
        current: currentInstrument,
        running: false,
        mode: "csoundqt_editing",
        message:
          "CsoundQt opened for editing. Run from there or use Headless mode for background playback.",
      });
    } else {
      // Headless mode: launch Csound in background

      // Stop current instrument first
      if (csoundProcess && !csoundProcess.killed) {
        csoundProcess.kill();
        csoundProcess = null;
      }

      console.log(`🎵 Launching instrument (headless): ${id}`);
      csoundProcess = spawn("csound", ["-odac", "-d", csdPath]);
      currentInstrument = id;

      csoundProcess.on("close", (code) => {
        console.log(`🎵 Instrument stopped: ${id} (exit code ${code})`);
        if (currentInstrument === id) {
          currentInstrument = null;
          csoundProcess = null;
        }

        // Broadcast status to all clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "instrument_status",
                current: currentInstrument,
                running: false,
              }),
            );
          }
        });
      });

      csoundProcess.stderr.on("data", (data) => {
        console.log(`[CSOUND] ${data.toString().trim()}`);
      });

      // Broadcast status to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "instrument_status",
              current: currentInstrument,
              running: true,
              mode: "headless",
            }),
          );
        }
      });

      res.json({
        success: true,
        current: currentInstrument,
        running: true,
        mode: "headless",
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop current instrument
app.post("/api/instruments/stop", (req, res) => {
  if (csoundProcess && !csoundProcess.killed) {
    csoundProcess.kill();
    csoundProcess = null;
    currentInstrument = null;

    // Broadcast status
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "instrument_status",
            current: null,
            running: false,
          }),
        );
      }
    });
  }

  res.json({
    success: true,
    current: currentInstrument,
    running: false,
  });
});

// Get current instrument status
app.get("/api/instruments/status", (req, res) => {
  res.json({
    current: currentInstrument,
    running: csoundProcess && !csoundProcess.killed,
  });
});

// ============================================================================
// Ganglion BrainFlow Integration
// ============================================================================

async function startGanglion() {
  if (ganglionBoard && ganglionStreaming) {
    console.log("⚠️  Ganglion already streaming");
    return;
  }

  try {
    console.log("🔌 Starting Ganglion via BrainFlow...");

    // Enable BrainFlow logging
    BoardShim.setLogLevel(LogLevels.LEVEL_INFO);

    const boardId = BoardIds.GANGLION_BOARD; // BLED dongle
    const params = new BrainFlowInputParams();
    params.serial_port = "/dev/cu.usbmodem11"; // BLED dongle port

    ganglionBoard = new BoardShim(boardId, params);

    console.log("⏳ Connecting to Ganglion...");
    ganglionBoard.prepareSession();
    console.log("✅ Ganglion connected!");

    // Get board specs
    const eegChannels = BoardShim.getEegChannels(boardId);
    const samplingRate = BoardShim.getSamplingRate(boardId);

    console.log(
      `📊 Ganglion: ${eegChannels.length} channels @ ${samplingRate} Hz`,
    );

    // Start streaming
    ganglionBoard.startStream();
    ganglionStreaming = true;
    console.log("▶️  Ganglion streaming started!\n");

    // Broadcast device info to UI
    connectedDevices = [
      {
        name: "Ganglion",
        index: 0,
        model: "OpenBCI Ganglion",
        connected: true,
        specs: {
          name: "OpenBCI Ganglion",
          eegChannels: 4,
          eegSampleRate: 200,
        },
      },
    ];

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "device_list",
            devices: connectedDevices,
          }),
        );
      }
    });

    // Poll for data and compute band powers at 10 Hz
    let sampleBuffer = [[], [], [], []]; // 4 channels
    const samplesNeeded = Math.floor(samplingRate / 10); // ~20 samples per 10 Hz update

    ganglionInterval = setInterval(() => {
      if (!ganglionStreaming) return;

      const data = ganglionBoard.getBoardData();

      if (data && data.length > 0 && data[0].length > 0) {
        const numSamples = data[0].length;

        // Extract EEG channels (indices 1-4 for Ganglion)
        for (let i = 0; i < numSamples; i++) {
          for (let ch = 0; ch < 4; ch++) {
            sampleBuffer[ch].push(data[eegChannels[ch]][i]);

            // Keep buffer at ~128 samples for FFT
            if (sampleBuffer[ch].length > 128) {
              sampleBuffer[ch].shift();
            }
          }
        }

        // Compute band powers when we have enough data
        if (sampleBuffer[0].length >= samplesNeeded) {
          const bandPowers = computeBandPowersFromEEG(
            sampleBuffer,
            samplingRate,
          );

          if (bandPowers) {
            currentBandPowers = bandPowers;
            packetCount += numSamples;

            // Broadcast to UI
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(
                  JSON.stringify({
                    type: "band_powers",
                    absolute: bandPowers.absolute,
                    relative: bandPowers.relative,
                    timestamp: Date.now(),
                  }),
                );
              }
            });

            // Send to Csound via OSC
            if (settings.oscSending) {
              sendBandPowersOSC(bandPowers);
            }
          }
        }
      }
    }, 100); // Poll every 100ms
  } catch (error) {
    console.error("❌ Ganglion error:", error.message);
    stopGanglion();
  }
}

function stopGanglion() {
  if (!ganglionBoard && !ganglionStreaming && !ganglionInterval) {
    return;
  }

  console.log("🛑 Stopping OpenBCI Ganglion stream...");

  if (ganglionInterval) {
    clearInterval(ganglionInterval);
    ganglionInterval = null;
  }

  if (ganglionBoard) {
    try {
      if (ganglionStreaming) {
        ganglionBoard.stopStream();
      }
      ganglionBoard.releaseSession();
    } catch (e) {
      console.error("⚠️  Ganglion cleanup error:", e.message);
    }
    ganglionBoard = null;
  }

  ganglionStreaming = false;
  console.log("✅ OpenBCI Ganglion stream stopped");
}

function computeBandPowersFromEEG(channelData, sampleRate) {
  // Simple FFT-based band power computation
  // Average across all 4 channels

  const bands = {
    delta: [1, 4],
    theta: [4, 8],
    alpha: [8, 13],
    beta: [13, 30],
    gamma: [30, 50],
  };

  let absolute = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

  // Simplified power calculation (sum of squares in each band)
  for (let ch = 0; ch < 4; ch++) {
    const samples = channelData[ch].slice(-128); // Last 128 samples
    if (samples.length < 128) continue;

    // Compute simple power (RMS) in each band
    // This is a simplified version - proper FFT would be better
    for (const [band, [low, high]] of Object.entries(bands)) {
      let power = 0;
      for (let i = 0; i < samples.length; i++) {
        power += samples[i] * samples[i];
      }
      absolute[band] += Math.sqrt(power / samples.length) / 4; // Average across channels
    }
  }

  // Normalize to 0-1 range (simplified)
  const total =
    absolute.delta +
    absolute.theta +
    absolute.alpha +
    absolute.beta +
    absolute.gamma;
  const relative = {};

  if (total > 0) {
    for (const band of Object.keys(bands)) {
      absolute[band] = Math.max(0, Math.min(1, absolute[band] / 1000)); // Scale µV to 0-1
      relative[band] = absolute[band] / total;
    }
  }

  return { absolute, relative };
}

// API endpoint to start Ganglion
app.post("/api/ganglion/start", async (req, res) => {
  try {
    await startGanglion();
    res.json({ status: "started" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ganglion/stop", (req, res) => {
  stopGanglion();
  res.json({ status: "stopped" });
});

// ============================================================================
// Startup
// ============================================================================

function start() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🧠 NeuroVis EEG Dashboard — Muse + OpenBCI Support");
  console.log("═══════════════════════════════════════════════════════════\n");

  initOSC();
  launchSwiftBridge();

  app.listen(config.webPort, () => {
    console.log(`✓ Web UI: http://localhost:${config.webPort}`);
    console.log(
      `✓ Research markers: POST http://localhost:${config.webPort}/api/research-event`,
    );
    console.log(`✓ WebSocket: ws://localhost:${config.wsPort}`);
    console.log(`✓ OSC Target: ${config.oscHost}:${config.oscPort}`);
    console.log(`✓ DSP Pipeline: ACTIVE`);
    console.log(`✓ Simulator Mode: ${settings.simulatorMode ? "ON" : "OFF"}`);
    console.log("\nWaiting for Muse devices or simulator mode...\n");
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  if (swiftProcess) swiftProcess.kill();
  if (csoundProcess) csoundProcess.kill();
  if (oscPort) oscPort.close();
  stopGanglion();
  wss.close();
  process.exit(0);
});

start();
