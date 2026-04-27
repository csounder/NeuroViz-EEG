"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";

const CHANNEL_LABELS = ["TP9", "AF7", "AF8", "TP10"];
const CHANNEL_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];
/** OpenBCI GUI–like accent traces (green / teal family). */
const OPENBCI_LANE_COLORS = [
  "#69f0ae",
  "#64ffda",
  "#b9f6ca",
  "#1de9b6",
];

/**
 * Live 4-channel EEG time-series canvas chart.
 * Renders on a rolling window at 60 fps, reading the ring buffers
 * owned by the zustand store.
 */
export function RawEEGChart({
  height = 360,
  showChannelLabels = true,
  variant = "default",
  yRange,
  autoScale = true,
  scaleValue,
  windowSamples = 256,
}: {
  height?: number;
  showChannelLabels?: boolean;
  /**
   * `openbci` — high-contrast dark canvas and gutter labels reminiscent of the
   * OpenBCI GUI time-series widget (multi-channel scrolling traces).
   */
  variant?: "default" | "openbci";
  /** Legacy prop — if set, forces manual scale */
  yRange?: number;
  /** If true, each lane auto-ranges to its own signal. Overrides scaleValue. */
  autoScale?: boolean;
  /** Manual ± scale (µV) when autoScale is false */
  scaleValue?: number;
  /** Number of most-recent samples to draw. 256 ≈ 1s at Muse native rate. */
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

    const padL = variant === "openbci" ? 44 : 0;
    const plotW = () => Math.max(8, canvas.clientWidth - padL);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const pw = plotW();

      if (variant === "openbci") {
        ctx.fillStyle = "#070708";
        ctx.fillRect(0, 0, w, h);
      } else {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "rgba(24,24,27,0.6)");
        bg.addColorStop(1, "rgba(9,9,11,0.3)");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }

      const { rollingRaw } = useNeuroStore.getState();
      const numCh = 4;
      const laneH = h / numCh;

      ctx.strokeStyle =
        variant === "openbci"
          ? "rgba(0, 230, 118, 0.1)"
          : "rgba(63,63,70,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 8; i++) {
        const x = padL + (i / 8) * pw;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      ctx.stroke();

      for (let ch = 0; ch < numCh; ch++) {
        const laneTop = ch * laneH;
        const laneMid = laneTop + laneH / 2;

        ctx.strokeStyle =
          variant === "openbci"
            ? "rgba(105, 240, 174, 0.35)"
            : "rgba(63,63,70,0.5)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, laneMid);
        ctx.lineTo(w, laneMid);
        ctx.stroke();
        ctx.setLineDash([]);

        if (showChannelLabels) {
          ctx.font =
            "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
          if (variant === "openbci") {
            ctx.fillStyle = OPENBCI_LANE_COLORS[ch];
            ctx.fillText(`${ch + 1}`, 6, laneTop + 14);
            ctx.fillStyle = "rgba(161,161,170,0.75)";
            ctx.fillText(CHANNEL_LABELS[ch], 20, laneTop + 14);
          } else {
            ctx.fillStyle = CHANNEL_COLORS[ch];
            ctx.fillText(CHANNEL_LABELS[ch], 8, laneTop + 14);
          }
        }

        const fullBuf = rollingRaw[ch];
        const buf =
          fullBuf && fullBuf.length > windowSamples
            ? fullBuf.slice(-windowSamples)
            : fullBuf;
        if (!buf || buf.length < 2) continue;

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

        ctx.strokeStyle =
          variant === "openbci" ? OPENBCI_LANE_COLORS[ch] : CHANNEL_COLORS[ch];
        ctx.lineWidth = variant === "openbci" ? 1.05 : 1;
        ctx.beginPath();
        const step = pw / (buf.length - 1);
        for (let i = 0; i < buf.length; i++) {
          const x = padL + i * step;
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
  }, [
    height,
    showChannelLabels,
    variant,
    yRange,
    autoScale,
    scaleValue,
    windowSamples,
  ]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
