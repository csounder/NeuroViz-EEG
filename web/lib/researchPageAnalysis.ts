import { buildContactQuality } from "./researchContactQuality";
import type { BandName } from "./types";
import { BAND_NAMES } from "./types";

export type PpgSample = { t: number; values: number[] };

export type FnirsSample = { t: number; values: number[]; motionMag?: number };

export type BandsSnapshot = {
  absolute: Record<BandName, number>;
  relative: Record<BandName, number>;
  timestamp: number;
  source?: string;
};

export type BandsApiResponse = {
  values?: number[][];
  absolute?: Partial<Record<BandName, number>>;
  relative?: Partial<Record<BandName, number>>;
  available?: boolean;
  timestamp?: number | null;
};

const emptyPpgMetrics = {
  bpm: null as number | null,
  beats: [] as number[],
  beatActive: false,
  channel: 0,
  range: 0,
  intervals: [] as number[],
  rmssd: null as number | null,
  sdnn: null as number | null,
  quality: "Waiting" as string,
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) / (values.length - 1));
}

export function analyzePpgSamples(samples: PpgSample[]) {
  const recent = samples.slice(-180);
  const channelCount = Math.max(1, ...recent.map((sample) => sample.values.length));
  let channel = 0;
  let bestRange = 0;
  for (let ch = 0; ch < channelCount; ch++) {
    const values = recent.map((sample) => sample.values[ch]).filter((value) => Number.isFinite(value));
    if (values.length < 4) continue;
    const range = Math.max(...values) - Math.min(...values);
    if (range > bestRange) {
      bestRange = range;
      channel = ch;
    }
  }

  const points = recent
    .map((sample) => ({ t: sample.t, value: sample.values[channel] }))
    .filter((point) => Number.isFinite(point.value));
  if (points.length < 8 || bestRange <= 0) {
    return { ...emptyPpgMetrics, channel, range: bestRange };
  }

  const values = points.map((point) => point.value);
  const avg = mean(values);
  const centered = values.map((value) => value - avg);
  const maxAbs = Math.max(1e-9, ...centered.map((value) => Math.abs(value)));
  const normalized = centered.map((value) => value / maxAbs);
  const beats: number[] = [];
  for (let i = 1; i < normalized.length - 1; i++) {
    const isPeak =
      normalized[i] > 0.25 &&
      normalized[i] >= normalized[i - 1] &&
      normalized[i] > normalized[i + 1];
    const farEnough = !beats.length || points[i].t - beats[beats.length - 1] > 360;
    if (isPeak && farEnough) beats.push(points[i].t);
  }

  const intervals = beats
    .slice(1)
    .map((beat, index) => beat - beats[index])
    .filter((interval) => interval >= 430 && interval <= 1500);
  const avgInterval = intervals.length
    ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    : null;
  const successiveDiffs = intervals.slice(1).map((interval, index) => interval - intervals[index]);
  const rmssd = successiveDiffs.length
    ? Math.sqrt(successiveDiffs.reduce((sum, diff) => sum + diff * diff, 0) / successiveDiffs.length)
    : null;
  const sdnn = intervals.length > 1 ? standardDeviation(intervals) : null;
  const bpm = avgInterval ? 60000 / avgInterval : null;
  const beatActive = beats.length ? Date.now() - beats[beats.length - 1] < 180 : false;
  const quality = intervals.length >= 8 ? "Good" : intervals.length >= 3 ? "Short window" : "Calibrating";
  return { bpm, beats, beatActive, channel, range: bestRange, intervals, rmssd, sdnn, quality };
}

export function analyzeFnirs(samples: FnirsSample[]) {
  const recent = samples.filter((sample) => Date.now() - sample.t <= 60000);
  const latest = recent.at(-1)?.values ?? [];
  const hbo = latest[0] ?? 0;
  const hbr = latest[1] ?? 0;
  const hbt = latest[2] ?? hbo + hbr;
  const first = recent[0];
  const last = recent.at(-1);
  let slope = 0;
  if (first && last && last.t > first.t) {
    const firstMean = mean(first.values);
    const lastMean = mean(last.values);
    slope = ((lastMean - firstMean) / (last.t - first.t)) * 60000;
  }
  const trendLabel = Math.abs(slope) < 0.0005 ? "Flat" : slope > 0 ? "Rising" : "Falling";
  let deltaSum = 0;
  let deltaN = 0;
  for (const s of recent) {
    if (s.values.length >= 2) {
      deltaSum += s.values[0] - s.values[1];
      deltaN++;
    }
  }
  const deltaOpticalProxy = deltaN ? deltaSum / deltaN : 0;
  return { hbo, hbr, hbt, slope, trendLabel, deltaOpticalProxy };
}

export function inferSource(
  deviceName?: string | null,
  eegDeviceName?: string,
  simulatorMode?: boolean,
  mindMonitorMode?: boolean,
  oscAddressCount?: number,
) {
  const joined = `${deviceName ?? ""} ${eegDeviceName ?? ""}`.toLowerCase();
  if (simulatorMode || joined.includes("client sim")) return "Simulator";
  const bridgeLike = joined.includes("muse") || joined.includes("openbci");
  if (mindMonitorMode && (oscAddressCount ?? 0) > 0 && bridgeLike) return "Bridge + OSC (verify stack)";
  if (joined.includes("mind monitor")) return "Mind Monitor OSC :5000";
  if (bridgeLike) return "Direct Device / Bridge";
  return "No labeled source";
}

function rms(values: number[]) {
  if (!values.length) return undefined;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function accelMovement(values: number[]) {
  if (values.length < 3) return undefined;
  const x = values[0] ?? 0;
  const y = values[1] ?? 0;
  const z = (values[2] ?? 0) - 1;
  return Math.sqrt(x * x + y * y + z * z);
}

function ppgPulseFeature(values: number[]) {
  if (!values.length) return undefined;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.abs(avg) > 1000 ? (avg - 60000) / 7000 : avg;
}

export function magnitude(values: number[]) {
  if (!values.length) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

export function buildDecodedMuseStreams({
  latestEEG,
  rollingRaw,
  motion,
  latestBandsRel,
  mindMonitor,
  batteryPct,
}: {
  latestEEG: number[];
  rollingRaw: number[][];
  motion: {
    accel: number[] | null;
    gyro: number[] | null;
    ppg: number[] | null;
    fnirs: number[] | null;
  };
  latestBandsRel: Record<BandName, number> | null;
  mindMonitor: {
    concentration: number | null;
    mellow: number | null;
  };
  batteryPct: number | null;
}) {
  const rawRms = rms(latestEEG);
  const rawRange = latestEEG.length ? [Math.min(...latestEEG), Math.max(...latestEEG)] : [];
  const contact = buildContactQuality(rollingRaw);
  const accel = motion.accel ?? [];
  const gyro = motion.gyro ?? [];
  const ppg = motion.ppg ?? [];
  const fnirs = motion.fnirs ?? [];
  const dominantBand = latestBandsRel
    ? (Object.entries(latestBandsRel).sort((a, b) => b[1] - a[1])[0]?.[0] as BandName | undefined)
    : undefined;
  return {
    rawRms,
    rawRange,
    contact,
    accelMovement: accelMovement(accel),
    gyroMovement: magnitude(gyro),
    ppgPulse: ppgPulseFeature(ppg),
    ppgPresent: ppg.length > 0,
    fnirsProxy: fnirs.length ? fnirs.reduce((sum, value) => sum + Math.abs(value), 0) / fnirs.length : undefined,
    fnirsPresent: fnirs.length > 0,
    dominantBand,
    concentration: mindMonitor.concentration,
    mellow: mindMonitor.mellow,
    batteryPct,
  };
}

export function rawEegStats(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return { rms: 0, span: 0, level: 0 };
  const valueRms = rms(finite) ?? 0;
  const span = Math.max(...finite) - Math.min(...finite);
  const level = Math.max(0, Math.min(1, Math.log10(1 + valueRms) / 3));
  return { rms: valueRms, span, level };
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 1e-9 ? numerator / denominator : 0;
}

function logPower(values: number[] | undefined) {
  const valueRms = rms((values ?? []).slice(-256)) ?? 0;
  return Math.log(Math.max(valueRms * valueRms, 1e-12));
}

export function analyzeEegResearchMetrics(
  relative: Record<BandName, number> | null | undefined,
  rollingRaw: number[][],
  rollingBandRaw: Record<BandName, number[][]>,
  rawStats: { rms: number; span: number; level: number },
  motion: {
    accel: number[] | null;
    gyro: number[] | null;
    ppg: number[] | null;
    fnirs: number[] | null;
  },
) {
  const rel = relative ?? ({ delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 } as Record<BandName, number>);
  const thetaBeta = safeRatio(rel.theta, rel.beta);
  const alphaTheta = safeRatio(rel.alpha, rel.theta);
  const engagement = safeRatio(rel.beta, rel.alpha + rel.theta);
  const fatigue = safeRatio(rel.theta + rel.alpha, rel.beta);
  const dominantBand = Object.entries(rel).sort((a, b) => b[1] - a[1])[0]?.[0] as BandName | undefined;
  const alpha = rollingBandRaw.alpha ?? [[], [], [], []];
  const frontalAlphaAsym = logPower(alpha[2]) - logPower(alpha[1]);
  const temporalAlphaAsym = logPower(alpha[3]) - logPower(alpha[0]);
  const contacts = buildContactQuality(rollingRaw);
  const badContacts = Object.values(contacts).filter((label) => label !== "Good").length;
  const motionLoad = (accelMovement(motion.accel ?? []) ?? 0) + magnitude(motion.gyro ?? []) / 60;
  const artifactFlags = [
    rawStats.span > 900 ? "large EEG span" : "",
    rawStats.rms > 250 ? "high EEG RMS" : "",
    badContacts ? `${badContacts} contact warning${badContacts === 1 ? "" : "s"}` : "",
    motionLoad > 0.45 ? "motion artifact risk" : "",
  ].filter(Boolean);
  return {
    thetaBeta,
    alphaTheta,
    engagement,
    fatigue,
    dominantBand,
    frontalAlphaAsym,
    temporalAlphaAsym,
    quality: artifactFlags.length ? "Check signal" : "Good",
    artifactHint: artifactFlags.join(" · ") || "low artifact risk",
  };
}

export function responsiveAbsoluteBands(
  absolute: Record<BandName, number> | null | undefined,
  relative: Record<BandName, number> | null | undefined,
  rawRms: number,
) {
  if (!relative) return absolute ?? null;
  const totalPower = Math.max(rawRms * rawRms, 1e-9);
  const derived = BAND_NAMES.reduce(
    (acc, band) => {
      acc[band] = 10 * Math.log10(Math.max(totalPower * (relative[band] ?? 0), 1e-12));
      return acc;
    },
    {} as Record<BandName, number>,
  );

  if (!absolute) return derived;
  const absValues = BAND_NAMES.map((band) => absolute[band]).filter((value) => Number.isFinite(value));
  const spread = absValues.length ? Math.max(...absValues) - Math.min(...absValues) : 0;
  return spread < 0.001 ? derived : absolute;
}

export function bandDeltas(
  current: Record<BandName, number> | null | undefined,
  previous: Record<BandName, number> | null | undefined,
) {
  if (!current || !previous) return null;
  return BAND_NAMES.reduce(
    (acc, band) => {
      acc[band] = current[band] - previous[band];
      return acc;
    },
    {} as Record<BandName, number>,
  );
}

export function smoothBandSnapshot(
  previous: BandsSnapshot | null,
  next: BandsSnapshot,
  smoothing: number,
): BandsSnapshot {
  if (!previous) return next;
  const alpha = Math.max(0, Math.min(0.95, smoothing));
  return {
    absolute: smoothBandRecord(previous.absolute, next.absolute, alpha),
    relative: smoothBandRecord(previous.relative, next.relative, alpha),
    timestamp: next.timestamp,
    source: next.source,
  };
}

function smoothBandRecord(
  previous: Record<BandName, number>,
  next: Record<BandName, number>,
  alpha: number,
) {
  return BAND_NAMES.reduce(
    (acc, band) => {
      acc[band] = previous[band] * alpha + next[band] * (1 - alpha);
      return acc;
    },
    {} as Record<BandName, number>,
  );
}

export function chooseBandSource({
  rest,
  wsAbs,
  wsRel,
  wsTimestamp,
}: {
  rest: BandsSnapshot | null;
  wsAbs: Record<BandName, number> | null;
  wsRel: Record<BandName, number> | null;
  wsTimestamp: number | null;
}) {
  const hasWs = wsAbs && wsRel && wsTimestamp;
  if (hasWs && (!rest || wsTimestamp > rest.timestamp)) {
    return {
      absolute: wsAbs,
      relative: wsRel,
      timestamp: wsTimestamp,
      source: "WebSocket band stream",
    };
  }
  if (rest) {
    return {
      absolute: rest.absolute,
      relative: rest.relative,
      timestamp: rest.timestamp,
      source: "REST /api/bands",
    };
  }
  return {
    absolute: wsAbs,
    relative: wsRel,
    timestamp: wsTimestamp,
    source: "Waiting for band stream",
  };
}

export function buildBandRecord(
  source?: Partial<Record<BandName, number>>,
  fallbackRow?: number[],
): Record<BandName, number> | null {
  const result = {} as Record<BandName, number>;
  let hasAny = false;
  BAND_NAMES.forEach((band, index) => {
    const value = Number(source?.[band] ?? fallbackRow?.[index]);
    result[band] = Number.isFinite(value) ? value : 0;
    hasAny = hasAny || Number.isFinite(value);
  });
  return hasAny ? result : null;
}

export function relativeFromAbsolute(absolute: Record<BandName, number>) {
  const linear = BAND_NAMES.reduce(
    (acc, band) => {
      acc[band] = Math.pow(10, (absolute[band] ?? -60) / 10);
      return acc;
    },
    {} as Record<BandName, number>,
  );
  const total = BAND_NAMES.reduce((sum, band) => sum + linear[band], 0) || 1;
  return BAND_NAMES.reduce(
    (acc, band) => {
      acc[band] = linear[band] / total;
      return acc;
    },
    {} as Record<BandName, number>,
  );
}
