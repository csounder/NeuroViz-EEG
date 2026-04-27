"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";
import { useNeuroStore } from "@/lib/store";
import type { BandName } from "@/lib/types";
import { BAND_NAMES } from "@/lib/types";

const CHAN_LABELS = ["TP9", "AF7", "AF8", "TP10"] as const;
const MAX_BUFFER_MS = 120_000;
/** Typical WebSocket `eeg` rate (~10 Hz); full device rate is higher. */
const WS_EEG_HINT = "~10 Hz";

type EegPoint = { t: number; raw: number[]; proc: number[] | null };

function valueAt(p: EegPoint, ch: number, key: "raw" | "proc"): number | null {
  const arr = key === "raw" ? p.raw : p.proc;
  if (!arr || arr[ch] == null || !Number.isFinite(arr[ch])) return null;
  return arr[ch];
}

function interpAt(
  points: EegPoint[],
  tMs: number,
  ch: number,
  key: "raw" | "proc",
): number | null {
  if (points.length < 1) return null;
  if (points.length === 1) return valueAt(points[0], ch, key);
  if (tMs <= points[0].t) return valueAt(points[0], ch, key);
  const last = points[points.length - 1];
  if (tMs >= last.t) return valueAt(last, ch, key);
  let i = 0;
  while (i < points.length - 1 && points[i + 1].t < tMs) i++;
  const a = points[i];
  const b = points[i + 1];
  const va = valueAt(a, ch, key);
  const vb = valueAt(b, ch, key);
  if (va == null || vb == null) return null;
  const u = (tMs - a.t) / Math.max(1, b.t - a.t);
  return va + u * (vb - va);
}

function rmsBetween(
  points: EegPoint[],
  t0: number,
  t1: number,
  ch: number,
  key: "raw" | "proc",
): number | null {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const xs: number[] = [];
  for (const p of points) {
    if (p.t < lo || p.t > hi) continue;
    const v = valueAt(p, ch, key);
    if (v != null) xs.push(v);
  }
  if (xs.length < 2) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
}

export function ResearchConditioningLab() {
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const bandHistory = useNeuroStore((s) => s.bandHistory);

  const bufferRef = React.useRef<EegPoint[]>([]);
  const eegAutoHalfUvRef = React.useRef(75);
  const bandAutoYMaxRef = React.useRef(0.35);

  const [tab, setTab] = React.useState<"eeg" | "bands">("eeg");
  const [channel, setChannel] = React.useState(0);
  const [windowSec, setWindowSec] = React.useState(30);
  const [showRaw, setShowRaw] = React.useState(true);
  const [showProc, setShowProc] = React.useState(true);
  const [eegYScale, setEegYScale] = React.useState<ScaleState>({ auto: true, value: 150 });
  const [bandYScale, setBandYScale] = React.useState<ScaleState>({ auto: true, value: 80 });
  const [markerA, setMarkerA] = React.useState<number | null>(null);
  const [markerB, setMarkerB] = React.useState<number | null>(null);
  const [bandPick, setBandPick] = React.useState<BandName>("alpha");
  const [bandSmooth, setBandSmooth] = React.useState(0.35);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = React.useState(800);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setCanvasW(Math.max(320, Math.floor(el.getBoundingClientRect().width)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  React.useEffect(() => {
    const m = latestEEG;
    if (!m?.raw || m.raw.length < 4) return;
    const t = Number(m.timestamp) || Date.now();
    const proc =
      m.processed && m.processed.length >= 4 ? [...m.processed] : null;
    const buf = bufferRef.current;
    buf.push({ t, raw: [...m.raw], proc });
    const cutoff = t - MAX_BUFFER_MS;
    while (buf.length && buf[0].t < cutoff) buf.shift();
  }, [latestEEG?.timestamp, latestEEG?.raw, latestEEG?.processed]);

  const points = React.useMemo(() => {
    const buf = bufferRef.current;
    if (!buf.length) return [];
    const tMax = buf[buf.length - 1].t;
    const tMin = tMax - windowSec * 1000;
    return buf.filter((p) => p.t >= tMin);
  }, [windowSec, latestEEG?.timestamp]);

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || points.length < 2) return;
    const measured = Math.floor(wrap.getBoundingClientRect().width);
    const w = Math.max(320, measured > 0 ? measured : canvasW);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssH = 340;
    const padL = 52;
    const padR = 12;
    const padT = 14;
    const padB = 36;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, cssH);

    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const plotW = w - padL - padR;
    const plotH = cssH - padT - padB;
    const tx = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * plotW;

    let vmin: number;
    let vmax: number;
    if (eegYScale.auto) {
      let peak = 0;
      for (const p of points) {
        if (showRaw) {
          const v = p.raw[channel];
          if (Number.isFinite(v)) peak = Math.max(peak, Math.abs(v));
        }
        if (showProc && p.proc) {
          const v = p.proc[channel];
          if (Number.isFinite(v)) peak = Math.max(peak, Math.abs(v));
        }
      }
      if (!Number.isFinite(peak) || peak < 1) peak = 25;
      eegAutoHalfUvRef.current =
        eegAutoHalfUvRef.current * 0.88 + peak * 1.12 * 0.12;
      const half = Math.max(12, eegAutoHalfUvRef.current);
      vmin = -half;
      vmax = half;
    } else {
      const half = Math.max(5, eegYScale.value);
      vmin = -half;
      vmax = half;
    }
    const ty = (v: number) => padT + (1 - (v - vmin) / Math.max(1e-9, vmax - vmin)) * plotH;

    ctx.strokeStyle = "rgba(39,39,42,0.9)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 8; g++) {
      const y = padT + (g / 8) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    for (let g = 0; g <= 10; g++) {
      const x = padL + (g / 10) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }

    const drawSeries = (key: "raw" | "proc", color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      for (const p of points) {
        const v = valueAt(p, channel, key);
        if (v == null) continue;
        const x = tx(p.t);
        const y = ty(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      if (started) ctx.stroke();
    };

    if (showRaw) drawSeries("raw", "rgba(52,211,153,0.85)");
    if (showProc) drawSeries("proc", "rgba(251,191,36,0.9)");

    const drawMarker = (t: number | null, color: string, label: string) => {
      if (t == null || t < t0 || t > t1) return;
      const x = tx(t);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(label, x + 3, padT + 12);
    };
    drawMarker(markerA, "rgb(96,165,250)", "A");
    drawMarker(markerB, "rgb(244,114,182)", "B");

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("µV", 8, padT + plotH / 2);
    ctx.textAlign = "right";
    for (let g = 0; g <= 4; g++) {
      const v = vmin + (g / 4) * (vmax - vmin);
      const y = ty(v);
      ctx.fillText(`${v.toFixed(0)}`, padL - 6, y + 4);
    }
    ctx.textAlign = "left";
    const dtSec = ((t1 - t0) / 1000).toFixed(2);
    ctx.fillText(
      `time →  (${dtSec}s of samples · ${windowSec}s view · ${WS_EEG_HINT} packets)`,
      padL,
      cssH - 10,
    );
  }, [
    points,
    channel,
    canvasW,
    windowSec,
    eegYScale.auto,
    eegYScale.value,
    showRaw,
    showProc,
    markerA,
    markerB,
  ]);

  React.useEffect(() => {
    draw();
  }, [draw, tab]);

  const onCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (points.length < 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padL = 52;
    const padR = 12;
    const plotW = Math.max(1, rect.width - padL - padR);
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const u = (x - padL) / Math.max(1, plotW);
    if (u < 0 || u > 1) return;
    const t = t0 + u * (t1 - t0);
    if (e.shiftKey) setMarkerB(t);
    else setMarkerA(t);
  };

  const meas =
    markerA != null && markerB != null && points.length > 1
      ? {
          dt: Math.abs(markerB - markerA),
          rmsRaw: rmsBetween(points, markerA, markerB, channel, "raw"),
          rmsProc: rmsBetween(points, markerA, markerB, channel, "proc"),
          vaR: interpAt(points, markerA, channel, "raw"),
          vbR: interpAt(points, markerB, channel, "raw"),
          vaP: interpAt(points, markerA, channel, "proc"),
          vbP: interpAt(points, markerB, channel, "proc"),
        }
      : null;

  const bandSeries = React.useMemo(() => {
    const tMax = Date.now();
    const tMin = tMax - windowSec * 1000;
    return bandHistory.filter((h) => h.t >= tMin);
  }, [bandHistory, windowSec]);

  const bandSmoothed = React.useMemo(() => {
    const alpha = Math.max(0.01, Math.min(0.95, bandSmooth));
    const out: { t: number; v: number }[] = [];
    let prev: number | null = null;
    for (const h of bandSeries) {
      const v = h.rel[bandPick];
      if (!Number.isFinite(v)) continue;
      prev = prev == null ? v : prev * (1 - alpha) + v * alpha;
      out.push({ t: h.t, v: prev });
    }
    return out;
  }, [bandSeries, bandPick, bandSmooth]);

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Activity className="h-4 w-4" />}
          description="High-DPI plot with axes, grid, and A/B markers. EEG uses paired raw vs server-processed from each packet (same conditioning as /api/dsp/config). Band view compares instantaneous relative power to an EMA smooth."
        >
          Conditioning lab
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[11px] leading-relaxed text-zinc-500">
          <strong className="text-zinc-400">Sampling note:</strong> the dashboard WebSocket streams EEG at about{" "}
          <strong className="text-zinc-300">{WS_EEG_HINT}</strong> for performance. The graph is drawn at device pixel
          ratio for a crisp trace; for full acquisition rate, record to disk or use a dedicated raw stream. References:
          typical preprocessing steps in{" "}
          <a
            className="text-emerald-400 underline"
            href="https://mne.tools/stable/documentation/cookbook.html"
            target="_blank"
            rel="noreferrer"
          >
            MNE-Python
          </a>{" "}
          and filter wrappers in{" "}
          <a
            className="text-emerald-400 underline"
            href="https://braindecode.org/stable/auto_examples/model_building/plot_preprocessing_classes.html"
            target="_blank"
            rel="noreferrer"
          >
            Braindecode
          </a>{" "}
          (NeuroVis implements bandpass, notch, average reference, EMA, and optional 3-point median in Node).
        </p>

        <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "eeg" ? "bg-emerald-900/50 text-emerald-200" : "bg-zinc-900 text-zinc-400"
            }`}
            onClick={() => setTab("eeg")}
          >
            EEG µV
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "bands" ? "bg-emerald-900/50 text-emerald-200" : "bg-zinc-900 text-zinc-400"
            }`}
            onClick={() => setTab("bands")}
          >
            Relative band
          </button>
        </div>

        {tab === "eeg" ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <label className="flex items-center gap-1 text-zinc-300">
                Channel
                <select
                  value={channel}
                  onChange={(e) => setChannel(Number(e.target.value))}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  {CHAN_LABELS.map((label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-zinc-300">
                Window
                <select
                  value={windowSec}
                  onChange={(e) => setWindowSec(Number(e.target.value))}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  <option value={10}>10 s</option>
                  <option value={30}>30 s</option>
                  <option value={60}>60 s</option>
                  <option value={90}>90 s</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showRaw}
                  onChange={(e) => setShowRaw(e.target.checked)}
                />
                Raw
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={showProc}
                  onChange={(e) => setShowProc(e.target.checked)}
                />
                Server processed
              </label>
            </div>
            <ScaleControl
              className="w-full"
              compact
              state={eegYScale}
              onChange={setEegYScale}
              min={10}
              max={800}
              bipolar
              unit="µV"
              label="Y scale (EEG)"
              helpAuto="Symmetric axis tracks peak |amplitude| with smoothing (EMA) so traces stay visible without clipping."
              helpManual="Fixed half-range: ±slider value in µV."
            />
            <p className="text-[10px] text-zinc-600">
              Click the plot to place marker <span className="text-blue-400">A</span>; Shift+click for{" "}
              <span className="text-pink-400">B</span>. Interpolated amplitudes and RMS use linear time between samples.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <label className="flex items-center gap-1 text-zinc-300">
                Band
                <select
                  value={bandPick}
                  onChange={(e) => setBandPick(e.target.value as BandName)}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  {BAND_NAMES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-zinc-300">
                Window
                <select
                  value={windowSec}
                  onChange={(e) => setWindowSec(Number(e.target.value))}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  <option value={30}>30 s</option>
                  <option value={60}>60 s</option>
                  <option value={120}>120 s</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                EMA α
                <input
                  type="range"
                  min={0.05}
                  max={0.9}
                  step={0.05}
                  value={bandSmooth}
                  onChange={(e) => setBandSmooth(Number(e.target.value))}
                  className="w-28 accent-amber-500"
                />
                {bandSmooth.toFixed(2)}
              </label>
            </div>
            <ScaleControl
              className="w-full"
              compact
              state={bandYScale}
              onChange={setBandYScale}
              min={5}
              max={100}
              unit="% of 1.0"
              label="Y scale (relative)"
              helpAuto="Top of axis follows the larger of instant vs smoothed trace (EMA), capped at 1.0."
              helpManual="Upper axis limit = slider ÷ 100 (e.g. 40 → 0.40 max) to zoom weak bands."
            />
          </>
        )}

        <div
          ref={wrapRef}
          className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
        >
          {tab === "eeg" ? (
            <canvas
              ref={canvasRef}
              className="block max-w-full cursor-crosshair touch-none"
              onPointerDown={onCanvasPointer}
            />
          ) : (
            <BandCompareCanvas
              embedded
              width={canvasW}
              instant={bandSeries.map((h) => ({ t: h.t, v: h.rel[bandPick] ?? 0 }))}
              smoothed={bandSmoothed}
              yScale={bandYScale}
              bandAutoYMaxRef={bandAutoYMaxRef}
            />
          )}
        </div>

        {tab === "eeg" ? (
          meas ? (
            <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[11px] text-zinc-300 sm:grid-cols-2">
              <div>Δt (markers)</div>
              <div className="text-emerald-300">{meas.dt.toFixed(1)} ms</div>
              <div>RMS raw (interval)</div>
              <div>{meas.rmsRaw != null ? `${meas.rmsRaw.toFixed(2)} µV` : "—"}</div>
              <div>RMS processed (interval)</div>
              <div>{meas.rmsProc != null ? `${meas.rmsProc.toFixed(2)} µV` : "—"}</div>
              <div>V raw @ A / B</div>
              <div>
                {meas.vaR?.toFixed(2) ?? "—"} / {meas.vbR?.toFixed(2) ?? "—"} µV
              </div>
              <div>V proc @ A / B</div>
              <div>
                {meas.vaP?.toFixed(2) ?? "—"} / {meas.vbP?.toFixed(2) ?? "—"} µV
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-600">Set two markers to see Δt, interval RMS, and point amplitudes.</p>
          )
        ) : (
          <p className="text-[10px] text-zinc-600">
            Gold = relative power as received; amber = EMA of the same series (display smoothing only, not the server
            z-score path).
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function BandCompareCanvas({
  width,
  instant,
  smoothed,
  yScale,
  bandAutoYMaxRef,
  embedded = false,
}: {
  width: number;
  instant: { t: number; v: number }[];
  smoothed: { t: number; v: number }[];
  yScale: ScaleState;
  bandAutoYMaxRef: React.MutableRefObject<number>;
  /** When true, render only the canvas (parent supplies border / width shell). */
  embedded?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const cssH = 280;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || instant.length < 2) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, width, cssH);
    const padL = 48;
    const padR = 10;
    const padT = 12;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = cssH - padT - padB;
    const t0 = instant[0].t;
    const t1 = instant[instant.length - 1].t;
    const tx = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
    const vmin = 0;
    let vmax: number;
    if (yScale.auto) {
      let m = 0;
      for (const p of instant) {
        if (Number.isFinite(p.v)) m = Math.max(m, p.v);
      }
      for (const p of smoothed) {
        if (Number.isFinite(p.v)) m = Math.max(m, p.v);
      }
      if (!Number.isFinite(m) || m < 1e-6) {
        vmax = 1;
      } else {
        const target = Math.min(1, Math.max(0.05, m * 1.18));
        bandAutoYMaxRef.current =
          bandAutoYMaxRef.current * 0.88 + target * 0.12;
        vmax = Math.min(1, Math.max(0.04, bandAutoYMaxRef.current));
      }
    } else {
      vmax = Math.max(0.02, Math.min(1, yScale.value / 100));
    }
    const ty = (v: number) => padT + (1 - (v - vmin) / Math.max(1e-9, vmax - vmin)) * plotH;

    ctx.strokeStyle = "rgba(39,39,42,0.9)";
    for (let g = 0; g <= 8; g++) {
      const y = padT + (g / 8) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    const strokePath = (pts: { t: number; v: number }[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let s = false;
      for (const p of pts) {
        if (!Number.isFinite(p.v)) continue;
        const x = tx(p.t);
        const y = ty(p.v);
        if (!s) {
          ctx.moveTo(x, y);
          s = true;
        } else ctx.lineTo(x, y);
      }
      if (s) ctx.stroke();
    };
    strokePath(instant, "rgba(251,191,36,0.85)");
    strokePath(smoothed, "rgba(52,211,153,0.75)");

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    for (let g = 0; g <= 4; g++) {
      const v = vmin + (g / 4) * (vmax - vmin);
      ctx.fillText(v.toFixed(3), padL - 4, ty(v) + 3);
    }
    ctx.textAlign = "left";
    ctx.fillText("relative →", padL, cssH - 8);
  }, [width, instant, smoothed, yScale.auto, yScale.value]);

  if (instant.length < 2) {
    return (
      <div
        className={`flex h-40 items-center justify-center text-sm text-zinc-500 ${
          embedded ? "" : "rounded-lg border border-zinc-800 bg-zinc-950"
        }`}
      >
        Waiting for band history…
      </div>
    );
  }

  const canvasEl = <canvas ref={canvasRef} className="block max-w-full" />;
  if (embedded) return canvasEl;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">{canvasEl}</div>
  );
}
