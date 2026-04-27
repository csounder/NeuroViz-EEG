"use client";

// Client-side calibration controller.
//
// Runs entirely in the browser — does NOT touch the server's calibration
// endpoints — so the live EEG feed keeps flowing and displays keep animating
// while we record the user's baseline.
//
// Flow (default 90 s total):
//   • Start chime  → big breathing circle appears
//   • Breath cycle: inhale 4 s (circle grows) → exhale 6 s (circle shrinks)
//   • Samples:     pulled from the zustand store every bandPowers tick
//   • End chime    → mean + std computed per band, DSP baseline seeded

import { useNeuroStore } from "./store";
import { dsp } from "./dspPipeline";
import { BAND_NAMES, type BandName, type BandPowers } from "./types";
import {
  beep,
  endChime,
  exhaleCue,
  inhaleCue,
  startChime,
} from "./beep";

export type BreathPhase = "inhale" | "exhale";

export interface CalibrationBaseline {
  timestamp: number;
  samples: number;
  durationSec: number;
  bandsRelative: Record<BandName, { mean: number; std: number }>;
  bandsAbsolute: Record<BandName, { mean: number; std: number }>;
}

const STORAGE_KEY = "neurovis.calibration.baseline.v1";
const DEFAULT_DURATION_SEC = 90;
const INHALE_SEC = 4;
const EXHALE_SEC = 6;
const BREATH_CYCLE_SEC = INHALE_SEC + EXHALE_SEC;

type Listener = (session: CalibrationSessionState) => void;

export interface CalibrationSessionState {
  running: boolean;
  totalSec: number;
  elapsedSec: number;
  remainingSec: number;
  progress: number; // 0..1
  samples: number;
  phase: BreathPhase;
  phaseSecondsLeft: number;
  phaseProgress: number; // 0..1 within the current phase
  cycle: number; // 1-based breath cycle count
  /** Human-readable cue — shown under the breathing circle. */
  cue: string;
  baseline: CalibrationBaseline | null;
}

/** React SSR / first client paint — no `localStorage` (avoids hydration mismatch vs `readStoredBaseline()`). */
export const CALIBRATION_STATE_HYDRATION_SAFE: CalibrationSessionState = {
  running: false,
  totalSec: DEFAULT_DURATION_SEC,
  elapsedSec: 0,
  remainingSec: DEFAULT_DURATION_SEC,
  progress: 0,
  samples: 0,
  phase: "inhale",
  phaseSecondsLeft: INHALE_SEC,
  phaseProgress: 0,
  cycle: 1,
  cue: "Close your eyes and settle",
  baseline: null,
};

class Calibration {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickInterval = 50; // ms
  private startedAt = 0;
  private totalMs = DEFAULT_DURATION_SEC * 1000;
  private samplesRel: BandPowers[] = [];
  private samplesAbs: BandPowers[] = [];
  private lastPhase: BreathPhase = "inhale";

  state: CalibrationSessionState = {
    running: false,
    totalSec: DEFAULT_DURATION_SEC,
    elapsedSec: 0,
    remainingSec: DEFAULT_DURATION_SEC,
    progress: 0,
    samples: 0,
    phase: "inhale",
    phaseSecondsLeft: INHALE_SEC,
    phaseProgress: 0,
    cycle: 1,
    cue: "Close your eyes and settle",
    baseline: readStoredBaseline(),
  };

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  start(durationSec = DEFAULT_DURATION_SEC) {
    if (this.state.running) return;
    this.totalMs = Math.max(10, durationSec) * 1000;
    this.startedAt = Date.now();
    this.samplesRel = [];
    this.samplesAbs = [];
    this.lastPhase = "inhale";

    this.state = {
      ...this.state,
      running: true,
      totalSec: durationSec,
      elapsedSec: 0,
      remainingSec: durationSec,
      progress: 0,
      samples: 0,
      phase: "inhale",
      phaseSecondsLeft: INHALE_SEC,
      phaseProgress: 0,
      cycle: 1,
      cue: "Settle in · close your eyes",
    };
    this.emit();

    // Audio: two-note start chime
    startChime();

    // First inhale cue (slightly delayed so it follows the chime)
    setTimeout(() => inhaleCue(), 500);

    // Also push the existing store flag so the top bar / other widgets know.
    useNeuroStore.getState().setSettings({
      calibrating: true,
    } as any);

    this.timer = setInterval(() => this.tick(), this.tickInterval);
  }

  stop(reason: "complete" | "cancelled" = "cancelled") {
    if (!this.state.running) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    if (reason === "complete") {
      const baseline = this.computeBaseline();
      if (baseline) {
        writeStoredBaseline(baseline);
        this.seedDsp(baseline);
        this.state.baseline = baseline;
      }
      endChime();
      this.state = {
        ...this.state,
        running: false,
        elapsedSec: this.state.totalSec,
        remainingSec: 0,
        progress: 1,
        cue: "Calibration complete — open your eyes",
      };
    } else {
      // Short double tick to signal a cancel
      beep(330, 0.12, 0.18);
      setTimeout(() => beep(220, 0.18, 0.18), 150);
      this.state = {
        ...this.state,
        running: false,
        cue: "Calibration cancelled",
      };
    }

    useNeuroStore.getState().setSettings({
      calibrating: false,
    } as any);
    this.emit();
  }

  clearBaseline() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    dsp.resetBaseline();
    this.state = { ...this.state, baseline: null };
    this.emit();
  }

  private tick() {
    const now = Date.now();
    const elapsedMs = now - this.startedAt;
    const elapsedSec = elapsedMs / 1000;
    const totalSec = this.totalMs / 1000;
    const progress = Math.min(1, elapsedSec / totalSec);

    // Breath cycle bookkeeping
    const cycleSec = elapsedSec % BREATH_CYCLE_SEC;
    const phase: BreathPhase = cycleSec < INHALE_SEC ? "inhale" : "exhale";
    const phaseStart = phase === "inhale" ? 0 : INHALE_SEC;
    const phaseDur = phase === "inhale" ? INHALE_SEC : EXHALE_SEC;
    const phaseSecondsLeft = Math.max(
      0,
      phaseDur - (cycleSec - phaseStart),
    );
    const phaseProgress = Math.min(1, (cycleSec - phaseStart) / phaseDur);
    const cycle = Math.floor(elapsedSec / BREATH_CYCLE_SEC) + 1;

    // Edge-trigger audio cues on phase transitions
    if (phase !== this.lastPhase) {
      if (phase === "inhale") inhaleCue();
      else exhaleCue();
      this.lastPhase = phase;
    }

    // Sample the latest band powers from the store
    const { latestBandsRel, latestBandsAbs } = useNeuroStore.getState();
    if (latestBandsRel) this.samplesRel.push(latestBandsRel);
    if (latestBandsAbs) this.samplesAbs.push(latestBandsAbs);

    const cue = makeCue(phase, cycle, elapsedSec, totalSec);

    this.state = {
      ...this.state,
      elapsedSec,
      remainingSec: Math.max(0, totalSec - elapsedSec),
      progress,
      samples: this.samplesRel.length,
      phase,
      phaseSecondsLeft,
      phaseProgress,
      cycle,
      cue,
    };
    this.emit();

    if (progress >= 1) {
      this.stop("complete");
    }
  }

  private computeBaseline(): CalibrationBaseline | null {
    if (this.samplesRel.length < 10) return null;
    const bandsRel = summarize(this.samplesRel);
    const bandsAbs = summarize(
      this.samplesAbs.length ? this.samplesAbs : this.samplesRel,
    );
    return {
      timestamp: Date.now(),
      samples: this.samplesRel.length,
      durationSec: this.totalMs / 1000,
      bandsRelative: bandsRel,
      bandsAbsolute: bandsAbs,
    };
  }

  private seedDsp(baseline: CalibrationBaseline) {
    // Populate the DSP pipeline's rolling baseline so z-score is meaningful
    // immediately when the user enables it.
    for (const band of BAND_NAMES) {
      const summary = baseline.bandsAbsolute[band];
      if (!summary) continue;
      // Expand mean±std into a synthetic sample set at the size of the
      // baseline window (enough to stabilise z-score).
      dsp.seedBaseline("ALL", band, summary.mean, summary.std);
    }
  }
}

function summarize(
  samples: BandPowers[],
): Record<BandName, { mean: number; std: number }> {
  const out = {} as Record<BandName, { mean: number; std: number }>;
  for (const band of BAND_NAMES) {
    let sum = 0;
    for (const s of samples) sum += s[band] ?? 0;
    const mean = sum / samples.length;
    let vsum = 0;
    for (const s of samples) {
      const d = (s[band] ?? 0) - mean;
      vsum += d * d;
    }
    const std = Math.sqrt(vsum / samples.length);
    out[band] = { mean, std };
  }
  return out;
}

function makeCue(
  phase: BreathPhase,
  cycle: number,
  elapsedSec: number,
  totalSec: number,
): string {
  if (elapsedSec < 2) return "Settle in · close your eyes";
  if (totalSec - elapsedSec < 2) return "Open your eyes gently";
  if (phase === "inhale") {
    return cycle === 1 ? "Breathe in · 4 s" : "Inhale · 4 s";
  }
  return "Exhale · 6 s";
}

function readStoredBaseline(): CalibrationBaseline | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CalibrationBaseline;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.bandsRelative &&
      parsed.bandsAbsolute
    ) {
      return parsed;
    }
  } catch {}
  return null;
}

function writeStoredBaseline(b: CalibrationBaseline) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {}
}

export const calibration = new Calibration();
export { DEFAULT_DURATION_SEC, INHALE_SEC, EXHALE_SEC };
