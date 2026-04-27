import type { BandPowers } from "./types";
import type { ResearchEyesContext } from "./researchTypes";

export type ResearchArtifactFlag = {
  id: string;
  label: string;
  detail: string;
  severity: "info" | "warn";
};

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function computeResearchArtifactFlags(input: {
  rollingRaw: number[][];
  latestBandsRel: BandPowers | null;
  motionAccel: number[] | null;
  /** When false (e.g. Ganglion), motion-based flags are skipped — IMU not on device. */
  expectImu?: boolean;
  /** Per-channel labels for flags (Muse TP9… or Ganglion Ch1…). */
  channelLabels?: [string, string, string, string];
  mindMonitorBlink: boolean | null;
  mindMonitorJaw: boolean | null;
  eyesContext: ResearchEyesContext;
}): ResearchArtifactFlag[] {
  const out: ResearchArtifactFlag[] = [];
  const {
    rollingRaw,
    latestBandsRel,
    motionAccel,
    expectImu = true,
    channelLabels = ["TP9", "AF7", "AF8", "TP10"],
    mindMonitorBlink,
    mindMonitorJaw,
    eyesContext,
  } = input;

  const SAT = 2000;
  const FLAT_UV = 0.35;
  const STEP_UV = 220;
  const WIN = 96;

  for (let ch = 0; ch < 4; ch++) {
    const buf = rollingRaw[ch] ?? [];
    const tail = buf.slice(-WIN);
    if (tail.length < 16) continue;
    const name = channelLabels[ch];
    if (tail.some((v) => Math.abs(v) >= SAT)) {
      out.push({
        id: `sat_${ch}`,
        label: `Saturation / clip (${name})`,
        detail: `Sample magnitude ≥ ${SAT} µV in recent window.`,
        severity: "warn",
      });
    }
    if (stdev(tail) < FLAT_UV) {
      out.push({
        id: `flat_${ch}`,
        label: `Flatline risk (${name})`,
        detail: `σ < ${FLAT_UV} µV over last ${tail.length} samples (check contact).`,
        severity: "info",
      });
    }
    const a = tail[tail.length - 1];
    const b = tail[tail.length - 2];
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > STEP_UV) {
      out.push({
        id: `step_${ch}`,
        label: `Step artifact (${name})`,
        detail: `Single-step Δ > ${STEP_UV} µV (movement / loose wire).`,
        severity: "warn",
      });
    }
  }

  if (latestBandsRel) {
    const g = latestBandsRel.gamma ?? 0;
    const b = latestBandsRel.beta ?? 0;
    const den =
      (latestBandsRel.delta ?? 0) +
      (latestBandsRel.theta ?? 0) +
      (latestBandsRel.alpha ?? 0) +
      (latestBandsRel.beta ?? 0) +
      (latestBandsRel.gamma ?? 0) ||
      1;
    const emgShare = (g + 0.35 * b) / den;
    if (emgShare > 0.42) {
      out.push({
        id: "jaw_emg",
        label: "Jaw / EMG proxy",
        detail: "High γ+β share of relative power (muscle / clench).",
        severity: "warn",
      });
    }

    const d = latestBandsRel.delta ?? 0;
    const t = latestBandsRel.theta ?? 0;
    const a = latestBandsRel.alpha ?? 0;
    if (d + t > 0.55 && a < 0.12) {
      out.push({
        id: "blink_surrogate",
        label: "Blink / slow-wave surrogate",
        detail: "High δ+θ with suppressed α (rule-based, not EOG).",
        severity: "info",
      });
    }
  }

  if (mindMonitorBlink === true) {
    out.push({
      id: "mm_blink",
      label: "Mind Monitor blink flag",
      detail: "Device / OSC reported blink.",
      severity: "info",
    });
  }
  if (mindMonitorJaw === true) {
    out.push({
      id: "mm_jaw",
      label: "Mind Monitor jaw flag",
      detail: "Device / OSC reported jaw clench.",
      severity: "info",
    });
  }

  const mov =
    expectImu && motionAccel?.length === 3
      ? Math.hypot(motionAccel[0] ?? 0, motionAccel[1] ?? 0, (motionAccel[2] ?? 0) - 1)
      : 0;
  if (expectImu && mov > 0.55) {
    out.push({
      id: "motion",
      label: "Motion load",
      detail: `Accelerometer magnitude ~${mov.toFixed(2)} (artifact risk).`,
      severity: "warn",
    });
  }

  if (eyesContext === "open" && latestBandsRel && (latestBandsRel.alpha ?? 0) > 0.38) {
    out.push({
      id: "alpha_open",
      label: "α vs eyes-open context",
      detail: "High relative α while tagged eyes open — rule-based context check.",
      severity: "info",
    });
  }
  if (eyesContext === "closed" && latestBandsRel && (latestBandsRel.alpha ?? 0) < 0.07) {
    out.push({
      id: "alpha_closed_low",
      label: "Low α vs eyes-closed context",
      detail: "Low relative α while tagged eyes closed — check tags or drowsiness.",
      severity: "info",
    });
  }

  return out;
}
