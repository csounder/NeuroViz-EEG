"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";
import { BAND_COLORS, BAND_LABELS } from "@/lib/utils";
import { BAND_NAMES, BAND_RANGES, type BandName } from "@/lib/types";
import { computePSD } from "@/lib/fft";

const CHANNEL_LABELS = ["TP9", "AF7", "AF8", "TP10"];
const CHANNEL_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];

interface Snapshot {
  freqs: Float64Array;
  psdDb: Float64Array[]; // per channel
}

/**
 * FFT Spectrum — real client-side FFT.
 *
 * Mind Monitor–style FFT visualization:
 *   - Grab trailing 512 samples per channel from the rolling raw buffer.
 *   - Subtract mean, apply Hann window, radix-2 FFT.
 *   - PSD = |FFT|² / N  →  10·log10(psd + 1e-10).
 *   - Mask to [minFreq, maxFreq] Hz.
 *   - Smoothly auto-range Y axis (EMA on min/max).
 *
 * Plots one trace per channel with band regions highlighted behind.
 */
export function FFTChart({
  height = 360,
  sampleRate = 256,
  minFreq = 0.5,
  maxFreq = 45,
  fftN = 512,
  updateIntervalMs = 150,
  autoScale = true,
  scaleValue = 40,
  /** Per-channel PSD EMA in [0,1). Higher → heavier temporal smoothing (OpenBCI “averaged” PSD feel). 0 = off. */
  psdTimeSmooth = 0,
  fftWindow = "hann" as "hann" | "hamming",
  /** Override shaded band regions (e.g. Mind Monitor Hz edges). Default: `BAND_RANGES`. */
  bandShadingRanges,
}: {
  height?: number;
  sampleRate?: number;
  minFreq?: number;
  maxFreq?: number;
  fftN?: number;
  updateIntervalMs?: number;
  /** If true, Y range auto-follows signal dB range (EMA). If false, range is 0..scaleValue dB. */
  autoScale?: boolean;
  scaleValue?: number;
  psdTimeSmooth?: number;
  fftWindow?: "hann" | "hamming";
  bandShadingRanges?: Record<BandName, [number, number]>;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const snapshotRef = React.useRef<Snapshot | null>(null);
  const smoothPsdRef = React.useRef<Float64Array[] | null>(null);
  const lastComputeRef = React.useRef(0);
  const yMinRef = React.useRef(-40);
  const yMaxRef = React.useRef(10);

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

    const padL = 42;
    const padR = 16;
    const padT = 20;
    const padB = 26;

    const ranges = bandShadingRanges ?? BAND_RANGES;

    const recompute = () => {
      const { rollingRaw } = useNeuroStore.getState();
      const snapshots: Float64Array[] = [];
      let freqs: Float64Array | null = null;
      for (let ch = 0; ch < 4; ch++) {
        const buf = rollingRaw[ch] ?? [];
        if (buf.length < 64) {
          snapshots.push(new Float64Array(0));
          continue;
        }
        const res = computePSD(buf, sampleRate, {
          targetN: fftN,
          minFreq,
          maxFreq,
          window: fftWindow,
        });
        if (!res) {
          snapshots.push(new Float64Array(0));
          continue;
        }
        if (!freqs) freqs = res.freqs;
        snapshots.push(res.psdDb);
      }
      if (freqs && freqs.length) {
        const alpha = Math.min(0.999, Math.max(0, psdTimeSmooth));
        if (alpha > 1e-6) {
          const prev = smoothPsdRef.current;
          const blended = snapshots.map((arr, ch) => {
            if (!arr.length) return arr;
            const p = prev?.[ch];
            if (!p || p.length !== arr.length) return new Float64Array(arr);
            const out = new Float64Array(arr.length);
            const inv = 1 - alpha;
            for (let i = 0; i < arr.length; i++) {
              out[i] = alpha * p[i] + inv * arr[i];
            }
            return out;
          });
          smoothPsdRef.current = blended;
          snapshotRef.current = { freqs, psdDb: blended };
        } else {
          smoothPsdRef.current = null;
          snapshotRef.current = { freqs, psdDb: snapshots };
        }
      }
    };

    const draw = () => {
      const now = performance.now();
      if (now - lastComputeRef.current > updateIntervalMs) {
        lastComputeRef.current = now;
        recompute();
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      const xFor = (f: number) =>
        padL + ((f - minFreq) / (maxFreq - minFreq)) * plotW;

      const snap = snapshotRef.current;

      // Band regions (background)
      for (const band of BAND_NAMES) {
        const [lo, hi] = ranges[band];
        const x1 = xFor(Math.max(lo, minFreq));
        const x2 = xFor(Math.min(hi, maxFreq));
        if (x2 <= x1) continue;
        ctx.fillStyle = BAND_COLORS[band] + "14";
        ctx.fillRect(x1, padT, x2 - x1, plotH);
      }

      if (!snap || snap.freqs.length === 0) {
        ctx.fillStyle = "rgba(161,161,170,0.6)";
        ctx.font = "12px ui-sans-serif, system-ui";
        const msg = "Waiting for EEG samples…";
        const m = ctx.measureText(msg);
        ctx.fillText(msg, padL + plotW / 2 - m.width / 2, padT + plotH / 2);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Y range — auto (EMA) or manual (0..scaleValue)
      let yMin: number;
      let yMax: number;
      if (autoScale) {
        let dMin = Infinity;
        let dMax = -Infinity;
        for (let ch = 0; ch < snap.psdDb.length; ch++) {
          const arr = snap.psdDb[ch];
          for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            if (Number.isFinite(v)) {
              if (v < dMin) dMin = v;
              if (v > dMax) dMax = v;
            }
          }
        }
        if (Number.isFinite(dMin) && Number.isFinite(dMax) && dMax > dMin) {
          yMinRef.current = yMinRef.current * 0.85 + dMin * 0.15;
          yMaxRef.current = yMaxRef.current * 0.85 + dMax * 0.15;
        }
        const pad = (yMaxRef.current - yMinRef.current) * 0.1 || 1;
        yMin = yMinRef.current - pad;
        yMax = yMaxRef.current + pad;
      } else {
        yMin = 0;
        yMax = Math.max(scaleValue, 1);
      }
      const yFor = (db: number) =>
        padT + plotH - ((db - yMin) / (yMax - yMin)) * plotH;

      // Axes
      ctx.strokeStyle = "rgba(63,63,70,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + plotH);
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.stroke();

      // Y gridlines (dB)
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "rgba(161,161,170,0.8)";
      const yTickCount = 5;
      for (let i = 0; i <= yTickCount; i++) {
        const db = yMin + (i / yTickCount) * (yMax - yMin);
        const y = yFor(db);
        ctx.strokeStyle = "rgba(63,63,70,0.25)";
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.fillText(`${db.toFixed(0)}`, 6, y + 3);
      }
      ctx.fillText("dB", 6, padT + 10);

      // X ticks
      const xStep = maxFreq - minFreq > 30 ? 10 : 5;
      for (let f = Math.ceil(minFreq / xStep) * xStep; f <= maxFreq; f += xStep) {
        const x = xFor(f);
        ctx.strokeStyle = "rgba(63,63,70,0.25)";
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        ctx.fillStyle = "rgba(161,161,170,0.8)";
        ctx.fillText(`${f}`, x - 6, padT + plotH + 14);
      }
      ctx.fillText("Hz", padL + plotW - 14, padT + plotH + 14);

      // Band labels
      ctx.font = "500 9px ui-sans-serif, system-ui";
      for (const band of BAND_NAMES) {
        const [lo, hi] = ranges[band];
        const mid = (Math.max(lo, minFreq) + Math.min(hi, maxFreq)) / 2;
        const x = xFor(mid);
        const label = BAND_LABELS[band];
        ctx.fillStyle = BAND_COLORS[band] + "cc";
        const m = ctx.measureText(label);
        ctx.fillText(label, x - m.width / 2, padT + 12);
      }

      // Channel traces
      for (let ch = 0; ch < snap.psdDb.length; ch++) {
        const arr = snap.psdDb[ch];
        if (!arr.length) continue;
        ctx.strokeStyle = CHANNEL_COLORS[ch];
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i++) {
          const f = snap.freqs[i];
          if (f < minFreq || f > maxFreq) continue;
          const x = xFor(f);
          const y = yFor(arr[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [
    height,
    sampleRate,
    minFreq,
    maxFreq,
    fftN,
    updateIntervalMs,
    autoScale,
    scaleValue,
    psdTimeSmooth,
    fftWindow,
    bandShadingRanges,
  ]);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative w-full">
        <canvas ref={canvasRef} className="block w-full rounded-md" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {CHANNEL_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: CHANNEL_COLORS[i] }}
            />
            <span className="font-mono text-zinc-400">{label}</span>
          </div>
        ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          FFT {fftN} · {sampleRate} Hz ·{" "}
          {fftWindow === "hamming" ? "Hamming" : "Hann"} window
          {psdTimeSmooth > 1e-6
            ? ` · PSD smooth ${(psdTimeSmooth * 100).toFixed(0)}%`
            : ""}
        </span>
      </div>
    </div>
  );
}
