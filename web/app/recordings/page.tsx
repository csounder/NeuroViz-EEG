"use client";

import * as React from "react";
import {
  Circle,
  Download,
  FileJson,
  FileSpreadsheet,
  Flag,
  Music,
  Pause,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  recorder,
  activeRecordings,
  savedRecordingsMeta,
  downloadText,
  buildEegCsv,
  buildBandsCsv,
  buildAnnotationsCsv,
  buildManifestJson,
  downloadRecordingFiles,
  type Recording,
  type RecorderStatus,
  type SavedMeta,
} from "@/lib/recorder";
import { BAND_COLORS, BAND_LABELS, cn } from "@/lib/utils";
import { BAND_NAMES, type BandName } from "@/lib/types";

export default function RecordingsPage() {
  const [status, setStatus] = React.useState<RecorderStatus>(recorder.status());
  const [savedList, setSavedList] = React.useState<SavedMeta[]>(
    [...savedRecordingsMeta],
  );
  const [annotationLabel, setAnnotationLabel] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [name, setName] = React.useState(defaultName());

  React.useEffect(() => recorder.subscribe(setStatus), []);

  React.useEffect(() => {
    const refresh = () => setSavedList([...savedRecordingsMeta]);
    window.addEventListener("neurovis:recordings-changed", refresh);
    return () =>
      window.removeEventListener("neurovis:recordings-changed", refresh);
  }, []);

  const start = () => {
    recorder.start({
      name: name.trim() || defaultName(),
      source: "simulator",
      device: "SIMULATOR",
      sampleRate: 256,
    });
  };
  const stop = () => {
    const rec = recorder.stop();
    if (rec) {
      setExpanded(rec.id);
      // Offer downloads immediately
      setTimeout(() => downloadRecordingFiles(rec, { preMs: 2000, postMs: 2000 }), 250);
    }
  };
  const addAnnotation = () => {
    const label = annotationLabel.trim() || "marker";
    recorder.addAnnotation(label);
    setAnnotationLabel("");
  };

  return (
    <div className="space-y-6">
      {/* Active recording card */}
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Circle className="h-4 w-4" />}
            description="Captures raw EEG (4 columns by default; 8 or 16 for OpenBCI Cyton/Daisy when the device name matches) · band powers (5 bands × abs + rel) · motion · brain state · artifact flag · annotations"
          >
            {status.recording ? "Recording…" : "New session"}
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {!status.recording ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Session name
                </div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                  placeholder={defaultName()}
                />
              </label>
              <Button
                variant="primary"
                onClick={start}
                leftIcon={<Circle className="h-3.5 w-3.5 fill-current" />}
              >
                Start recording
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5">
                  <Circle className="h-3 w-3 animate-pulse fill-rose-400 text-rose-400" />
                  <span className="font-mono text-xs font-medium uppercase tracking-wider text-rose-300">
                    REC
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-300">
                    {formatMs(status.elapsedMs)}
                  </span>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={stop}
                  leftIcon={<Square className="h-3.5 w-3.5" />}
                >
                  Stop & save
                </Button>
                <div className="font-mono text-[11px] text-zinc-500">
                  {status.eegSamples.toLocaleString()} EEG ·{" "}
                  {status.bandSamples.toLocaleString()} band ·{" "}
                  {status.annotationCount} markers
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={annotationLabel}
                  onChange={(e) => setAnnotationLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addAnnotation();
                  }}
                  placeholder="Marker label (e.g. eyes closed)"
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addAnnotation}
                  leftIcon={<Flag className="h-3.5 w-3.5" />}
                >
                  Add marker
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              What gets saved
            </div>
            <ul className="grid grid-cols-1 gap-x-5 gap-y-0.5 sm:grid-cols-2">
              <li>
                <span className="text-zinc-300">eeg.csv</span> — t_ms, wall_ms,
                eeg_1…eeg_N (µV) per manifest channels, artifact flag
              </li>
              <li>
                <span className="text-zinc-300">bands.csv</span> — t_ms, rel &
                abs per band, state, motion
              </li>
              <li>
                <span className="text-zinc-300">annotations.csv</span> — t_ms,
                label, detail
              </li>
              <li>
                <span className="text-zinc-300">manifest.json</span> — device,
                DSP config, schema, duration
              </li>
            </ul>
          </div>
        </CardBody>
      </Card>

      {/* Saved recordings list */}
      <Card>
        <CardHeader>
          <CardTitle description="Sessions captured in this browser tab. Click a row to review.">
            Recordings
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {savedList.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-10 text-center text-sm text-zinc-500">
              No recordings yet. Hit <span className="text-zinc-300">Start recording</span> above to capture your first session.
            </div>
          ) : (
            savedList.map((meta) => (
              <RecordingRow
                key={meta.id}
                meta={meta}
                expanded={expanded === meta.id}
                onToggle={() =>
                  setExpanded(expanded === meta.id ? null : meta.id)
                }
                onDelete={() => {
                  recorder.removeRecording(meta.id);
                  if (expanded === meta.id) setExpanded(null);
                }}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ───────────────────────── Recording row + review ─────────────────────────

function RecordingRow({
  meta,
  expanded,
  onToggle,
  onDelete,
}: {
  meta: SavedMeta;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const rec = activeRecordings.get(meta.id);

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-col text-left"
        >
          <div className="truncate text-sm font-medium text-zinc-100">
            {meta.name}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            <span>{new Date(meta.started_at).toLocaleString()}</span>
            <span>{formatMs(meta.duration_ms)}</span>
            <span>{meta.eeg_samples.toLocaleString()} EEG</span>
            <span>{meta.band_samples.toLocaleString()} band</span>
            <span>{meta.source}</span>
            <span>{meta.device}</span>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {rec ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadText(`${meta.name}.eeg.csv`, buildEegCsv(rec))}
                leftIcon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                title="Download eeg.csv"
              >
                EEG
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadText(`${meta.name}.bands.csv`, buildBandsCsv(rec))
                }
                leftIcon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                title="Download bands.csv"
              >
                Bands
              </Button>
              {rec.annotations.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    downloadText(
                      `${meta.name}.annotations.csv`,
                      buildAnnotationsCsv(rec),
                    )
                  }
                  leftIcon={<Flag className="h-3.5 w-3.5" />}
                  title="Download annotations.csv"
                >
                  Markers
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadText(
                    `${meta.name}.manifest.json`,
                    buildManifestJson(rec),
                    "application/json",
                  )
                }
                leftIcon={<FileJson className="h-3.5 w-3.5" />}
                title="Download manifest.json"
              >
                JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadRecordingFiles(rec, { preMs: 2000, postMs: 2000 })}
                leftIcon={<Download className="h-3.5 w-3.5" />}
              >
                All
              </Button>
            </>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              data not in memory
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Delete
          </Button>
        </div>
      </div>
      {expanded && rec && <RecordingReview rec={rec} />}
      {expanded && !rec && (
        <div className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">
          The full signal for this recording was dropped when the tab reloaded.
          The metadata above is preserved; re-import a CSV to review it later.
          (Persistence across reloads is planned.)
        </div>
      )}
    </div>
  );
}

function RecordingReview({ rec }: { rec: Recording }) {
  const [t, setT] = React.useState(0);
  // t is 0..1, position within the session.
  const bands = rec.bands;
  const currentIdx = bands.t_ms.length
    ? Math.min(
        bands.t_ms.length - 1,
        Math.floor(t * (bands.t_ms.length - 1)),
      )
    : 0;
  const currentMs = bands.t_ms[currentIdx] ?? 0;

  const stats = React.useMemo(() => {
    // mean/std per relative band + time in each state
    const summary = {} as Record<BandName, { mean: number; std: number }>;
    for (const b of BAND_NAMES) {
      const arr = bands.rel[b];
      if (arr.length === 0) {
        summary[b] = { mean: 0, std: 0 };
        continue;
      }
      let sum = 0;
      for (let i = 0; i < arr.length; i++) sum += arr[i];
      const mean = sum / arr.length;
      let vsum = 0;
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - mean;
        vsum += d * d;
      }
      summary[b] = { mean, std: Math.sqrt(vsum / arr.length) };
    }

    const stateTime = new Map<string, number>();
    if (bands.t_ms.length > 1) {
      const total = bands.t_ms[bands.t_ms.length - 1] - bands.t_ms[0];
      for (const s of bands.state) {
        stateTime.set(s, (stateTime.get(s) ?? 0) + total / bands.state.length);
      }
    }

    return { summary, stateTime };
  }, [bands]);

  return (
    <div className="border-t border-zinc-800 p-4">
      <BandTimeline rec={rec} playheadT={t} onSeek={setT} />

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <span className="font-mono tabular-nums">
          {formatMs(currentMs)} / {formatMs(rec.duration_ms)}
        </span>
        {BAND_NAMES.map((b) => (
          <span key={b} className="font-mono tabular-nums">
            <span style={{ color: BAND_COLORS[b] }}>{BAND_LABELS[b][0]}</span>{" "}
            {((bands.rel[b][currentIdx] ?? 0) * 100).toFixed(0)}%
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Session band stats (mean ± std)
          </div>
          <div className="grid grid-cols-5 gap-2">
            {BAND_NAMES.map((b) => {
              const s = stats.summary[b];
              return (
                <div
                  key={b}
                  className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-center"
                >
                  <div
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: BAND_COLORS[b] }}
                  >
                    {BAND_LABELS[b]}
                  </div>
                  <div className="mt-0.5 font-mono text-xs tabular-nums text-zinc-100">
                    {(s.mean * 100).toFixed(0)}%
                  </div>
                  <div className="font-mono text-[9px] tabular-nums text-zinc-500">
                    ± {(s.std * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Time in state
          </div>
          <div className="space-y-1.5">
            {[...stats.stateTime.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([state, ms]) => {
                const pct = ms / Math.max(1, rec.duration_ms);
                return (
                  <div key={state} className="flex items-center gap-2 text-xs">
                    <span className="w-16 capitalize text-zinc-300">
                      {state}
                    </span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-500/80"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[10px] tabular-nums text-zinc-500">
                      {(pct * 100).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Annotations list */}
      {rec.annotations.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Markers
          </div>
          <ul className="space-y-1 text-xs text-zinc-400">
            {rec.annotations.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-16 font-mono tabular-nums text-zinc-500">
                  {formatMs(a.t_ms)}
                </span>
                <span className="text-zinc-200">{a.label}</span>
                {a.detail && (
                  <span className="text-zinc-500">— {a.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BandTimeline({
  rec,
  playheadT,
  onSeek,
}: {
  rec: Recording;
  playheadT: number;
  onSeek: (t: number) => void;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const height = 180;
  React.useEffect(() => {
    const canvas = ref.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(24,24,27,0.3)";
      ctx.fillRect(0, 0, w, h);

      const n = rec.bands.t_ms.length;
      if (n < 2) return;

      for (const band of BAND_NAMES) {
        const arr = rec.bands.rel[band];
        ctx.strokeStyle = BAND_COLORS[band];
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const v = Math.max(0, Math.min(1, arr[i] ?? 0));
          const y = 4 + (1 - v) * (h - 8);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // annotation pins
      for (const a of rec.annotations) {
        const x = (a.t_ms / Math.max(1, rec.duration_ms)) * w;
        ctx.strokeStyle = "rgba(251,191,36,0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillStyle = "rgba(251,191,36,0.95)";
        ctx.fillRect(x - 3, 0, 6, 6);
      }

      // playhead
      const px = playheadT * w;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [rec, playheadT]);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    seekFromEvent(e);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    seekFromEvent(e);
  };
  const onUp = () => setDragging(false);
  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, x)));
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <canvas ref={ref} className="block w-full cursor-ew-resize rounded-md" />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {BAND_NAMES.map((b) => (
          <div key={b} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-3 rounded-sm"
              style={{ background: BAND_COLORS[b] }}
            />
            <span className="font-mono text-zinc-500">{BAND_LABELS[b]}</span>
          </div>
        ))}
        <span className="ml-auto font-mono text-zinc-600">
          Click or drag the timeline to scrub
        </span>
      </div>
    </div>
  );
}

// ───────────────────────── helpers ─────────────────────────

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return min > 0
    ? `${min}:${String(sec).padStart(2, "0")}`
    : `${sec}s`;
}

function defaultName(): string {
  return `session-${new Date().toISOString().slice(0, 16).replace(/[:]/g, "")}`;
}
