"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";

const CHANNEL_LABELS = ["TP9", "AF7", "AF8", "TP10"];
const CHANNEL_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];

/**
 * Butterfly plot — all channels share one amplitude scale with small vertical
 * offsets so traces remain readable (common in clinical EEG / BCI review UIs).
 */
export function ButterflyEEGChart({
  height = 360,
  autoScale = true,
  scaleValue = 200,
  windowSamples = 256,
}: {
  height?: number;
  autoScale?: boolean;
  scaleValue?: number;
  windowSamples?: number;
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

      const mid = h / 2;
      ctx.strokeStyle = "rgba(63,63,70,0.45)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      ctx.setLineDash([]);

      const { rollingRaw } = useNeuroStore.getState();
      const numCh = 4;

      let maxAbs = autoScale ? 0 : scaleValue ?? 200;
      if (autoScale) {
        for (let ch = 0; ch < numCh; ch++) {
          const fullBuf = rollingRaw[ch];
          const buf =
            fullBuf && fullBuf.length > windowSamples
              ? fullBuf.slice(-windowSamples)
              : fullBuf;
          if (!buf) continue;
          for (let i = 0; i < buf.length; i++) {
            const a = Math.abs(buf[i]);
            if (a > maxAbs) maxAbs = a;
          }
        }
        if (maxAbs < 1e-6) maxAbs = 1;
        maxAbs *= 1.08;
      }

      const sepUv = maxAbs * 0.55;
      const ampPx = Math.min(h * 0.11, 48);

      for (let ch = 0; ch < numCh; ch++) {
        const fullBuf = rollingRaw[ch];
        const buf =
          fullBuf && fullBuf.length > windowSamples
            ? fullBuf.slice(-windowSamples)
            : fullBuf;
        if (!buf || buf.length < 2) continue;
        const offsetUv = (ch - 1.5) * sepUv;

        ctx.strokeStyle = CHANNEL_COLORS[ch];
      ctx.lineWidth = 1.05;
        ctx.beginPath();
        const step = w / (buf.length - 1);
        for (let i = 0; i < buf.length; i++) {
          const x = i * step;
          const v = buf[i] + offsetUv;
          const y = mid - (v / maxAbs) * ampPx;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = CHANNEL_COLORS[ch];
        ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(CHANNEL_LABELS[ch], 8, mid + (ch - 1.5) * 18 - 24);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [height, autoScale, scaleValue, windowSamples]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
