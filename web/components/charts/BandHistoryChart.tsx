"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";
import { BAND_NAMES } from "@/lib/types";
import { BAND_COLORS, BAND_LABELS } from "@/lib/utils";

/**
 * Rolling 60s history of relative band powers, one line per band.
 */
export function BandHistoryChart({
  height = 200,
  autoScale = true,
  scaleValue = 100,
}: {
  height?: number;
  /** Auto = always 0..1 (relative). Manual = 0..scaleValue/100. */
  autoScale?: boolean;
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

      ctx.fillStyle = "rgba(24,24,27,0.3)";
      ctx.fillRect(0, 0, w, h);

      const { bandHistory } = useNeuroStore.getState();
      if (!bandHistory.length) {
        ctx.fillStyle = "rgba(161,161,170,0.5)";
        ctx.font = "12px ui-sans-serif, system-ui";
        ctx.fillText(
          "Waiting for band data…",
          w / 2 - 60,
          h / 2,
        );
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const n = bandHistory.length;
      const padT = 8;
      const padB = 8;
      const plotH = h - padT - padB;

      const ceiling = autoScale ? 1 : Math.max(scaleValue / 100, 0.01);
      BAND_NAMES.forEach((band) => {
        ctx.strokeStyle = BAND_COLORS[band];
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const v = bandHistory[i]?.rel?.[band] ?? 0;
          const norm = Math.max(0, Math.min(1, v / ceiling));
          const x = (i / Math.max(1, n - 1)) * w;
          const y = padT + (1 - norm) * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [height, autoScale, scaleValue]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative w-full">
        <canvas ref={canvasRef} className="block w-full rounded-md" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {BAND_NAMES.map((band) => (
          <div key={band} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: BAND_COLORS[band] }}
            />
            <span className="text-zinc-400">{BAND_LABELS[band]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
