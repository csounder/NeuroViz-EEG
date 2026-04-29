/**
 * Dual rehearsal — emulate two performers (e.g. Amy vs you) on one laptop by
 * synthesizing two distinct band-power streams from simulator profiles, then
 * merging into the main NeuroVis feed per "driver" selection.
 *
 * Does not run full 256 Hz EEG + DSP (would fight shared dsp/bandFilters).
 * Band powers + lightweight traces + coarse raw µV keep Concert/charts usable.
 */

import { SIM_PROFILES, type SimProfile } from "./simulator";
import { useNeuroStore } from "./store";
import type { BandName, BandPowers } from "./types";
import { BAND_NAMES } from "./types";

let timer: ReturnType<typeof setInterval> | null = null;
let t0 = 0;

function wobble(freq: number, time: number, phaseOff: number) {
  return 0.5 + 0.4 * Math.sin(2 * Math.PI * freq * time + phaseOff);
}

/** Mirror of BrowserEEGSimulator.generateBandPowers with distinct phase per persona. */
export function participantBandPowers(
  profile: SimProfile,
  timeSec: number,
  seed: number,
): { absolute: BandPowers; relative: BandPowers } {
  const w = SIM_PROFILES[profile];
  const raw = {
    delta: w.delta * (0.8 + wobble(0.05, timeSec, 0 + seed) * 0.4),
    theta: w.theta * (0.8 + wobble(0.08, timeSec, 1 + seed * 1.1) * 0.4),
    alpha: w.alpha * (0.8 + wobble(0.12, timeSec, 2 + seed * 0.9) * 0.4),
    beta: w.beta * (0.8 + wobble(0.15, timeSec, 3 + seed * 1.2) * 0.4),
    gamma: w.gamma * (0.8 + wobble(0.1, timeSec, 4 + seed * 0.85) * 0.4),
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
    -10 + r * 20 + (wobble(0.07, timeSec, drift + seed * 0.3) - 0.5) * 2;
  const abs: BandPowers = {
    delta: toDb(rel.delta, 0),
    theta: toDb(rel.theta, 1),
    alpha: toDb(rel.alpha, 2),
    beta: toDb(rel.beta, 3),
    gamma: toDb(rel.gamma, 4),
  };
  return { absolute: abs, relative: rel };
}

function mergeRelative(a: BandPowers, b: BandPowers): BandPowers {
  const out = {} as BandPowers;
  for (const k of BAND_NAMES) {
    out[k] = (a[k] + b[k]) / 2;
  }
  const s =
    out.delta + out.theta + out.alpha + out.beta + out.gamma || 1;
  for (const k of BAND_NAMES) out[k] = out[k] / s;
  return out;
}

function mergeAbsolute(a: BandPowers, b: BandPowers): BandPowers {
  const out = {} as BandPowers;
  for (const k of BAND_NAMES) out[k] = (a[k] + b[k]) / 2;
  return out;
}

/** Approximate multichannel band traces for visualization (not DSP-accurate). */
function syntheticBandTraces(rel: BandPowers, timeSec: number, seed: number) {
  const out = {} as Record<BandName, number[]>;
  for (const band of BAND_NAMES) {
    const base = rel[band];
    const row: number[] = [];
    for (let ch = 0; ch < 4; ch += 1) {
      const asym = ch < 2 ? 1 : 1.08;
      row.push(
        base *
          asym *
          (14 +
            10 *
              Math.sin(
                2 * Math.PI * (1.2 + ch * 0.4) * timeSec + seed + ch,
              )) *
          (0.85 +
            0.15 * Math.sin(2 * Math.PI * 6 * timeSec + band.length)),
      );
    }
    out[band] = row;
  }
  return out;
}

function syntheticRaw(rel: BandPowers, timeSec: number, seed: number): number[] {
  const chs: number[] = [];
  for (let ch = 0; ch < 4; ch += 1) {
    let s = 0;
    for (const band of BAND_NAMES) {
      const f =
        band === "delta"
          ? 2
          : band === "theta"
            ? 5
            : band === "alpha"
              ? 10
              : band === "beta"
                ? 18
                : 35;
      s +=
        rel[band] *
        (18 + ch * 4) *
        Math.sin(2 * Math.PI * f * timeSec * (1 + ch * 0.02) + seed + ch * 1.7);
    }
    chs.push(s + Math.sin(2 * Math.PI * 0.08 * timeSec + seed) * 4);
  }
  return chs;
}

function tick() {
  const st = useNeuroStore.getState().dualRehearsal;
  if (!st.enabled) return;
  const now = Date.now() / 1000;
  const elapsed = (Date.now() - t0) / 1000;

  const amy = participantBandPowers(st.amyProfile, now, 11);
  const slf = participantBandPowers(st.selfProfile, now, 97);

  let rel: BandPowers;
  let abs: BandPowers;
  let traceSeed = 11;
  let label = "Dual rehearsal";

  if (st.driver === "blend") {
    rel = mergeRelative(amy.relative, slf.relative);
    abs = mergeAbsolute(amy.absolute, slf.absolute);
    traceSeed = 54;
    label = "Dual rehearsal · blend";
  } else if (st.driver === "alternate") {
    const period = Math.max(2, st.alternatePeriodSec);
    const amyTurn = Math.floor(elapsed / period) % 2 === 0;
    rel = amyTurn ? amy.relative : slf.relative;
    abs = amyTurn ? amy.absolute : slf.absolute;
    traceSeed = amyTurn ? 11 : 97;
    label = amyTurn ? "Dual rehearsal · Amy" : "Dual rehearsal · You";
  } else if (st.driver === "amy") {
    rel = amy.relative;
    abs = amy.absolute;
    traceSeed = 11;
    label = "Dual rehearsal · Amy";
  } else {
    rel = slf.relative;
    abs = slf.absolute;
    traceSeed = 97;
    label = "Dual rehearsal · You";
  }

  const traces = syntheticBandTraces(rel, now, traceSeed);
  const raw = syntheticRaw(rel, now, traceSeed);

  useNeuroStore.getState().feedSimBands(abs, rel);
  useNeuroStore.getState().feedSimBandTraces(traces);
  useNeuroStore.getState().feedSimEEG(raw);

  useNeuroStore.setState({
    deviceName: label,
    dualRehearsal: {
      ...useNeuroStore.getState().dualRehearsal,
      lastDriverLabel: label,
    },
  });
}

export function isDualRehearsalRunning(): boolean {
  return timer !== null;
}

export function stopDualRehearsal(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const st = useNeuroStore.getState().dualRehearsal;
  if (st.enabled) {
    useNeuroStore.setState({
      dualRehearsal: {
        ...st,
        enabled: false,
        lastDriverLabel: "",
      },
      deviceName: null,
    });
  }
}

export function startDualRehearsal(): void {
  stopDualRehearsal();
  const st = useNeuroStore.getState().dualRehearsal;
  useNeuroStore.setState({
    dualRehearsal: {
      ...st,
      enabled: true,
    },
  });
  t0 = Date.now();
  tick();
  timer = setInterval(tick, 100);
}
