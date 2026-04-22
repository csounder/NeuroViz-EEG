"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";
import { BAND_NAMES, type BandName } from "@/lib/types";
import { BAND_COLORS, BAND_LABELS } from "@/lib/utils";
import { sampleUvToMindMonitorDb } from "@/lib/bandTraceDb";

const CHANNEL_LABELS = ["TP9", "AF7", "AF8", "TP10"] as const;

/** Distinct trace colors per electrode (Mind Monitor–style readability). */
const CHANNEL_TRACE_COLORS = [
  "rgb(52, 211, 153)", // emerald — TP9
  "rgb(96, 165, 250)", // blue — AF7
  "rgb(251, 191, 36)", // amber — AF8
  "rgb(167, 139, 250)", // violet — TP10
] as const;

export type BandTracesLayout = "overlay" | "stacked";

/**
 * Band-pass filtered time-domain EEG (client-side biquad bank @ stream rate).
 *
 *   layout="overlay"  → One canvas. Every **selected** band draws its four
 *                       channels (TP9…TP10) on top of each other in the **band
 *                       hue**, with opacity steps so traces stay separable.
 *                       Pick δ+θ+α+β+γ together to compare bands like Mind
 *                       Monitor’s multi-band overlay.
 *
 *   layout="stacked"  → One **horizontal strip per band** (δ, θ, α, β, γ).
 *                       Each strip is a time-domain row with the four channels
 *                       in **distinct colors** so electrodes are obvious. Select
 *                       any subset, or all five for a full dashboard.
 *
 * Vertical scaling follows **Mind Monitor–style dB**: 10·log10(µV²) with a
 * calibration offset so typical band-limited traces read ~80–100 dB, similar
 * to Mind Monitor’s on-screen band list (not identical to Muse’s closed SDK).
 */
export interface BandTracesChartProps {
  layout?: BandTracesLayout;
  /** Which bands to include. Defaults to all five. */
  bands?: BandName[];
  height?: number;
  autoScale?: boolean;
  /** When autoScale=false, manual ±dB half-span (bipolar around frame center). */
  scaleValue?: number;
  showLegend?: boolean;
}

function resolveLayout(
  layout: BandTracesLayout | undefined,
): BandTracesLayout {
  return layout ?? "overlay";
}

export function BandTracesChart({
  layout: layoutProp,
  bands,
  height = 360,
  autoScale = true,
  scaleValue = 200,
  showLegend = true,
}: BandTracesChartProps) {
  const layout = resolveLayout(layoutProp);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number | null>(null);

  const selected = React.useMemo<BandName[]>(
    () =>
      (bands && bands.length ? bands : [...BAND_NAMES]).filter((b) =>
        BAND_NAMES.includes(b),
      ),
    [bands],
  );

  React.useEffect(() => {
    const canvas = canvasRef.current;
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
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(24,24,27,0.6)");
      bg.addColorStop(1, "rgba(9,9,11,0.3)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const { rollingBandRaw } = useNeuroStore.getState();
      if (selected.length === 0) {
        textCenter(
          ctx,
          w,
          h,
          "No bands selected — pick one or more to display.",
        );
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      let anyTrace = false;
      for (const band of selected) {
        const ch0 = rollingBandRaw[band]?.[0];
        if (ch0 && ch0.length >= 2) {
          anyTrace = true;
          break;
        }
      }
      if (!anyTrace) {
        textCenter(
          ctx,
          w,
          h,
          "Waiting for EEG — start the browser sim (top bar) or connect a device streaming raw channels.",
        );
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      if (layout === "stacked") {
        drawStackedLayout(
          ctx,
          w,
          h,
          selected,
          rollingBandRaw,
          autoScale,
          scaleValue,
        );
      } else {
        drawOverlayLayout(
          ctx,
          w,
          h,
          selected,
          rollingBandRaw,
          autoScale,
          scaleValue,
        );
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [layout, selected, height, autoScale, scaleValue]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative w-full">
        <canvas ref={canvasRef} className="block w-full rounded-md" />
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {layout === "overlay" &&
            selected.map((b) => (
              <div key={b} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: BAND_COLORS[b] }}
                />
                <span className="text-zinc-300">{BAND_LABELS[b]}</span>
              </div>
            ))}
          {layout === "stacked" && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-zinc-500">Channels:</span>
              {CHANNEL_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: CHANNEL_TRACE_COLORS[i] }}
                  />
                  <span className="font-mono text-zinc-300">{label}</span>
                </div>
              ))}
            </div>
          )}
          {layout === "overlay" && (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              overlay · 4 ch / band (opacity TP9→TP10)
            </span>
          )}
          {layout === "stacked" && (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {selected.length} band strip{selected.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function collectDbExtentsOverlay(
  selected: BandName[],
  rollingBandRaw: Record<BandName, number[][]>,
): { dbMin: number; dbMax: number } {
  let dbMin = Infinity;
  let dbMax = -Infinity;
  for (const band of selected) {
    const chans = rollingBandRaw[band];
    if (!chans) continue;
    for (let ch = 0; ch < 4; ch++) {
      const buf = chans[ch] ?? [];
      for (let i = 0; i < buf.length; i++) {
        const db = sampleUvToMindMonitorDb(buf, i);
        if (db < dbMin) dbMin = db;
        if (db > dbMax) dbMax = db;
      }
    }
  }
  if (!Number.isFinite(dbMin) || !Number.isFinite(dbMax)) {
    return { dbMin: 82, dbMax: 94 };
  }
  if (dbMax - dbMin < 0.5) {
    const c = (dbMin + dbMax) / 2;
    return { dbMin: c - 1, dbMax: c + 1 };
  }
  return { dbMin, dbMax };
}

function resolveDbScale(
  autoScale: boolean,
  scaleValue: number,
  dbMin: number,
  dbMax: number,
): { centerDb: number; halfSpan: number } {
  const mid = (dbMin + dbMax) / 2;
  const span = dbMax - dbMin;
  if (autoScale) {
    const halfSpan = Math.max(span * 0.55, 3);
    return { centerDb: mid, halfSpan };
  }
  return { centerDb: mid, halfSpan: Math.max(scaleValue, 2.5) };
}

function yFromDb(
  db: number,
  midY: number,
  amp: number,
  centerDb: number,
  halfSpan: number,
): number {
  return midY - ((db - centerDb) / halfSpan) * amp;
}

function drawDbAxisHint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  centerDb: number,
  halfSpan: number,
) {
  ctx.save();
  ctx.fillStyle = "rgba(161,161,170,0.45)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`${(centerDb + halfSpan).toFixed(0)} dB`, w - 6, 6);
  ctx.textBaseline = "bottom";
  ctx.fillText(`${(centerDb - halfSpan).toFixed(0)} dB`, w - 6, h - 6);
  ctx.restore();
}

function drawOverlayLayout(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  selected: BandName[],
  rollingBandRaw: Record<BandName, number[][]>,
  autoScale: boolean,
  scaleValue: number,
) {
  ctx.strokeStyle = "rgba(63,63,70,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    const x = (i / 8) * w;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  ctx.stroke();

  const { dbMin, dbMax } = collectDbExtentsOverlay(selected, rollingBandRaw);
  const { centerDb, halfSpan } = resolveDbScale(
    autoScale,
    scaleValue,
    dbMin,
    dbMax,
  );

  const midY = h / 2;
  const amp = h * 0.42;

  ctx.strokeStyle = "rgba(63,63,70,0.55)";
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  drawDbAxisHint(ctx, w, h, centerDb, halfSpan);

  for (const band of selected) {
    const color = BAND_COLORS[band];
    const chans = rollingBandRaw[band];
    if (!chans) continue;

    const channelAlphas = [0.95, 0.75, 0.6, 0.45];
    for (let ch = 0; ch < 4; ch++) {
      const buf = chans[ch] ?? [];
      if (buf.length < 2) continue;
      ctx.strokeStyle = color;
      ctx.globalAlpha = channelAlphas[ch];
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      const step = w / (buf.length - 1);
      for (let i = 0; i < buf.length; i++) {
        const x = i * step;
        const db = sampleUvToMindMonitorDb(buf, i);
        const y = yFromDb(db, midY, amp, centerDb, halfSpan);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawStackedLayout(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  selected: BandName[],
  rollingBandRaw: Record<BandName, number[][]>,
  autoScale: boolean,
  scaleValue: number,
) {
  const n = selected.length;
  const gutter = 52;
  const plotW = Math.max(24, w - gutter);
  const rowH = h / n;

  for (let bi = 0; bi < n; bi++) {
    const band = selected[bi];
    const y0 = bi * rowH;
    const midY = y0 + rowH / 2;
    const chans = rollingBandRaw[band];
    if (!chans) continue;

    ctx.fillStyle =
      bi % 2 === 0 ? "rgba(24,24,27,0.25)" : "rgba(15,15,18,0.2)";
    ctx.fillRect(0, y0, w, rowH);

    let dbMin = Infinity;
    let dbMax = -Infinity;
    for (let ch = 0; ch < 4; ch++) {
      const buf = chans[ch] ?? [];
      for (let i = 0; i < buf.length; i++) {
        const db = sampleUvToMindMonitorDb(buf, i);
        if (db < dbMin) dbMin = db;
        if (db > dbMax) dbMax = db;
      }
    }
    if (!Number.isFinite(dbMin) || !Number.isFinite(dbMax)) {
      dbMin = 82;
      dbMax = 94;
    }
    if (dbMax - dbMin < 0.5) {
      const c = (dbMin + dbMax) / 2;
      dbMin = c - 1;
      dbMax = c + 1;
    }
    const { centerDb, halfSpan } = resolveDbScale(
      autoScale,
      scaleValue,
      dbMin,
      dbMax,
    );

    const amp = rowH * 0.36;

    if (bi < n - 1) {
      ctx.strokeStyle = "rgba(63,63,70,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y0 + rowH);
      ctx.lineTo(w, y0 + rowH);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(63,63,70,0.5)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(gutter, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = BAND_COLORS[band];
    ctx.font = "600 11px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(BAND_LABELS[band], 10, midY);

    ctx.save();
    ctx.fillStyle = "rgba(161,161,170,0.35)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`${(centerDb + halfSpan).toFixed(0)}`, w - 4, y0 + 4);
    ctx.textBaseline = "bottom";
    ctx.fillText(`${(centerDb - halfSpan).toFixed(0)}`, w - 4, y0 + rowH - 4);
    ctx.restore();

    for (let ch = 0; ch < 4; ch++) {
      const buf = chans[ch] ?? [];
      if (buf.length < 2) continue;
      ctx.strokeStyle = CHANNEL_TRACE_COLORS[ch];
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < buf.length; i++) {
        const x = gutter + (i / (buf.length - 1)) * plotW;
        const db = sampleUvToMindMonitorDb(buf, i);
        const y = yFromDb(db, midY, amp, centerDb, halfSpan);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function textCenter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  msg: string,
) {
  ctx.fillStyle = "rgba(161,161,170,0.6)";
  ctx.font = "12px ui-sans-serif, system-ui";
  const m = ctx.measureText(msg);
  ctx.fillText(msg, w / 2 - m.width / 2, h / 2);
}
