"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";
import { computePSD } from "@/lib/fft";

/** Map normalized level [0,1] to RGB (blue → cyan → yellow → red), common EEG spectrogram convention. */
function spectrogramColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const h = 240 * (1 - x);
  const s = 85;
  const l = 8 + 42 * x;
  return `hsl(${h.toFixed(0)}, ${s}%, ${l.toFixed(0)}%)`;
}

const MAX_COLS = 280;

/**
 * Common average reference (CAR), sample-by-sample across the four EEG channels:
 * for each time index `t`, subtract the mean of all channels from the selected
 * channel: `CAR_ch[t] = raw_ch[t] - mean(raw_0…raw_3)[t]`.
 *
 * This emphasizes deviations of one electrode relative to the group average
 * and attenuates signals common to all channels (e.g. some wideband noise).
 */
function buildInputSeries(
  rollingRaw: number[][],
  channelIndex: number,
  useCar: boolean,
): number[] {
  const ch = Math.max(0, Math.min(3, channelIndex));
  if (!useCar) {
    return rollingRaw[ch] ?? [];
  }
  const b0 = rollingRaw[0] ?? [];
  const b1 = rollingRaw[1] ?? [];
  const b2 = rollingRaw[2] ?? [];
  const b3 = rollingRaw[3] ?? [];
  const minLen = Math.min(b0.length, b1.length, b2.length, b3.length);
  if (minLen < 2) return [];
  const bufs = [b0, b1, b2, b3];
  const out: number[] = new Array(minLen);
  for (let i = 0; i < minLen; i++) {
    const mean =
      (bufs[0][i] + bufs[1][i] + bufs[2][i] + bufs[3][i]) / 4;
    out[i] = bufs[ch][i] - mean;
  }
  return out;
}

/**
 * Rolling frequency–time heatmap (spectrogram) from the live raw buffer.
 * Similar to the OpenBCI GUI spectrogram widget and many real-time EEG stacks
 * (short-time PSD columns scrolled in time).
 */
export function SpectrogramChart({
  height = 360,
  sampleRate = 256,
  minFreq = 1,
  maxFreq = 45,
  fftN = 256,
  updateIntervalMs = 120,
  channelIndex = 0,
  useCommonAverageReference = false,
  autoScale = true,
  scaleValue = 35,
  fftWindow = "hann" as "hann" | "hamming",
}: {
  height?: number;
  sampleRate?: number;
  minFreq?: number;
  maxFreq?: number;
  fftN?: number;
  updateIntervalMs?: number;
  /** 0–3 = electrode; uses that channel’s rolling buffer. */
  channelIndex?: number;
  /**
   * When true, each PSD window is computed on the CAR signal for the selected
   * channel (see `buildInputSeries` above), not on the raw channel alone.
   */
  useCommonAverageReference?: boolean;
  autoScale?: boolean;
  /** Manual dB span when autoScale is false. */
  scaleValue?: number;
  fftWindow?: "hann" | "hamming";
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const columnsRef = React.useRef<Float64Array[]>([]);
  const freqsRef = React.useRef<Float64Array | null>(null);
  const lastComputeRef = React.useRef(0);
  const dbMinRef = React.useRef(-20);
  const dbMaxRef = React.useRef(25);

  React.useEffect(() => {
    columnsRef.current = [];
    freqsRef.current = null;
    dbMinRef.current = -20;
    dbMaxRef.current = 25;
    lastComputeRef.current = 0;

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

    const padL = 44;
    const padR = 10;
    const padT = 8;
    const padB = 22;

    const pushColumn = (psdDb: Float64Array) => {
      const cols = columnsRef.current;
      cols.push(new Float64Array(psdDb));
      if (cols.length > MAX_COLS) cols.shift();
    };

    const recompute = () => {
      const { rollingRaw } = useNeuroStore.getState();
      const buf = buildInputSeries(
        rollingRaw,
        channelIndex,
        useCommonAverageReference,
      );
      if (buf.length < 64) return;
      const res = computePSD(buf, sampleRate, {
        targetN: fftN,
        minFreq,
        maxFreq,
        window: fftWindow,
      });
      if (!res) return;
      freqsRef.current = res.freqs;
      pushColumn(res.psdDb);
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

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(24,24,27,0.55)");
      bg.addColorStop(1, "rgba(9,9,11,0.35)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const cols = columnsRef.current;
      const freqs = freqsRef.current;
      if (!cols.length || !freqs || freqs.length < 2) {
        ctx.fillStyle = "rgba(161,161,170,0.6)";
        ctx.font = "12px ui-sans-serif, system-ui";
        const msg = "Waiting for EEG samples…";
        const m = ctx.measureText(msg);
        ctx.fillText(msg, padL + plotW / 2 - m.width / 2, padT + plotH / 2);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const nRows = freqs.length;
      const nCols = cols.length;
      let dLo: number;
      let dHi: number;
      if (autoScale) {
        let dMin = Infinity;
        let dMax = -Infinity;
        for (const col of cols) {
          for (let r = 0; r < col.length; r++) {
            const v = col[r];
            if (Number.isFinite(v)) {
              if (v < dMin) dMin = v;
              if (v > dMax) dMax = v;
            }
          }
        }
        if (Number.isFinite(dMin) && Number.isFinite(dMax) && dMax > dMin) {
          dbMinRef.current = dbMinRef.current * 0.88 + dMin * 0.12;
          dbMaxRef.current = dbMaxRef.current * 0.88 + dMax * 0.12;
        }
        const pad = (dbMaxRef.current - dbMinRef.current) * 0.08 || 2;
        dLo = dbMinRef.current - pad;
        dHi = dbMaxRef.current + pad;
      } else {
        dLo = -Math.max(scaleValue, 12);
        dHi = 6;
      }

      const cellW = plotW / Math.max(1, nCols);
      for (let c = 0; c < nCols; c++) {
        const col = cols[c];
        const x = padL + c * cellW;
        const colW = Math.max(1, cellW + 0.5);
        for (let r = 0; r < nRows; r++) {
          const db = col[r] ?? dLo;
          const t = (db - dLo) / (dHi - dLo || 1);
          const y0 = padT + plotH - ((r + 1) / nRows) * plotH;
          const rowH = Math.max(1, plotH / nRows + 0.5);
          ctx.fillStyle = spectrogramColor(t);
          ctx.fillRect(x, y0, colW, rowH);
        }
      }

      ctx.strokeStyle = "rgba(63,63,70,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(padL, padT, plotW, plotH);

      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "rgba(161,161,170,0.85)";
      const yTicks = 4;
      for (let i = 0; i <= yTicks; i++) {
        const fr = minFreq + (i / yTicks) * (maxFreq - minFreq);
        const y = padT + plotH - (i / yTicks) * plotH;
        ctx.fillText(`${fr.toFixed(0)}`, 4, y + 3);
      }
      ctx.fillText("Hz", 8, padT + 10);
      ctx.fillText("time →", padL + plotW - 44, padT + plotH + 14);

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
    channelIndex,
    useCommonAverageReference,
    autoScale,
    scaleValue,
    fftWindow,
  ]);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas ref={canvasRef} className="block w-full rounded-md" />
    </div>
  );
}
