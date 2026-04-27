import type { BandName } from "./types";
import type { ResearchEventLog, ResearchStreamSample } from "./researchTypes";

const CHAN_NAMES = ["TP9", "AF7", "AF8", "TP10"] as const;

/**
 * Bin-aligned event-related average of µV (or processed) streams.
 * `tMs` is time relative to each event (0 = event).
 */
export function computeEventLockedMeanEeg(
  timeline: ResearchStreamSample[],
  events: ResearchEventLog[],
  filterLabel: string | null,
  preMs: number,
  postMs: number,
  binMs: number,
  opts?: { baselineEndMs?: number },
): { tMs: number[]; mean: number[][]; nEpochs: number; channelNames: readonly string[] } | null {
  const evs = filterLabel ? events.filter((e) => e.label === filterLabel) : events;
  if (evs.length === 0 || timeline.length < 2) return null;

  const half = binMs / 2;
  const tMs: number[] = [];
  for (let t = -preMs; t <= postMs + 1e-6; t += binMs) tMs.push(Math.round(t));

  const baselineEnd = opts?.baselineEndMs ?? 0;
  const useBaseline = baselineEnd > 0 && preMs > baselineEnd + 50;

  const sum: number[][] = tMs.map(() => [0, 0, 0, 0]);
  const cnt: number[] = tMs.map(() => 0);

  for (const ev of evs) {
    const slice = timeline.filter(
      (s) => s.wallMs >= ev.wallMs - preMs - binMs && s.wallMs <= ev.wallMs + postMs + binMs,
    );
    if (slice.length === 0) continue;

    let base: number[] = [0, 0, 0, 0];
    if (useBaseline) {
      const bLo = ev.wallMs - preMs;
      const bHi = ev.wallMs - baselineEnd;
      const bslice = slice.filter((s) => s.wallMs >= bLo && s.wallMs <= bHi);
      if (bslice.length >= 2) {
        for (let ch = 0; ch < 4; ch++) {
          const xs = bslice.map((s) => s.eeg[ch]).filter((v) => Number.isFinite(v));
          base[ch] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
        }
      }
    }

    for (let i = 0; i < tMs.length; i++) {
      const target = ev.wallMs + tMs[i];
      let best: ResearchStreamSample | null = null;
      let bestD = Infinity;
      for (const s of slice) {
        const d = Math.abs(s.wallMs - target);
        if (d <= half && d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!best) continue;
      cnt[i]++;
      for (let ch = 0; ch < 4; ch++) {
        const v = best.eeg[ch] - (useBaseline ? base[ch] : 0);
        sum[i][ch] += v;
      }
    }
  }

  const mean: number[][] = tMs.map((_, i) =>
    cnt[i] > 0 ? sum[i].map((s) => s / cnt[i]) : [NaN, NaN, NaN, NaN],
  );
  const validBins = cnt.filter((c) => c > 0).length;
  if (validBins < 2) return null;

  return { tMs, mean, nEpochs: evs.length, channelNames: CHAN_NAMES };
}

/** Event-locked mean of one relative band (0–1 share), baseline-subtracted if requested. */
export function computeEventLockedMeanBand(
  timeline: ResearchStreamSample[],
  events: ResearchEventLog[],
  filterLabel: string | null,
  band: BandName,
  preMs: number,
  postMs: number,
  binMs: number,
  opts?: { baselineEndMs?: number },
): { tMs: number[]; mean: number[]; nEpochs: number } | null {
  const evs = filterLabel ? events.filter((e) => e.label === filterLabel) : events;
  if (evs.length === 0 || timeline.length < 2) return null;

  const half = binMs / 2;
  const tMs: number[] = [];
  for (let t = -preMs; t <= postMs + 1e-6; t += binMs) tMs.push(Math.round(t));

  const baselineEnd = opts?.baselineEndMs ?? 0;
  const useBaseline = baselineEnd > 0 && preMs > baselineEnd + 50;

  const sum = tMs.map(() => 0);
  const cnt = tMs.map(() => 0);

  for (const ev of evs) {
    const slice = timeline.filter(
      (s) => s.wallMs >= ev.wallMs - preMs - binMs && s.wallMs <= ev.wallMs + postMs + binMs,
    );
    if (slice.length === 0) continue;

    let base = 0;
    if (useBaseline) {
      const bLo = ev.wallMs - preMs;
      const bHi = ev.wallMs - baselineEnd;
      const bslice = slice.filter((s) => s.wallMs >= bLo && s.wallMs <= bHi && s.bandsRel);
      const vals = bslice.map((s) => s.bandsRel![band]).filter((v) => Number.isFinite(v));
      base = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }

    for (let i = 0; i < tMs.length; i++) {
      const target = ev.wallMs + tMs[i];
      let best: ResearchStreamSample | null = null;
      let bestD = Infinity;
      for (const s of slice) {
        if (!s.bandsRel) continue;
        const d = Math.abs(s.wallMs - target);
        if (d <= half && d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!best?.bandsRel) continue;
      const v = best.bandsRel[band];
      if (!Number.isFinite(v)) continue;
      cnt[i]++;
      sum[i] += v - (useBaseline ? base : 0);
    }
  }

  const mean = tMs.map((_, i) => (cnt[i] > 0 ? sum[i] / cnt[i] : NaN));
  if (cnt.filter((c) => c > 0).length < 2) return null;
  return { tMs, mean, nEpochs: evs.length };
}
