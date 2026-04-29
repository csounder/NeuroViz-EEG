"use client";

// Module-level singleton controller for the browser-side EEG simulator.
//
// DESIGN: We deliberately keep the simulator alive independent of any React
// component's mount lifecycle — navigating from /simulator to /fft must NOT
// stop the stream. That's why this lives at module scope rather than inside
// a hook.
//
// The only things this module touches on React's side are:
//   - zustand store setters (to feed rollingRaw, bands, motion, and to mirror
//     run state / counters on `clientSim`), and
//   - the WebSocket `wsSend` singleton (to relay outbound OSC to UDP).

import { useNeuroStore, resetBandFilterStreamEstimator } from "./store";
import { stopDualRehearsal } from "./dualRehearsalSim";
import {
  BrowserEEGSimulator,
  DEFAULT_SIM_OPTIONS,
  type SimProfile,
  type SimulatorOptions,
} from "./simulator";
import type { BandPowers } from "./types";
import { wsSend } from "./useWebSocket";
import { recorder } from "./recorder";
import { dsp } from "./dspPipeline";
import { classifyBrainState } from "./utils";

let sim: BrowserEEGSimulator | null = null;
let packetCount = 0;
let lastStatusPushAt = 0;
let lastRelayActive = false;

function ensureSim(): BrowserEEGSimulator {
  if (sim) return sim;
  sim = new BrowserEEGSimulator({
    oscSend: (msgs) => {
      wsSend({ type: "osc_send", msgs });
      lastRelayActive = msgs.length > 0;
    },
    onEEG: (raw) => {
      useNeuroStore.getState().feedSimEEG(raw);
      if (recorder.status().recording) {
        const n = recorder.getActiveEegChannelCount();
        const row = Array.from({ length: n }, (_, i) => Number(raw[i]) || 0);
        recorder.pushEEGSample(row, dsp.lastArtifact ? 1 : 0);
      }
    },
    onBandTraces: (perBand) => {
      // Feeds the Mind-Monitor-style multichannel-per-band + combined-bands
      // views. Populated at wsTickRate with the latest filtered snapshot
      // from the 5×4 bandpass bank (run at native 256 Hz in the sim loop).
      useNeuroStore.getState().feedSimBandTraces(perBand);
    },
    onBandPowers: (abs, rel) => {
      useNeuroStore.getState().feedSimBands(abs, rel);
      if (recorder.status().recording) {
        recorder.pushBands(abs, rel, classifyBrainState(rel));
      }
    },
    onMotion: (sensor, values) => {
      useNeuroStore.getState().feedSimMotion(sensor, values);
      if (recorder.status().recording) {
        recorder.pushMotion(sensor, values);
      }
    },
    onPacket: () => {
      packetCount += 1;
      // Throttle status flushes into the store to ~10 Hz so the sim running
      // at 256 Hz doesn't trash render performance.
      const now = Date.now();
      if (now - lastStatusPushAt < 100) return;
      lastStatusPushAt = now;
      useNeuroStore.getState().setClientSim({
        packetsSent: packetCount,
        oscRelayActive: lastRelayActive,
      });
    },
  });
  return sim;
}

export const clientSim = {
  DEFAULTS: DEFAULT_SIM_OPTIONS,

  isRunning(): boolean {
    return Boolean(sim?.isRunning);
  },

  start() {
    const s = ensureSim();
    if (s.isRunning) return;
    stopDualRehearsal();
    resetBandFilterStreamEstimator();
    packetCount = 0;
    lastRelayActive = false;
    s.setOptions({
      sendMindMonitorRawFft: useNeuroStore.getState().mindMonitorMode,
    });
    s.start();
    useNeuroStore.getState().setClientSim({
      running: true,
      startedAt: Date.now(),
      packetsSent: 0,
      oscRelayActive: false,
    });
  },

  stop() {
    if (sim) sim.stop();
    useNeuroStore.setState({ latestBandTraces: null });
    useNeuroStore.getState().setClientSim({
      running: false,
      oscRelayActive: false,
    });
  },

  setProfile(p: SimProfile) {
    ensureSim().setProfile(p);
    useNeuroStore
      .getState()
      .setClientSim({ profile: p, manualBands: null });
  },

  setManualBands(b: BandPowers | null) {
    ensureSim().setManualBands(b);
    useNeuroStore.getState().setClientSim({ manualBands: b });
  },

  setOptions(patch: Partial<SimulatorOptions>) {
    ensureSim().setOptions(patch);
  },

  /** Restart the sim (useful after changing sample/band/motion rates). */
  restart() {
    const s = sim;
    if (!s) return;
    const wasRunning = s.isRunning;
    s.stop();
    if (wasRunning) s.start();
  },
};
