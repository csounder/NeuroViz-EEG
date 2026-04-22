"use client";

import * as React from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useNeuroStore } from "@/lib/store";
import { BAND_COLORS, BAND_LABELS, cn } from "@/lib/utils";
import { BAND_NAMES, BAND_RANGES } from "@/lib/types";
import { computePSD } from "@/lib/fft";

/**
 * 3D FFT Waterfall.
 *
 * Every `updateIntervalMs`, pull the rolling raw buffer for `channel`, compute
 * a PSD, resample to `nBins` bins spanning [0, maxFreq] Hz, and push one row
 * into the history (up to `nRows` rows).
 *
 * Rendering uses a simple isometric projection controlled by two angles:
 *
 *   elevation α  — how much each row shifts UP as it recedes (0° = flat, 90° =
 *                  straight overhead view).
 *   azimuth   β  — how much each row shifts SIDEWAYS as it recedes (0° =
 *                  looking head-on; +β = tilted from the right).
 *
 * The depth budget is auto-fit to the canvas: the oldest row lands exactly at
 * the "vanishing point" no matter how many rows you keep, so the display can
 * never overflow. Far rows are also narrower (perspective shrink) and fade to
 * give the classic receding-into-the-distance look.
 */
export interface WaterfallProps {
  height?: number;
  nBins?: number;
  maxFreq?: number;
  nRows?: number;
  sampleRate?: number;
  channel?: number;
  updateIntervalMs?: number;

  /** Internal amplitude scale (multiplies ridge height). Default 1. */
  ampScale?: number;

  /** If true, dB range auto-tracks the signal (EMA). If false, the currently
   *  tracked range is frozen and `scaleValue` becomes a zoom-around-mean. */
  autoScale?: boolean;
  /** Manual dB span around the frozen mean when autoScale is false. */
  scaleValue?: number;

  /** View angle — elevation in degrees (10..60 looks best). Default 28. */
  elevation?: number;
  /** View angle — azimuth in degrees (-40..40). Default 16. */
  azimuth?: number;
  /** How much far rows shrink relative to the front row (0..0.7). Default 0.3. */
  perspective?: number;
  /** Depth budget as a fraction of the canvas height (0.3..0.9). Default 0.55. */
  depthFrac?: number;

  /** When true, show a compact on-canvas control cluster (angle, tilt, zoom). */
  showControls?: boolean;
  elevationDefault?: number;
  azimuthDefault?: number;
  ampDefault?: number;

  className?: string;
}

export function WaterfallChart({
  height = 440,
  nBins = 60,
  maxFreq = 60,
  nRows = 90,
  sampleRate = 256,
  channel = 0,
  updateIntervalMs = 120,
  ampScale: ampScaleProp = 1,
  autoScale = true,
  scaleValue = 60,
  elevation: elevationProp = 28,
  azimuth: azimuthProp = 16,
  perspective = 0.3,
  depthFrac = 0.55,
  showControls = true,
  elevationDefault = 28,
  azimuthDefault = 16,
  ampDefault = 1,
  className,
}: WaterfallProps) {
  // If the parent controls ampScale via prop and doesn't pass showControls,
  // honor the prop; otherwise keep it as internal state so the on-canvas
  // toolbar can drive it.
  const [elevation, setElevation] = React.useState(elevationProp);
  const [azimuth, setAzimuth] = React.useState(azimuthProp);
  const [ampLocal, setAmpLocal] = React.useState(ampScaleProp);
  React.useEffect(() => setElevation(elevationProp), [elevationProp]);
  React.useEffect(() => setAzimuth(azimuthProp), [azimuthProp]);
  React.useEffect(() => setAmpLocal(ampScaleProp), [ampScaleProp]);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const historyRef = React.useRef<Float32Array[]>([]);
  const lastComputeRef = React.useRef(0);

  // EMA-smoothed dB min/max for dynamic normalization.
  const yMinRef = React.useRef(-30);
  const yMaxRef = React.useRef(20);

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

    const bandIndexForFreq = (freq: number) => {
      if (freq < 4) return 0;
      if (freq < 8) return 1;
      if (freq < 13) return 2;
      if (freq < 30) return 3;
      return 4;
    };

    const recompute = () => {
      const { rollingRaw } = useNeuroStore.getState();
      const buf = rollingRaw[channel] ?? [];
      if (buf.length < 64) return;

      const psd = computePSD(buf, sampleRate, {
        targetN: 512,
        minFreq: 0,
        maxFreq,
      });
      if (!psd) return;

      // Resample onto exactly `nBins` bins across 0..maxFreq
      const row = new Float32Array(nBins);
      const freqs = psd.freqs;
      const db = psd.psdDb;
      if (freqs.length < 2) return;
      for (let i = 0; i < nBins; i++) {
        const f = (i / (nBins - 1)) * maxFreq;
        let lo = 0;
        let hi = freqs.length - 1;
        while (lo + 1 < hi) {
          const mid = (lo + hi) >> 1;
          if (freqs[mid] <= f) lo = mid;
          else hi = mid;
        }
        const f0 = freqs[lo];
        const f1 = freqs[hi];
        const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
        row[i] = db[lo] + t * (db[hi] - db[lo]);
      }

      if (autoScale) {
        let rMin = Infinity;
        let rMax = -Infinity;
        for (let i = 0; i < nBins; i++) {
          const v = row[i];
          if (Number.isFinite(v)) {
            if (v < rMin) rMin = v;
            if (v > rMax) rMax = v;
          }
        }
        if (Number.isFinite(rMin) && Number.isFinite(rMax) && rMax > rMin) {
          yMinRef.current = yMinRef.current * 0.9 + rMin * 0.1;
          yMaxRef.current = yMaxRef.current * 0.9 + rMax * 0.1;
        }
      } else {
        // Manual mode: center the window on the *current* mean (so the
        // display stays readable instead of clipping to a hard-coded −20 dB).
        const mid = (yMinRef.current + yMaxRef.current) / 2;
        const span = Math.max(10, scaleValue);
        yMinRef.current = mid - span / 2;
        yMaxRef.current = mid + span / 2;
      }

      historyRef.current.push(row);
      if (historyRef.current.length > nRows) historyRef.current.shift();
    };

    const draw = () => {
      const now = performance.now();
      if (now - lastComputeRef.current > updateIntervalMs) {
        lastComputeRef.current = now;
        recompute();
      }

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);

      // Band label strip at the top
      const padL = 54;
      const padR = 22;
      const padT = 26;
      const padB = 30;

      // Available plot region
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;

      // --- 3D projection -------------------------------------------------
      // elevation α and azimuth β in radians
      const α = (elevation * Math.PI) / 180;
      const β = (azimuth * Math.PI) / 180;
      // Total pixel budget reserved for depth → fills proportion of plotH
      const depthBudgetY = plotH * depthFrac * Math.sin(α);
      // Sideways parallax budget — cap it so the oldest row never slides out
      const depthBudgetX = Math.min(plotW * 0.35, 140) * Math.sin(β);
      // Per-row shrink so far rows narrow like a receding highway
      const shrinkMax = Math.max(0, Math.min(0.7, perspective));
      // Front-row vertical baseline (biggest y = bottom)
      const baseline = H - padB - 6;
      // Width of the *front* row; far rows scale down from this
      const frontRowW = plotW - Math.abs(depthBudgetX);
      const frontRowLeft = padL + (depthBudgetX > 0 ? 0 : -depthBudgetX);
      // Max ridge height at front row
      const frontAmpPx = plotH * 0.38 * ampLocal;

      // Band regions on the back wall (drawn once, before rows)
      const backLeft = frontRowLeft + depthBudgetX * 1; // shifted fully back
      const backW = frontRowW * (1 - shrinkMax);
      const backTop = baseline - depthBudgetY;
      for (const band of BAND_NAMES) {
        const [lo, hi] = BAND_RANGES[band];
        const xA =
          backLeft +
          ((backW - (backW * (backW - backW)) / backW) *
            Math.max(0, lo)) /
            maxFreq;
        const x1 = backLeft + (Math.max(0, lo) / maxFreq) * backW;
        const x2 = backLeft + (Math.min(hi, maxFreq) / maxFreq) * backW;
        if (x2 <= x1) continue;
        ctx.fillStyle = BAND_COLORS[band] + "10";
        ctx.fillRect(x1, padT, x2 - x1, backTop - padT);
      }

      // Band labels (top strip, mapped to front-row x)
      ctx.font = "bold 9px ui-monospace, Menlo, monospace";
      for (const band of BAND_NAMES) {
        const [lo, hi] = BAND_RANGES[band];
        const x1 = frontRowLeft + (Math.max(0, lo) / maxFreq) * frontRowW;
        const x2 = frontRowLeft + (Math.min(hi, maxFreq) / maxFreq) * frontRowW;
        if (x2 <= x1) continue;
        ctx.fillStyle = BAND_COLORS[band] + "30";
        ctx.fillRect(x1, 6, x2 - x1, 14);
        ctx.fillStyle = BAND_COLORS[band];
        ctx.fillText(BAND_LABELS[band], x1 + 3, 17);
      }

      // Frequency axis — along the front row baseline
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "rgba(161,161,170,0.85)";
      for (const f of [0, 4, 8, 13, 30, maxFreq]) {
        const x = frontRowLeft + (f / maxFreq) * frontRowW;
        ctx.fillText(`${f}`, x - 6, H - 10);
        // tiny axis tick
        ctx.strokeStyle = "rgba(113,113,122,0.5)";
        ctx.beginPath();
        ctx.moveTo(x, baseline);
        ctx.lineTo(x, baseline + 4);
        ctx.stroke();
      }
      ctx.fillText("Hz", frontRowLeft + frontRowW + 4, H - 10);

      // Axis hints
      ctx.fillStyle = "rgba(113,113,122,0.9)";
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.fillText("← Time (older)", W - 118, 20);
      ctx.fillText("Amplitude ↑", 8, 20);

      // dB scale reference on the left edge
      ctx.strokeStyle = "rgba(63,63,70,0.8)";
      ctx.beginPath();
      ctx.moveTo(padL - 4, backTop);
      ctx.lineTo(padL - 4, baseline);
      ctx.stroke();
      ctx.fillStyle = "rgba(161,161,170,0.8)";
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillText(`${yMaxRef.current.toFixed(0)}`, 4, backTop + 8);
      ctx.fillText(`${yMinRef.current.toFixed(0)}`, 4, baseline);
      ctx.save();
      ctx.translate(16, (backTop + baseline) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("dB", 0, 0);
      ctx.restore();

      const history = historyRef.current;
      const nH = history.length;
      if (nH === 0) {
        ctx.fillStyle = "rgba(161,161,170,0.6)";
        ctx.font = "12px ui-sans-serif, system-ui";
        const msg = "Collecting EEG…";
        const m = ctx.measureText(msg);
        ctx.fillText(msg, padL + plotW / 2 - m.width / 2, padT + plotH / 2);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const yMin = yMinRef.current - 2;
      const yMax = yMaxRef.current + 2;
      const yRange = Math.max(0.1, yMax - yMin);
      const toAmp = (db: number) =>
        Math.max(0, Math.min(1.3, (db - yMin) / yRange));

      // Draw back to front. r=0 is oldest (back), r=nH-1 is newest (front).
      for (let r = 0; r < nH; r++) {
        const rd = history[r];
        const depth = 1 - r / Math.max(1, nH - 1); // 1 at back, 0 at front
        const s = 1 - depth * shrinkMax; // perspective scale (1 = front)
        const xOff = depth * depthBudgetX;
        const yOff = -depth * depthBudgetY;
        const rowLeft = frontRowLeft + xOff + (1 - s) * (frontRowW / 2);
        const rowW = frontRowW * s;
        const rowAmpPx = frontAmpPx * s; // ridges shrink with depth too

        const alpha = 0.1 + (1 - depth) * 0.9;

        const midFreq = maxFreq / 2;
        const midBandIdx = bandIndexForFreq(midFreq);
        const midBandColor = BAND_COLORS[BAND_NAMES[midBandIdx]] ?? "#10b981";

        // Filled polygon (subtle tint of mid-band)
        ctx.beginPath();
        ctx.moveTo(rowLeft, baseline + yOff);
        for (let b = 0; b < nBins; b++) {
          const x = rowLeft + (b / (nBins - 1)) * rowW;
          const amp = toAmp(rd[b]) * rowAmpPx;
          ctx.lineTo(x, baseline + yOff - amp);
        }
        ctx.lineTo(rowLeft + rowW, baseline + yOff);
        ctx.closePath();
        ctx.fillStyle =
          midBandColor +
          Math.floor(alpha * 26)
            .toString(16)
            .padStart(2, "0");
        ctx.fill();

        // Line segments colored by band
        for (let b = 1; b < nBins; b++) {
          const freq = (b / (nBins - 1)) * maxFreq;
          const bi = bandIndexForFreq(freq);
          const col = BAND_COLORS[BAND_NAMES[bi]];
          const x0 = rowLeft + ((b - 1) / (nBins - 1)) * rowW;
          const y0 = baseline + yOff - toAmp(rd[b - 1]) * rowAmpPx;
          const x1 = rowLeft + (b / (nBins - 1)) * rowW;
          const y1 = baseline + yOff - toAmp(rd[b]) * rowAmpPx;
          ctx.strokeStyle = col;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = r === nH - 1 ? 1.6 : 1.1;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [
    height,
    nBins,
    maxFreq,
    nRows,
    sampleRate,
    channel,
    updateIntervalMs,
    ampLocal,
    autoScale,
    scaleValue,
    elevation,
    azimuth,
    perspective,
    depthFrac,
  ]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <canvas ref={canvasRef} className="block w-full rounded-md" />
      {showControls && (
        <ViewControls
          elevation={elevation}
          azimuth={azimuth}
          amp={ampLocal}
          onElevation={setElevation}
          onAzimuth={setAzimuth}
          onAmp={setAmpLocal}
          onReset={() => {
            setElevation(elevationDefault);
            setAzimuth(azimuthDefault);
            setAmpLocal(ampDefault);
          }}
        />
      )}
    </div>
  );
}

function ViewControls({
  elevation,
  azimuth,
  amp,
  onElevation,
  onAzimuth,
  onAmp,
  onReset,
}: {
  elevation: number;
  azimuth: number;
  amp: number;
  onElevation: (v: number) => void;
  onAzimuth: (v: number) => void;
  onAmp: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-[10px] text-zinc-400 backdrop-blur-sm">
      <ControlRow
        label="ANGLE"
        value={`${elevation}°`}
        onMinus={() => onElevation(Math.max(5, elevation - 2))}
        onPlus={() => onElevation(Math.min(70, elevation + 2))}
      />
      <ControlRow
        label="TILT"
        value={`${azimuth > 0 ? "+" : ""}${azimuth}°`}
        onMinus={() => onAzimuth(Math.max(-40, azimuth - 2))}
        onPlus={() => onAzimuth(Math.min(40, azimuth + 2))}
      />
      <ControlRow
        label="ZOOM"
        value={`${amp.toFixed(1)}×`}
        onMinus={() => onAmp(Math.max(0.2, +(amp - 0.1).toFixed(1)))}
        onPlus={() => onAmp(Math.min(4, +(amp + 0.1).toFixed(1)))}
      />
      <button
        onClick={onReset}
        className="mt-0.5 inline-flex items-center justify-center gap-1 rounded-sm border border-zinc-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
      >
        <RotateCcw className="h-2.5 w-2.5" />
        reset view
      </button>
    </div>
  );
}

function ControlRow({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-10 text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <button
        onClick={onMinus}
        className="grid h-5 w-5 place-items-center rounded-sm border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
        aria-label={`${label} -`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[34px] text-center tabular-nums text-zinc-200">
        {value}
      </span>
      <button
        onClick={onPlus}
        className="grid h-5 w-5 place-items-center rounded-sm border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
        aria-label={`${label} +`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
