"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookmarkPlus,
  Circle,
  Headphones,
  Mic,
  Pause,
  Play,
  Radio,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  recorder,
  downloadRecordingFiles,
  type Annotation,
  type RecorderStatus,
} from "@/lib/recorder";
import { getRecorderEegLayout, inferResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { useNeuroStore } from "@/lib/store";
import { StimulusSessionController, stimulusSession } from "@/lib/stimulusSession";
import { RESEARCH_TIMELINE_MAX } from "@/lib/researchTypes";
import { StimulusClockRelayCard } from "@/components/research/StimulusClockRelayCard";

const WAVE_H = 140;
const EEG_STRIP_H = 72;
const LIVE_WAVE_WINDOW_MS = 20_000;

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function transportColor(kind: string): string {
  switch (kind) {
    case "play":
      return "rgba(52,211,153,0.95)";
    case "pause":
      return "rgba(251,191,36,0.9)";
    case "seek":
      return "rgba(96,165,250,0.95)";
    case "stop":
      return "rgba(248,113,113,0.9)";
    default:
      return "rgba(161,161,170,0.65)";
  }
}

function stimulusMsToX(
  stimMs: number,
  w: number,
  mode: "none" | "file" | "live",
  durMs: number,
  curMs: number,
): number | null {
  if (w <= 0) return null;
  if (mode === "file" && durMs > 0) {
    return (stimMs / durMs) * w;
  }
  if (mode === "live") {
    const end = Math.max(curMs, 1);
    const start = Math.max(0, end - LIVE_WAVE_WINDOW_MS);
    const span = Math.max(end - start, 1);
    const x = ((stimMs - start) / span) * w;
    if (x < -2 || x > w + 2) return null;
    return x;
  }
  return null;
}

export function StimulusAlignedLab() {
  const researchTimeline = useNeuroStore((s) => s.researchTimeline);
  const researchEvents = useNeuroStore((s) => s.researchEvents);
  const logResearchEvent = useNeuroStore((s) => s.logResearchEvent);
  const deviceName = useNeuroStore((s) => s.deviceName);
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const settings = useNeuroStore((s) => s.settings);
  const clientSimRunning = useNeuroStore((s) => s.clientSim.running);
  const eegTraceSource = useNeuroStore((s) => s.eegTraceSource);
  const estimatedEegHz = useNeuroStore((s) => s.estimatedEegHz);

  const [status, setStatus] = React.useState<RecorderStatus>(recorder.status());
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("stim_marker");
  const [epochPre, setEpochPre] = React.useState(2000);
  const [epochPost, setEpochPost] = React.useState(2000);
  const [liveAnnotations, setLiveAnnotations] = React.useState<Annotation[]>([]);
  const [, setStimulusTick] = React.useState(0);
  const [scrubRatio, setScrubRatio] = React.useState(0);
  const scrubWasPlaying = React.useRef(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const waveWrapRef = React.useRef<HTMLDivElement>(null);
  const waveCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const eegCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const [waveW, setWaveW] = React.useState(640);
  const [audioInputs, setAudioInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = React.useState("");
  const [speakersMuted, setSpeakersMuted] = React.useState(false);
  const [, setReadoutTick] = React.useState(0);

  React.useEffect(() => recorder.subscribe(setStatus), []);

  React.useEffect(() => {
    const id = window.setInterval(() => setReadoutTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  React.useLayoutEffect(() => {
    const el = waveWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setWaveW(Math.max(280, Math.floor(el.getBoundingClientRect().width))),
    );
    ro.observe(el);
    setWaveW(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const onDev = () => {
      void StimulusSessionController.enumerateAudioInputs().then(setAudioInputs);
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDev);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onDev);
  }, []);

  React.useEffect(() => {
    if (!status.recording) {
      setLiveAnnotations([]);
      return;
    }
    const id = window.setInterval(() => {
      setLiveAnnotations(recorder.getLiveAnnotations());
    }, 400);
    return () => window.clearInterval(id);
  }, [status.recording]);

  React.useEffect(() => {
    stimulusSession.setLiveMonitorMuted(speakersMuted);
  }, [speakersMuted]);

  const refreshAudioDevices = async () => {
    try {
      await StimulusSessionController.ensureAudioInputPermission();
    } catch {
      /* user denied */
    }
    const list = await StimulusSessionController.enumerateAudioInputs();
    setAudioInputs(list);
  };

  const stimDetailForMarker = () => {
    const mode = stimulusSession.getMode();
    const ap = stimulusSession.getCurrentAudioPositionMs();
    if (mode === "file" && stimulusSession.getFileName()) {
      return `file audio_ms=${ap.toFixed(0)}`;
    }
    if (mode === "live") {
      return `live_stim_ms=${ap.toFixed(0)}`;
    }
    return `stim_ms=${ap.toFixed(0)} (no file / start live monitor for concert clock)`;
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyM" && !e.repeat) {
        e.preventDefault();
        const lab = label.trim() || "marker";
        const ap = stimulusSession.getCurrentAudioPositionMs();
        const detail = stimDetailForMarker();
        logResearchEvent(lab, "stimulus", detail, { audioPositionMs: ap });
        if (recorder.status().recording) {
          recorder.addAnnotation(lab, `stimulus ${detail}`);
          setLiveAnnotations(recorder.getLiveAnnotations());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [label, logResearchEvent]);

  const recProfile = React.useMemo(
    () =>
      inferResearchDeviceProfile({
        deviceName,
        eegDeviceName: latestEEG?.deviceName,
        settingsSimulator: Boolean(settings.simulatorMode),
        clientSimRunning,
      }),
    [deviceName, latestEEG?.deviceName, settings.simulatorMode, clientSimRunning],
  );

  const eegLayout = React.useMemo(() => getRecorderEegLayout(recProfile), [recProfile]);

  const paintWaveform = React.useCallback(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);

    const mode = stimulusSession.getMode();
    const durMs = stimulusSession.getDurationSec() * 1000;
    const curMs = stimulusSession.getCurrentAudioPositionMs();

    if (mode === "live" && stimulusSession.isLiveMonitorActive()) {
      const cols = Math.max(32, Math.floor(w));
      const livePeaks = stimulusSession.sampleLiveWaveform(cols);
      if (livePeaks.length) {
        ctx.strokeStyle = "rgba(113,113,122,0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const mid = h * 0.5;
        const amp = h * 0.42;
        for (let i = 0; i < livePeaks.length; i++) {
          const x = (i / Math.max(livePeaks.length - 1, 1)) * w;
          const ph = (livePeaks[i] ?? 0) * amp;
          ctx.moveTo(x, mid - ph);
          ctx.lineTo(x, mid + ph);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(63,63,70,0.95)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`Live · last ${(LIVE_WAVE_WINDOW_MS / 1000).toFixed(0)}s window · now →`, 6, 14);
    } else {
      const peaks = stimulusSession.getPeaks();
      if (peaks.length && durMs > 0) {
        ctx.strokeStyle = "rgba(113,113,122,0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const mid = h * 0.5;
        const amp = h * 0.42;
        for (let i = 0; i < peaks.length; i++) {
          const x = (i / (peaks.length - 1)) * w;
          const ph = (peaks[i] ?? 0) * amp;
          ctx.moveTo(x, mid - ph);
          ctx.lineTo(x, mid + ph);
        }
        ctx.stroke();
      }
    }

    const playX = stimulusMsToX(curMs, w, mode, durMs, curMs);
    if (playX != null && (mode === "file" || mode === "live")) {
      ctx.strokeStyle = "rgba(52,211,153,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();
    }

    for (const ev of researchEvents) {
      if (typeof ev.audioPositionMs !== "number") continue;
      const x = stimulusMsToX(ev.audioPositionMs, w, mode, durMs, curMs);
      if (x == null) continue;
      ctx.strokeStyle =
        ev.source === "stimulus" ? "rgba(251,191,36,0.75)" : "rgba(96,165,250,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (const ev of stimulusSession.getTransportTickEvents()) {
      const x = stimulusMsToX(ev.audioPositionMs, w, mode, durMs, curMs);
      if (x == null) continue;
      ctx.fillStyle = transportColor(ev.kind);
      ctx.fillRect(Math.max(0, x - 1.5), 3, 3, 12);
    }
  }, [researchEvents, waveW]);

  React.useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(waveW * dpr);
    canvas.height = Math.floor(WAVE_H * dpr);
    canvas.style.width = `${waveW}px`;
    canvas.style.height = `${WAVE_H}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintWaveform();
  }, [waveW, paintWaveform]);

  React.useEffect(() => {
    let raf = 0;
    const loop = () => {
      paintWaveform();
      if (stimulusSession.isPlaying() || stimulusSession.isLiveMonitorActive()) {
        raf = requestAnimationFrame(loop);
      }
    };
    const sub = stimulusSession.subscribe(() => {
      setStimulusTick((t) => t + 1);
      const d = stimulusSession.getDurationSec();
      if (d > 0) {
        setScrubRatio(stimulusSession.getCurrentAudioPositionMs() / (d * 1000));
      }
      cancelAnimationFrame(raf);
      paintWaveform();
      if (stimulusSession.isPlaying() || stimulusSession.isLiveMonitorActive()) {
        raf = requestAnimationFrame(loop);
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      sub();
    };
  }, [paintWaveform]);

  const paintEegStrip = React.useCallback(() => {
    const canvas = eegCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);
    const tl = researchTimeline;
    if (tl.length < 2) {
      ctx.fillStyle = "#52525b";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText("Connect device or start simulator for live EEG…", 8, 22);
      return;
    }
    const take = Math.min(2000, tl.length);
    const slice = tl.slice(-take);
    let min = Infinity;
    let max = -Infinity;
    for (const row of slice) {
      const v = row.eeg[0] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = -200;
      max = 200;
    }
    const pad = 6;
    ctx.strokeStyle = "rgba(52,211,153,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    slice.forEach((row, i) => {
      const x = pad + (i / (slice.length - 1)) * (w - pad * 2);
      const v = row.eeg[0] ?? 0;
      const t = (v - min) / (max - min);
      const y = pad + (1 - t) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const t0 = slice[0]?.wallMs ?? 0;
    const t1 = slice[slice.length - 1]?.wallMs ?? 0;
    for (const ev of researchEvents) {
      if (ev.wallMs < t0 || ev.wallMs > t1) continue;
      const x = pad + ((ev.wallMs - t0) / Math.max(1, t1 - t0)) * (w - pad * 2);
      ctx.strokeStyle = "rgba(251,191,36,0.65)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, [researchTimeline, researchEvents]);

  React.useEffect(() => {
    const canvas = eegCanvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(waveW * dpr);
    canvas.height = Math.floor(EEG_STRIP_H * dpr);
    canvas.style.width = `${waveW}px`;
    canvas.style.height = `${EEG_STRIP_H}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintEegStrip();
  }, [waveW, paintEegStrip]);

  React.useEffect(() => {
    const id = window.setInterval(() => paintEegStrip(), 200);
    return () => window.clearInterval(id);
  }, [paintEegStrip]);

  const onPickFile = async (f: File | null) => {
    if (!f) return;
    await stimulusSession.loadFile(f);
  };

  const startCapture = () => {
    const hz = estimatedEegHz ?? 256;
    recorder.start({
      name: name.trim() || undefined,
      source: clientSimRunning ? "simulator" : "device",
      device: deviceName ?? (clientSimRunning ? "CLIENT SIM" : "UNKNOWN"),
      sampleRate: Math.round(hz),
      eegTraceSource,
      estimatedEegHz: hz,
      eegChannelCount: eegLayout.count,
      channelLabels: eegLayout.labels,
      stimulusAlign: true,
    });
  };

  const stopAndExport = () => {
    const micBlob = stimulusSession.getLineArchiveActive()
      ? stimulusSession.stopLineArchiveRecording()
      : null;
    const rec = recorder.stop();
    if (!rec) return;
    const safe = rec.name.replace(/[^a-z0-9_\-]+/gi, "_");
    setTimeout(() => {
      downloadRecordingFiles(rec, { preMs: epochPre, postMs: epochPost });
      if (micBlob) downloadBlob(`${safe}.stimulus_performance.webm`, micBlob);
    }, 200);
  };

  const dropMarker = () => {
    const lab = label.trim() || `stim_${researchEvents.length + 1}`;
    const ap = stimulusSession.getCurrentAudioPositionMs();
    const detail = stimDetailForMarker();
    logResearchEvent(lab, "stimulus", detail, { audioPositionMs: ap });
    if (!status.recording) return;
    recorder.addAnnotation(lab, `stimulus ${detail}`);
    setLiveAnnotations(recorder.getLiveAnnotations());
  };

  const dur = stimulusSession.getDurationSec();
  const fn = stimulusSession.getFileName();
  const liveInfo = stimulusSession.getLiveDeviceInfo();
  const fileMode = Boolean(fn && dur > 0);
  const bindOffset = stimulusSession.getStimulusOffsetSinceRecordingBind();
  const anchorWall = stimulusSession.getRecordingAnchorWallMs();

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        <strong className="text-zinc-400">Live concerts:</strong> pick your USB audio interface, start monitoring, run EEG capture, and log markers on the same wall clock as the pianist’s performance.{" "}
        <strong className="text-zinc-400">Files:</strong> load a take for lab playback. Exports include{" "}
        <strong className="text-zinc-400">manifest.stimulus</strong>, <strong className="text-zinc-400">stimulus_events.json</strong>, and optional{" "}
        <strong className="text-zinc-400">stimulus_performance.webm</strong>. Transport ticks (play / pause / seek / stop) are drawn along the top of the waveform.{" "}
        <Link href="/research" className="text-emerald-400/90 underline-offset-2 hover:underline">
          Research Mode
        </Link>{" "}
        ·{" "}
        <Link href="/research/concert" className="text-emerald-400/90 underline-offset-2 hover:underline">
          Concert observer
        </Link>{" "}
        (~{RESEARCH_TIMELINE_MAX} timeline samples).
      </p>

      <Card>
        <CardHeader>
          <CardTitle
            icon={<Radio className="h-4 w-4" />}
            description="Select the interface (e.g. USB-C audio). Browsers list inputs after microphone permission. Mute speakers if you only need a clean FOH mix elsewhere."
          >
            Live line-in &amp; concert capture
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-zinc-400">
              Audio input
              <select
                value={selectedInputId}
                onChange={(e) => setSelectedInputId(e.target.value)}
                className="mt-0.5 block min-w-[14rem] rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-200"
              >
                <option value="">Default system input</option>
                {audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId.slice(0, 12) + "…"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void refreshAudioDevices()}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Refresh inputs
            </button>
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <input
                type="checkbox"
                checked={speakersMuted}
                onChange={(e) => setSpeakersMuted(e.target.checked)}
                className="accent-emerald-500"
              />
              {speakersMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              Mute browser monitor (headphone bleed)
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!stimulusSession.isLiveMonitorActive() ? (
              <button
                type="button"
                onClick={() =>
                  void stimulusSession.startLiveInput(selectedInputId || undefined, {
                    monitorToSpeakers: !speakersMuted,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-200"
              >
                <Radio className="h-3.5 w-3.5" />
                Start live monitor
              </button>
            ) : (
              <button
                type="button"
                onClick={() => stimulusSession.stopLiveInput()}
                disabled={stimulusSession.getLineArchiveActive()}
                title={
                  stimulusSession.getLineArchiveActive()
                    ? "Stop performance archive first"
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Square className="h-3.5 w-3.5" />
                Stop live monitor
              </button>
            )}
            {liveInfo ? (
              <span className="font-mono text-[10px] text-zinc-500">
                Active: {liveInfo.label}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-3">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Performance audio archive</span>
            {!stimulusSession.getLineArchiveActive() ? (
              <button
                type="button"
                onClick={() =>
                  void stimulusSession.startLineArchiveRecording(
                    stimulusSession.isLiveMonitorActive() ? undefined : selectedInputId || undefined,
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-800 bg-sky-950/30 px-3 py-1.5 text-xs text-sky-200"
              >
                <Mic className="h-3.5 w-3.5" />
                Record performance to file
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const b = stimulusSession.stopLineArchiveRecording();
                  if (b) {
                    const safe = (name.trim() || "performance").replace(/[^a-z0-9_\-]+/gi, "_");
                    downloadBlob(`${safe}_clip.webm`, b);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200"
              >
                Stop archive &amp; download clip
              </button>
            )}
            <span className="text-[10px] text-zinc-600">
              Uses the live monitor stream when running; otherwise opens the selected input.
            </span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle
            icon={<Headphones className="h-4 w-4" />}
            description="File decode + scrub; colored ticks: play · pause · seek · stop."
          >
            File playback (lab / reference take)
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={stimulusSession.isLiveMonitorActive()}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              Load audio…
            </button>
            {fn ? (
              <span className="font-mono text-[11px] text-zinc-400">
                {fn} · {dur.toFixed(2)}s
              </span>
            ) : (
              <span className="text-[11px] text-zinc-600">No file loaded</span>
            )}
            <button
              type="button"
              onClick={() => stimulusSession.clearFile()}
              className="rounded border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-900"
            >
              Clear file
            </button>
          </div>

          <div ref={waveWrapRef} className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-800">
            <canvas ref={waveCanvasRef} className="block max-w-full" />
          </div>

          <div className="flex flex-wrap gap-3 text-[9px] text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400/90" /> play
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-amber-400/90" /> pause
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-sky-400/90" /> seek
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-rose-400/90" /> stop
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-amber-400/80" /> research marker
            </span>
          </div>

          <label className="block text-[10px] text-zinc-500">
            Scrub (pause first to avoid extra pause events mid-drag)
            <input
              type="range"
              min={0}
              max={1}
              step={0.0001}
              value={scrubRatio}
              disabled={!fileMode}
              onPointerDown={() => {
                scrubWasPlaying.current = stimulusSession.isPlaying();
                if (scrubWasPlaying.current) stimulusSession.pause();
              }}
              onInput={(e) => {
                const r = Number((e.target as HTMLInputElement).value);
                stimulusSession.setPositionRatioSilent(r);
                setScrubRatio(r);
                paintWaveform();
              }}
              onPointerUp={() => {
                stimulusSession.logSeekCommit("scrub");
                if (scrubWasPlaying.current) void stimulusSession.play();
                scrubWasPlaying.current = false;
              }}
              className="mt-1 block w-full accent-emerald-600 disabled:opacity-40"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void stimulusSession.play()}
              disabled={!fileMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              Play
            </button>
            <button
              type="button"
              onClick={() => stimulusSession.pause()}
              disabled={!fileMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
            <button
              type="button"
              onClick={() => stimulusSession.stop()}
              disabled={!fileMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle
            icon={<Circle className="h-4 w-4" />}
            description="During capture: wall clock, stimulus clock, and Δ since recording bind. Hotkey M drops a marker."
          >
            EEG capture (stimulus-aligned)
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {status.recording ? (
            <div className="grid gap-2 rounded-lg border border-emerald-900/45 bg-emerald-950/20 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-300 sm:grid-cols-2">
              <div>
                <span className="text-zinc-500">Wall now (UTC)</span>
                <br />
                {new Date().toISOString()}
              </div>
              <div>
                <span className="text-zinc-500">Recorder elapsed</span>
                <br />
                {status.elapsedMs.toLocaleString()} ms · anchor wall {anchorWall ?? "—"}
              </div>
              <div>
                <span className="text-zinc-500">Stimulus clock</span>
                <br />
                {stimulusSession.getCurrentAudioPositionMs().toFixed(0)} ms
                {stimulusSession.getMode() === "live" ? " (live session)" : ""}
              </div>
              <div>
                <span className="text-zinc-500">Δ stimulus since capture bind</span>
                <br />
                {bindOffset != null ? `${bindOffset.toFixed(0)} ms` : "—"}
              </div>
              <div className="sm:col-span-2 text-zinc-500">
                Align offline: <span className="text-zinc-400">eeg.csv wall_ms</span> with{" "}
                <span className="text-zinc-400">manifest.recording_anchor_wall_ms</span> +{" "}
                <span className="text-zinc-400">stimulus.timeline[]</span> and marker{" "}
                <span className="text-zinc-400">audio_position_ms</span>.
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-2">
            <div className="mb-1 text-[10px] font-medium text-zinc-500">Live EEG (ch1) · wall-time markers</div>
            <canvas ref={eegCanvasRef} className="block max-w-full rounded border border-zinc-800/80" />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-zinc-400">
              Session name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={status.recording}
                placeholder="optional"
                className="mt-0.5 block w-48 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
              />
            </label>
            <label className="text-[11px] text-zinc-400">
              Marker label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-0.5 block w-44 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
              />
            </label>
            <label className="text-[11px] text-zinc-400">
              Epoch pre (ms)
              <input
                type="number"
                min={0}
                step={100}
                value={epochPre}
                onChange={(e) => setEpochPre(Number(e.target.value))}
                className="mt-0.5 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
              />
            </label>
            <label className="text-[11px] text-zinc-400">
              Epoch post (ms)
              <input
                type="number"
                min={0}
                step={100}
                value={epochPost}
                onChange={(e) => setEpochPost(Number(e.target.value))}
                className="mt-0.5 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!status.recording ? (
              <button
                type="button"
                onClick={startCapture}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50"
              >
                <Circle className="h-3.5 w-3.5" />
                Start capture (stimulus align)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={dropMarker}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Drop marker
                </button>
                <button
                  type="button"
                  onClick={stopAndExport}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/30 px-3 py-2 text-xs font-medium text-rose-200"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop &amp; export
                </button>
              </>
            )}
          </div>

          {liveAnnotations.length ? (
            <div className="max-h-24 overflow-auto rounded border border-zinc-800 bg-zinc-950/50 p-2 font-mono text-[10px] text-zinc-500">
              {liveAnnotations.map((a, i) => (
                <div key={`${a.t_ms}_${i}`} className="truncate">
                  {a.t_ms.toFixed(0)} ms · {a.label}
                  {a.detail ? ` · ${a.detail}` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <StimulusClockRelayCard />
    </div>
  );
}
