"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";

const CHANNEL_LABELS = ["TP9", "AF7", "AF8", "TP10"];
const CHANNEL_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];

/**
 * Live 4-channel EEG time-series canvas chart.
 * Renders on a rolling 4-second window at 60 fps, reading the ring buffers
 * owned by the zustand store.
 */
export function RawEEGChart({
  height = 360,
  showChannelLabels = true,
  yRange,
  autoScale = true,
  scaleValue,
}: {
  height?: number;
  showChannelLabels?: boolean;
  /** Legacy prop — if set, forces manual scale */
  yRange?: number;
  /** If true, each lane auto-ranges to its own signal. Overrides scaleValue. */
  autoScale?: boolean;
  /** Manual ± scale (µV) when autoScale is false */
  scaleValue?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(24,24,27,0.6)");
      bg.addColorStop(1, "rgba(9,9,11,0.3)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const { rollingRaw } = useNeuroStore.getState();
      const numCh = 4;
      const laneH = h / numCh;

      // Grid — vertical (time) + horizontal (zero baseline per lane)
      ctx.strokeStyle = "rgba(63,63,70,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 8; i++) {
        const x = (i / 8) * w;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      ctx.stroke();

      for (let ch = 0; ch < numCh; ch++) {
        const laneTop = ch * laneH;
        const laneMid = laneTop + laneH / 2;

        // Baseline
        ctx.strokeStyle = "rgba(63,63,70,0.5)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(0, laneMid);
        ctx.lineTo(w, laneMid);
        ctx.stroke();
        ctx.setLineDash([]);

        // Channel label
        if (showChannelLabels) {
          ctx.fillStyle = CHANNEL_COLORS[ch];
          ctx.font =
            "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillText(CHANNEL_LABELS[ch], 8, laneTop + 14);
        }

        const buf = rollingRaw[ch];
        if (!buf || buf.length < 2) continue;

        // Determine lane scale: manual override (yRange / scaleValue) or auto
        const manualFixed = yRange ?? (autoScale ? undefined : scaleValue);
        let maxAbs = manualFixed ?? 0;
        if (manualFixed === undefined) {
          for (let i = 0; i < buf.length; i++) {
            const a = Math.abs(buf[i]);
            if (a > maxAbs) maxAbs = a;
          }
          if (maxAbs < 1e-6) maxAbs = 1;
          maxAbs *= 1.1;
        }

        // Trace
        ctx.strokeStyle = CHANNEL_COLORS[ch];
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        const step = w / (buf.length - 1);
        for (let i = 0; i < buf.length; i++) {
          const x = i * step;
          const norm = buf[i] / maxAbs;
          const y = laneMid - norm * (laneH * 0.42);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [height, showChannelLabels, yRange, autoScale, scaleValue]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
