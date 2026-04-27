"use client";

import * as React from "react";
import type { ScaleState } from "@/components/ui/ScaleControl";
import { bandPlvPairwise } from "@/lib/researchConnectivity";
import {
  cardiacFrontalPpgDiffCorrelation,
  frontalAlphaEnvelopeCorrelation,
  hrAlphaCouplingPearson,
  ppgSeriesScalars,
} from "@/lib/researchCoupling";
import { buildContactQuality } from "@/lib/researchContactQuality";
import { inferResearchDeviceProfile, isEegOnlyResearchHardware } from "@/lib/researchDeviceProfile";
import {
  analyzeEegResearchMetrics,
  analyzeFnirs,
  analyzePpgSamples,
  bandDeltas,
  buildBandRecord,
  buildDecodedMuseStreams,
  chooseBandSource,
  inferSource,
  magnitude,
  rawEegStats,
  relativeFromAbsolute,
  responsiveAbsoluteBands,
  smoothBandSnapshot,
  type BandsApiResponse,
  type BandsSnapshot,
  type FnirsSample,
  type PpgSample,
} from "@/lib/researchPageAnalysis";
import {
  computeSpectralQc,
  emgProxyFromRelative,
  formatSpectralQcLine,
  spectralQcFromRollingRaw,
} from "@/lib/researchQc";
import { useNeuroStore } from "@/lib/store";
import type { BandName } from "@/lib/types";
import { BAND_NAMES } from "@/lib/types";
import { computeVigilanceProxy } from "@/lib/researchVigilance";

export function useResearchPageModel() {
  const wsStatus = useNeuroStore((s) => s.wsStatus);
  const lastMessageAt = useNeuroStore((s) => s.lastMessageAt);
  const deviceName = useNeuroStore((s) => s.deviceName);
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const rollingRaw = useNeuroStore((s) => s.rollingRaw);
  const rollingBandRaw = useNeuroStore((s) => s.rollingBandRaw);
  const latestBandsAbs = useNeuroStore((s) => s.latestBandsAbs);
  const latestBandsRel = useNeuroStore((s) => s.latestBandsRel);
  const latestBandsAt = useNeuroStore((s) => s.latestBandsAt);
  const motion = useNeuroStore((s) => s.motion);
  const brainState = useNeuroStore((s) => s.brainState);
  const batteryPct = useNeuroStore((s) => s.batteryPct);
  const packetCount = useNeuroStore((s) => s.packetCount);
  const settings = useNeuroStore((s) => s.settings);
  const mindMonitorOsc = useNeuroStore((s) => s.mindMonitorOsc);
  const mindMonitorMode = useNeuroStore((s) => s.mindMonitorMode);
  const mindMonitor = useNeuroStore((s) => s.mindMonitor);
  const fftSnapshot = useNeuroStore((s) => s.fft);
  const storeBandHistory = useNeuroStore((s) => s.bandHistory);
  const estimatedEegHz = useNeuroStore((s) => s.estimatedEegHz);
  const researchTimeline = useNeuroStore((s) => s.researchTimeline);
  const eegTraceSource = useNeuroStore((s) => s.eegTraceSource);
  const clientSimRunning = useNeuroStore((s) => s.clientSim.running);

  const [bandsFallback, setBandsFallback] = React.useState<BandsSnapshot | null>(null);
  const [ppgHistory, setPpgHistory] = React.useState<PpgSample[]>([]);
  const [fnirsHistory, setFnirsHistory] = React.useState<FnirsSample[]>([]);
  const [contactTrend, setContactTrend] = React.useState<
    { t: number; tp9: string; af7: string; af8: string; tp10: string }[]
  >([]);
  const rollingRawRef = React.useRef(rollingRaw);
  rollingRawRef.current = rollingRaw;
  const [previousBandsAbs, setPreviousBandsAbs] = React.useState<Record<BandName, number> | null>(null);
  const [displayRateMs, setDisplayRateMs] = React.useState(500);
  const [smoothing, setSmoothing] = React.useState(0.65);
  const [relBarScale, setRelBarScale] = React.useState<ScaleState>({ auto: true, value: 100 });
  const relBarGainSmoothedRef = React.useRef(1);
  const [displayBands, setDisplayBands] = React.useState<BandsSnapshot | null>(null);
  const [displayUpdateCount, setDisplayUpdateCount] = React.useState(0);
  const [alphaEma, setAlphaEma] = React.useState(0);

  const ageMs = lastMessageAt ? Date.now() - lastMessageAt : null;
  const live = wsStatus === "open" && (ageMs === null || ageMs < 2500);
  const mmOscCount = Object.keys(mindMonitorOsc.addresses).length;
  const source = inferSource(
    deviceName,
    latestEEG?.deviceName,
    settings.simulatorMode,
    mindMonitorMode,
    mmOscCount,
  );
  const profile = React.useMemo(
    () =>
      inferResearchDeviceProfile({
        deviceName,
        eegDeviceName: latestEEG?.deviceName,
        settingsSimulator: Boolean(settings.simulatorMode),
        clientSimRunning,
      }),
    [deviceName, latestEEG?.deviceName, settings.simulatorMode, clientSimRunning],
  );
  const eegOnlyHardware = isEegOnlyResearchHardware(profile);
  const bandSource = chooseBandSource({
    rest: bandsFallback,
    wsAbs: latestBandsAbs,
    wsRel: latestBandsRel,
    wsTimestamp: latestBandsAt,
  });
  const rawStats = React.useMemo(() => rawEegStats(latestEEG?.raw ?? []), [latestEEG?.raw]);
  const liveBandsForDisplay = React.useMemo(
    () =>
      bandSource.absolute && bandSource.relative
        ? {
            absolute: responsiveAbsoluteBands(bandSource.absolute, bandSource.relative, rawStats.rms) ?? bandSource.absolute,
            relative: bandSource.relative,
            timestamp: bandSource.timestamp ?? Date.now(),
            source: bandSource.source,
          }
        : null,
    [bandSource.absolute, bandSource.relative, bandSource.source, bandSource.timestamp, rawStats.rms],
  );
  const liveBandsRef = React.useRef<BandsSnapshot | null>(null);
  React.useEffect(() => {
    liveBandsRef.current = liveBandsForDisplay;
  }, [liveBandsForDisplay]);
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const next = liveBandsRef.current;
      if (!next) return;
      setDisplayBands((prev) => smoothBandSnapshot(prev, next, smoothing));
      setDisplayUpdateCount((count) => count + 1);
    }, displayRateMs);
    return () => window.clearInterval(id);
  }, [displayRateMs, smoothing]);
  const displayedBandsAbs = displayBands?.absolute ?? liveBandsForDisplay?.absolute ?? bandSource.absolute;
  const displayedBandsRel = displayBands?.relative ?? liveBandsForDisplay?.relative ?? bandSource.relative;
  const displayTimestamp = displayBands?.timestamp ?? liveBandsForDisplay?.timestamp ?? bandSource.timestamp;
  const displaySource = displayBands?.source ?? liveBandsForDisplay?.source ?? bandSource.source;
  const monitorBandsAbs = displayedBandsAbs;
  const monitorBandsRel = displayedBandsRel;

  React.useEffect(() => {
    if (!relBarScale.auto || !monitorBandsRel) return;
    const mx = Math.max(...BAND_NAMES.map((b) => monitorBandsRel[b] ?? 0), 1e-9);
    const target = Math.max(0.45, Math.min(8, 0.92 / mx));
    relBarGainSmoothedRef.current = relBarGainSmoothedRef.current * 0.82 + target * 0.18;
  }, [relBarScale.auto, monitorBandsRel, displayUpdateCount]);

  const relBarDisplayGain = relBarScale.auto
    ? relBarGainSmoothedRef.current
    : Math.max(0.35, Math.min(4.5, relBarScale.value / 100));

  const absDeltas = React.useMemo(
    () => bandDeltas(monitorBandsAbs, previousBandsAbs),
    [monitorBandsAbs, previousBandsAbs],
  );
  const ppgMetrics = React.useMemo(() => analyzePpgSamples(ppgHistory), [ppgHistory]);
  const eegMetrics = React.useMemo(
    () => analyzeEegResearchMetrics(displayedBandsRel, rollingRaw, rollingBandRaw, rawStats, motion),
    [displayedBandsRel, rollingRaw, rollingBandRaw, rawStats, motion],
  );
  const spectralQc = React.useMemo(() => {
    const hz = Math.max(8, Math.min(512, estimatedEegHz ?? 256));
    const fromRolling = spectralQcFromRollingRaw(rollingRaw, hz);
    if (fromRolling) return fromRolling;
    const mags = fftSnapshot?.magnitudes;
    if (
      fftSnapshot?.freqs?.length &&
      mags &&
      Array.isArray(mags) &&
      mags.length > 0 &&
      Array.isArray((mags as unknown[])[0])
    ) {
      return computeSpectralQc(fftSnapshot.freqs, mags as number[][]);
    }
    return null;
  }, [rollingRaw, estimatedEegHz, fftSnapshot, latestEEG?.timestamp]);
  const frontalAlphaR = React.useMemo(
    () => frontalAlphaEnvelopeCorrelation(rollingBandRaw.alpha),
    [rollingBandRaw, latestEEG?.timestamp],
  );
  const hrAlphaR = React.useMemo(
    () => hrAlphaCouplingPearson(storeBandHistory, ppgSeriesScalars(ppgHistory)),
    [storeBandHistory, ppgHistory],
  );
  const emgProxy = React.useMemo(() => emgProxyFromRelative(displayedBandsRel), [displayedBandsRel]);
  const cardiacCoupling = React.useMemo(
    () => cardiacFrontalPpgDiffCorrelation(researchTimeline, ppgHistory),
    [researchTimeline, ppgHistory],
  );
  const plvAlpha = React.useMemo(
    () => bandPlvPairwise(rollingBandRaw, "alpha", estimatedEegHz ?? 256),
    [rollingBandRaw, estimatedEegHz, latestEEG?.timestamp],
  );
  const plvBeta = React.useMemo(
    () => bandPlvPairwise(rollingBandRaw, "beta", estimatedEegHz ?? 256),
    [rollingBandRaw, estimatedEegHz, latestEEG?.timestamp],
  );
  React.useEffect(() => {
    const a = displayedBandsRel?.alpha;
    if (a == null || !Number.isFinite(a)) return;
    setAlphaEma((e) => e * 0.97 + a * 0.03);
  }, [displayedBandsRel, displayUpdateCount]);
  const vigilance = React.useMemo(
    () =>
      computeVigilanceProxy(
        displayedBandsRel,
        alphaEma,
        displayedBandsRel?.alpha ?? 0,
        emgProxy ?? 0,
      ),
    [displayedBandsRel, alphaEma, emgProxy, displayUpdateCount],
  );
  const fnirsMetrics = React.useMemo(() => analyzeFnirs(fnirsHistory), [fnirsHistory]);
  const decodedMuse = buildDecodedMuseStreams({
    latestEEG: latestEEG?.raw ?? [],
    rollingRaw,
    motion,
    latestBandsRel: displayedBandsRel ?? displayedBandsAbs,
    mindMonitor,
    batteryPct,
  });

  React.useEffect(() => {
    let cancelled = false;
    async function pollBands() {
      try {
        const response = await fetch("/api/bands", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as BandsApiResponse;
        if (data.available === false) return;
        const row = data.values?.[0];
        const absolute = buildBandRecord(data.absolute, row);
        if (!absolute) return;
        const relative = buildBandRecord(data.relative) ?? relativeFromAbsolute(absolute);
        if (!cancelled) {
          setBandsFallback({
            absolute,
            relative,
            timestamp: data.timestamp ?? Date.now(),
          });
        }
      } catch {
        // Research view should remain usable even if REST polling is unavailable.
      }
    }
    pollBands();
    const id = window.setInterval(pollBands, 100);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    const values = motion.ppg?.filter((value) => Number.isFinite(value)) ?? [];
    if (!values.length) return;
    const now = Date.now();
    setPpgHistory((prev) => {
      const last = prev.at(-1);
      if (last && now - last.t < 40) return prev;
      return [...prev, { t: now, values }].filter((sample) => now - sample.t <= 20000);
    });
  }, [motion.ppg]);

  React.useEffect(() => {
    const values = motion.fnirs?.filter((value) => Number.isFinite(value)) ?? [];
    if (!values.length) return;
    const now = Date.now();
    const motionMag = magnitude(motion.accel ?? []);
    setFnirsHistory((prev) => {
      const last = prev.at(-1);
      if (last && now - last.t < 200) return prev;
      return [...prev, { t: now, values, motionMag: Number.isFinite(motionMag) ? motionMag : undefined }].filter(
        (sample) => now - sample.t <= 120000,
      );
    });
  }, [motion.fnirs, motion.accel]);

  React.useEffect(() => {
    if (!profile.capabilities.museContactTiles) {
      setContactTrend([]);
      return;
    }
    const id = window.setInterval(() => {
      const q = buildContactQuality(rollingRawRef.current);
      setContactTrend((prev) => [...prev.slice(-179), { t: Date.now(), ...q }]);
    }, 1000);
    return () => window.clearInterval(id);
  }, [profile.capabilities.museContactTiles]);

  React.useEffect(() => {
    if (!monitorBandsAbs || !displayTimestamp) return;
    const id = window.setTimeout(() => {
      setPreviousBandsAbs(monitorBandsAbs);
    }, 1);
    return () => window.clearTimeout(id);
  }, [displayTimestamp, monitorBandsAbs]);

  const snapshot = {
    source,
    wsStatus,
    lastPacketAgeMs: ageMs,
    deviceName,
    eegDeviceName: latestEEG?.deviceName,
    packetCount,
    batteryPct,
    brainState,
    latestEEG: latestEEG?.raw,
    latestBandsAbs: displayedBandsAbs,
    latestBandsRel: displayedBandsRel,
    motion,
    decodedMuse,
    mindMonitor,
    mindMonitorOsc,
    settings,
  };

  return {
    wsStatus,
    lastMessageAt,
    deviceName,
    latestEEG,
    rollingRaw,
    motion,
    packetCount,
    batteryPct,
    brainState,
    settings,
    mindMonitorOsc,
    mindMonitorMode,
    mindMonitor,
    estimatedEegHz,
    eegTraceSource,
    researchTimeline,
    ageMs,
    live,
    mmOscCount,
    source,
    profile,
    eegOnlyHardware,
    rawStats,
    monitorBandsAbs,
    monitorBandsRel,
    displayTimestamp,
    displaySource,
    displayUpdateCount,
    displayRateMs,
    setDisplayRateMs,
    smoothing,
    setSmoothing,
    relBarScale,
    setRelBarScale,
    relBarDisplayGain,
    absDeltas,
    ppgMetrics,
    eegMetrics,
    spectralQc,
    frontalAlphaR,
    hrAlphaR,
    emgProxy,
    cardiacCoupling,
    plvAlpha,
    plvBeta,
    vigilance,
    fnirsMetrics,
    decodedMuse,
    ppgHistory,
    fnirsHistory,
    contactTrend,
    snapshot,
    displayedBandsAbs,
    displayedBandsRel,
  };
}
