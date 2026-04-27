// Browser-side EEG simulator.
//
// Generates physiologically credible 4-channel EEG + band powers + motion, and
// pushes both:
//   (a) synthetic WebSocket-style messages into the zustand store (so all
//       displays animate), and
//   (b) outbound OSC messages via the `osc_send` relay on the server (so
//       Csound / Max / TouchDesigner receive real UDP packets).
//
// Algorithm mirrors the server's `generateSimulator*` functions (which were
// themselves based on Niedermeyer & Lopes da Silva, Buzsáki & Draguhn). Five
// profiles shape the band-power distribution:
//   relaxed_eyes_closed · focused · meditative · drowsy · aroused.
//
// Manual band weights can override the profile so users can drag a slider and
// hear Csound respond in real time.

import type { BandName, BandPowers } from "./types";
import { dsp } from "./dspPipeline";
import { bandFilters } from "./bandFilters";
import {
  elementsBandAbsoluteArgs,
  elementsBandRelativeArgs,
} from "./bandOscChannels";
import { computePSD } from "./fft";
import {
  MIND_MONITOR_FFT_SIZE,
  resamplePsdToMindMonitorBins,
} from "./mindMonitor";

export type SimProfile =
  | "relaxed_eyes_closed"
  | "focused"
  | "meditative"
  | "drowsy"
  | "aroused";

export const SIM_PROFILES: Record<SimProfile, BandPowers> = {
  relaxed_eyes_closed: {
    delta: 0.08,
    theta: 0.12,
    alpha: 0.5,
    beta: 0.2,
    gamma: 0.1,
  },
  focused: { delta: 0.05, theta: 0.1, alpha: 0.2, beta: 0.5, gamma: 0.15 },
  meditative: { delta: 0.1, theta: 0.45, alpha: 0.3, beta: 0.1, gamma: 0.05 },
  drowsy: { delta: 0.45, theta: 0.25, alpha: 0.15, beta: 0.1, gamma: 0.05 },
  aroused: { delta: 0.05, theta: 0.08, alpha: 0.15, beta: 0.42, gamma: 0.3 },
};

const CHANNELS = ["TP9", "AF7", "AF8", "TP10"] as const;

export interface SimulatorOptions {
  sampleRate: number; // raw EEG rate, default 256
  bandRate: number; // band-power rate, default 10
  motionRate: number; // motion rate, default 10
  wsTickRate: number; // how often to forward raw EEG to store, default 30 (10Hz is fine for UI)
  oscPrefix: string;
  sendRaw: boolean;
  sendBands: boolean;
  sendMotion: boolean;
  sendPPG: boolean;
  /** Emit `/elements/raw_fft0`…`3` (129 floats each @ bandRate) — MuseIO / Mind Monitor. */
  sendMindMonitorRawFft: boolean;
  amplitudeScale: number; // scales raw EEG µV (test "noise floor")
  mainsHz: 50 | 60; // power-line artifact frequency
}

export const DEFAULT_SIM_OPTIONS: SimulatorOptions = {
  sampleRate: 256,
  bandRate: 10,
  motionRate: 10,
  wsTickRate: 10,
  oscPrefix: "/muse",
  sendRaw: false,
  sendBands: true,
  sendMotion: false,
  sendPPG: false,
  sendMindMonitorRawFft: false,
  amplitudeScale: 1.0,
  mainsHz: 60,
};

interface OscMsg {
  address: string;
  args: number[];
}

export interface SimulatorHooks {
  /** Push an array of OSC messages to the server relay. */
  oscSend: (msgs: OscMsg[]) => void;
  /** Called on each WebSocket-style EEG update (approx wsTickRate Hz). */
  onEEG: (raw: number[]) => void;
  /** Called on each band-power update. */
  onBandPowers: (absolute: BandPowers, relative: BandPowers) => void;
  /** Called on each motion/aux update. */
  onMotion: (sensor: "accel" | "gyro" | "ppg" | "fnirs", values: number[]) => void;
  /** Called at wsTickRate with per-band per-channel filtered snapshots. */
  onBandTraces?: (perBandPerChannel: Record<BandName, number[]>) => void;
  /** Called once per packet, for counters. */
  onPacket: () => void;
}

/**
 * Stateful simulator. Call `.start()` to begin, `.stop()` to end.
 *
 * Live knobs (safe to change while running):
 *   - setProfile(profile)
 *   - setManualBands(bands | null)  // overrides profile when non-null
 *   - setOptions(partial)
 */
export class BrowserEEGSimulator {
  private opts: SimulatorOptions;
  private profile: SimProfile = "relaxed_eyes_closed";
  private manualBands: BandPowers | null = null;
  private hooks: SimulatorHooks;

  private eegTimer: ReturnType<typeof setInterval> | null = null;
  private bandTimer: ReturnType<typeof setInterval> | null = null;
  private motionTimer: ReturnType<typeof setInterval> | null = null;

  private sampleIdx = 0;
  private lastEEG: number[] = [0, 0, 0, 0];
  private lastBandTraces: Record<BandName, number[]> | null = null;
  /** Last N samples per channel for Mind Monitor–style Hamming FFT. */
  private fftRing: number[][] = [[], [], [], []];
  private startedAt = 0;
  private packetsSent = 0;

  constructor(hooks: SimulatorHooks, opts?: Partial<SimulatorOptions>) {
    this.hooks = hooks;
    this.opts = { ...DEFAULT_SIM_OPTIONS, ...opts };
  }

  get isRunning() {
    return this.eegTimer !== null;
  }
  get elapsedMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }
  get packetCount() {
    return this.packetsSent;
  }

  setProfile(p: SimProfile) {
    this.profile = p;
  }
  setManualBands(b: BandPowers | null) {
    this.manualBands = b;
  }
  setOptions(patch: Partial<SimulatorOptions>) {
    this.opts = { ...this.opts, ...patch };
    // Note: rates are captured at start(); restart required for rate changes.
  }

  /** Currently effective band weights (manual override wins). */
  private currentWeights(): BandPowers {
    if (this.manualBands) return this.manualBands;
    return SIM_PROFILES[this.profile];
  }

  start() {
    if (this.eegTimer) return;
    this.startedAt = Date.now();
    this.sampleIdx = 0;
    this.packetsSent = 0;
    this.fftRing = [[], [], [], []];

    // Raw EEG @ sampleRate (default 256 Hz)
    const eegPeriodMs = 1000 / this.opts.sampleRate;
    // We run a single high-rate timer (setInterval can't do 256 Hz reliably in
    // all browsers, but close enough for testing). We batch WS + OSC updates.
    let wsAccum = 0;
    const wsPeriodMs = 1000 / this.opts.wsTickRate;

    // Keep both filter banks in sync with the sim's native rate.
    dsp.setSampleRate(this.opts.sampleRate);
    bandFilters.setSampleRate(this.opts.sampleRate);
    bandFilters.reset();

    this.eegTimer = setInterval(() => {
      const t = (Date.now() - this.startedAt) / 1000;
      const raw = this.generateRawEEG(t);
      // Run the client-side DSP chain (detrend → CAR → bandpass → notch →
      // smoothing) at native rate. Both OSC output and display updates use
      // the processed signal, so toggling any stage has an immediate effect.
      const { values: processed } = dsp.processEEG(raw);
      // Run the 5×4 band bandpass bank at native rate so the Mind-Monitor
      // views have proper per-band per-channel traces.
      this.lastBandTraces = bandFilters.process(processed);
      this.lastEEG = processed;
      for (let ch = 0; ch < 4; ch++) {
        const row = this.fftRing[ch];
        row.push(processed[ch] ?? 0);
        if (row.length > MIND_MONITOR_FFT_SIZE) row.shift();
      }
      this.packetsSent++;
      this.hooks.onPacket();

      // Send raw EEG via OSC at native rate if enabled
      if (this.opts.sendRaw) {
        this.hooks.oscSend([
          {
            address: `${this.opts.oscPrefix}/eeg`,
            args: [...processed, 0, 0], // pad to 6 floats (Muse format)
          },
          {
            address: `${this.opts.oscPrefix}/eeg/TP9`,
            args: [processed[0]],
          },
          {
            address: `${this.opts.oscPrefix}/eeg/AF7`,
            args: [processed[1]],
          },
          {
            address: `${this.opts.oscPrefix}/eeg/AF8`,
            args: [processed[2]],
          },
          {
            address: `${this.opts.oscPrefix}/eeg/TP10`,
            args: [processed[3]],
          },
        ]);
      }

      // Throttle UI store updates
      wsAccum += eegPeriodMs;
      if (wsAccum >= wsPeriodMs) {
        wsAccum = 0;
        this.hooks.onEEG(processed);
        if (this.lastBandTraces && this.hooks.onBandTraces) {
          this.hooks.onBandTraces(this.lastBandTraces);
        }
      }
    }, eegPeriodMs);

    // Band powers @ bandRate (default 10 Hz)
    const bandPeriodMs = 1000 / this.opts.bandRate;
    this.bandTimer = setInterval(() => {
      const { absolute, relative } = this.generateBandPowers();
      // Apply log + z-score normalisation (off by default) to the absolute
      // band powers. Relative stays unnormalised (it's already 0..1 per the
      // Heavy normalising would flatten interpretability).
      const absNorm = dsp.normalizeBandPowers(absolute, "ALL");
      this.hooks.onBandPowers(absNorm, relative);
      const msgs: OscMsg[] = [];
      if (this.opts.sendBands) {
        msgs.push(
          ...this.buildBandOscMessages(absNorm, relative, this.lastBandTraces),
        );
      }
      if (this.opts.sendMindMonitorRawFft) {
        msgs.push(...this.buildMindMonitorRawFftOsc());
      }
      if (msgs.length) this.hooks.oscSend(msgs);
    }, bandPeriodMs);

    // Motion @ motionRate (default 10 Hz)
    const motionPeriodMs = 1000 / this.opts.motionRate;
    this.motionTimer = setInterval(() => {
      const t = (Date.now() - this.startedAt) / 1000;
      const accel = this.generateMotion("accel", t);
      const gyro = this.generateMotion("gyro", t);
      const ppg = this.generateMotion("ppg", t);
      const fnirs = this.generateMotion("fnirs", t);
      this.hooks.onMotion("accel", accel);
      this.hooks.onMotion("gyro", gyro);
      this.hooks.onMotion("ppg", ppg);
      this.hooks.onMotion("fnirs", fnirs);

      const oscMsgs: OscMsg[] = [];
      if (this.opts.sendMotion) {
        oscMsgs.push(
          { address: `${this.opts.oscPrefix}/acc`, args: accel },
          { address: `${this.opts.oscPrefix}/gyro`, args: gyro },
        );
      }
      if (this.opts.sendPPG) {
        oscMsgs.push(
          { address: `${this.opts.oscPrefix}/ppg`, args: ppg },
          { address: `${this.opts.oscPrefix}/fnirs`, args: fnirs },
          {
            address: `${this.opts.oscPrefix}/ppg/hr`,
            args: [72 + 4 * Math.sin(t * 0.05)],
          },
        );
      }
      if (oscMsgs.length) this.hooks.oscSend(oscMsgs);
    }, motionPeriodMs);
  }

  stop() {
    if (this.eegTimer) clearInterval(this.eegTimer);
    if (this.bandTimer) clearInterval(this.bandTimer);
    if (this.motionTimer) clearInterval(this.motionTimer);
    this.eegTimer = null;
    this.bandTimer = null;
    this.motionTimer = null;
  }

  // -------------------------------------------------------------------------
  // Signal generation
  // -------------------------------------------------------------------------

  private generateRawEEG(time: number): number[] {
    const w = this.currentWeights();
    const relaxed = SIM_PROFILES.relaxed_eyes_closed;
    const shape = (band: BandName) =>
      Math.max(0.05, w[band] / relaxed[band]);

    // Baseline peak amplitudes in µV (roughly from literature)
    const A = {
      delta: 30 * shape("delta"),
      theta: 20 * shape("theta"),
      alpha: 40 * shape("alpha"),
      beta: 10 * shape("beta"),
      gamma: 3 * shape("gamma"),
    };

    const channels: number[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const isFrontal = ch === 1 || ch === 2; // AF7, AF8
      const alphaFactor = isFrontal ? 0.7 : 1.2;
      const betaFactor = isFrontal ? 1.5 : 0.8;
      const isLeft = ch === 0 || ch === 1;
      const asym = isLeft ? 1.0 : 1.05;

      let s = 0;

      // delta (harmonics)
      for (let h = 1; h <= 2; h++) {
        const f = (2 + Math.sin(time * 0.07 + ch) * 1.5) * h;
        s += (A.delta / h) * asym * Math.sin(2 * Math.PI * f * time + ch);
      }
      // theta
      for (let h = 1; h <= 2; h++) {
        const f = (6 + Math.sin(time * 0.09 + ch) * 1.5) * h;
        s += (A.theta / h) * asym * Math.sin(2 * Math.PI * f * time + ch);
      }
      // alpha (10 Hz Berger rhythm plus drift)
      s += A.alpha * alphaFactor * asym * Math.sin(2 * Math.PI * 10 * time);
      s +=
        A.alpha *
        0.3 *
        alphaFactor *
        asym *
        Math.sin(2 * Math.PI * (9 + Math.sin(time * 0.2) * 2) * time);
      // beta (low + high)
      s +=
        A.beta *
        0.7 *
        betaFactor *
        asym *
        Math.sin(2 * Math.PI * 17 * time);
      s +=
        A.beta *
        0.3 *
        betaFactor *
        asym *
        Math.sin(2 * Math.PI * 24 * time);
      // gamma (burst)
      const burst = Math.sin(2 * Math.PI * 0.2 * time) > 0.5 ? 1.0 : 0.3;
      s += A.gamma * burst * asym * Math.sin(2 * Math.PI * 40 * time);

      // noise + mains + breathing
      s += (Math.random() - 0.5) * 5;
      s += 0.5 * Math.sin(2 * Math.PI * this.opts.mainsHz * time);
      s += 3 * Math.sin(2 * Math.PI * 0.08 * time);
      s += 2 * Math.sin(2 * Math.PI * 0.25 * time);

      channels.push(s * this.opts.amplitudeScale);
    }
    return channels;
  }

  private generateBandPowers(): { absolute: BandPowers; relative: BandPowers } {
    const w = this.currentWeights();
    const time = Date.now() / 1000;
    const wobble = (freq: number, offset = 0) =>
      0.5 + 0.4 * Math.sin(2 * Math.PI * freq * time + offset);

    const raw = {
      delta: w.delta * (0.8 + wobble(0.05, 0) * 0.4),
      theta: w.theta * (0.8 + wobble(0.08, 1) * 0.4),
      alpha: w.alpha * (0.8 + wobble(0.12, 2) * 0.4),
      beta: w.beta * (0.8 + wobble(0.15, 3) * 0.4),
      gamma: w.gamma * (0.8 + wobble(0.1, 4) * 0.4),
    };
    const sum =
      raw.delta + raw.theta + raw.alpha + raw.beta + raw.gamma || 1;
    const rel: BandPowers = {
      delta: raw.delta / sum,
      theta: raw.theta / sum,
      alpha: raw.alpha / sum,
      beta: raw.beta / sum,
      gamma: raw.gamma / sum,
    };
    const toDb = (r: number, drift: number) =>
      -10 + r * 20 + (wobble(0.07, drift) - 0.5) * 2;
    const abs: BandPowers = {
      delta: toDb(rel.delta, 0),
      theta: toDb(rel.theta, 1),
      alpha: toDb(rel.alpha, 2),
      beta: toDb(rel.beta, 3),
      gamma: toDb(rel.gamma, 4),
    };
    return { absolute: abs, relative: rel };
  }

  private generateMotion(
    sensor: "accel" | "gyro" | "ppg" | "fnirs",
    time: number,
  ): number[] {
    if (sensor === "accel") {
      return [
        Math.sin(2 * Math.PI * 0.5 * time) * 0.3 + (Math.random() - 0.5) * 0.1,
        Math.sin(2 * Math.PI * 0.7 * time) * 0.3 + (Math.random() - 0.5) * 0.1,
        0.98 + Math.sin(2 * Math.PI * 0.3 * time) * 0.05,
      ];
    }
    if (sensor === "gyro") {
      return [
        Math.sin(2 * Math.PI * 0.3 * time) * 5 + (Math.random() - 0.5) * 2,
        Math.cos(2 * Math.PI * 0.4 * time) * 5 + (Math.random() - 0.5) * 2,
        Math.sin(2 * Math.PI * 0.2 * time) * 3 + (Math.random() - 0.5) * 1,
      ];
    }
    if (sensor === "fnirs") {
      const slow = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.035 * time);
      const breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.09 * time + 0.8);
      return [
        0.25 + slow * 0.55 + (Math.random() - 0.5) * 0.015,
        0.20 + breath * 0.50 + (Math.random() - 0.5) * 0.015,
        0.15 + (1 - slow) * 0.45 + (Math.random() - 0.5) * 0.015,
      ];
    }
    // ppg — simulated red/green/IR with heart-rate modulation at 72 BPM
    const bpm = 72;
    const hr = bpm / 60;
    const pulse = Math.max(0, Math.sin(2 * Math.PI * hr * time));
    return [
      60000 + pulse * 5000,
      58000 + pulse * 4500,
      62000 + pulse * 5500,
    ];
  }

  /**
   * MuseIO-compatible log-PSD vectors: 129 bins, 0–110 Hz, ~10 Hz with
   * `bandRate`. Hamming window, 256-point FFT (Mind Monitor discrete view).
   */
  private buildMindMonitorRawFftOsc(): OscMsg[] {
    const p = this.opts.oscPrefix;
    const out: OscMsg[] = [];
    const n = MIND_MONITOR_FFT_SIZE;
    for (let ch = 0; ch < 4; ch++) {
      const buf = this.fftRing[ch];
      if (buf.length < n) continue;
      const tail = buf.slice(-n);
      const res = computePSD(tail, this.opts.sampleRate, {
        targetN: n,
        window: "hamming",
      });
      if (!res) continue;
      const bins = resamplePsdToMindMonitorBins(res.psdDb, res.freqs);
      out.push({
        address: `${p}/elements/raw_fft${ch}`,
        args: bins,
      });
    }
    return out;
  }

  private buildBandOscMessages(
    absolute: BandPowers,
    relative: BandPowers,
    traces: Record<BandName, number[]> | null,
  ): OscMsg[] {
    const p = this.opts.oscPrefix;
    const bands: BandName[] = ["delta", "theta", "alpha", "beta", "gamma"];
    const absArr = bands.map((b) => absolute[b]);
    const relArr = bands.map((b) => relative[b]);

    const msgs: OscMsg[] = [
      // Muse-compatible combined arrays
      { address: `${p}/bands/absolute`, args: absArr },
      { address: `${p}/bands/relative`, args: relArr },
    ];

    // Per-band addresses: elements/* use four floats (TP9, AF7, AF8, TP10).
    for (const b of bands) {
      const row = traces?.[b];
      msgs.push(
        { address: `${p}/bands/absolute/${b}`, args: [absolute[b]] },
        { address: `${p}/bands/relative/${b}`, args: [relative[b]] },
        {
          address: `${p}/elements/${b}_absolute`,
          args: elementsBandAbsoluteArgs(b, absolute, row),
        },
        {
          address: `${p}/elements/${b}_relative`,
          args: elementsBandRelativeArgs(b, relative, row),
        },
      );
    }
    return msgs;
  }
}

export { CHANNELS };
