"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { motion } from "framer-motion";
import { useNeuroStore } from "@/lib/store";
import { BAND_NAMES } from "@/lib/types";
import { BAND_COLORS, BAND_LABELS } from "@/lib/utils";

/**
 * Horizontal band rows with a fill bar + inline sparkline of the recent
 * history of each band's relative power. Ported from the old NeuroVis
 * FFT+Bands view (right pane).
 */
export function BandBarsWithSparklines({
  sparklineLength = 80,
  height = 300,
}: {
  sparklineLength?: number;
  height?: number;
}) {
  const { rel, bandHistory } = useNeuroStore(
    useShallow((s) => ({
      rel: s.latestBandsRel,
      bandHistory: s.bandHistory,
    })),
  );

  // Select the last N points for sparkline
  const sparks = React.useMemo(() => {
    const out: Record<string, number[]> = {};
    const slice = bandHistory.slice(-sparklineLength);
    for (const band of BAND_NAMES) {
      out[band] = slice.map((pt) => pt.rel?.[band] ?? 0);
    }
    return out;
  }, [bandHistory, sparklineLength]);

  return (
    <div className="flex flex-col gap-2.5" style={{ minHeight: height }}>
      {BAND_NAMES.map((band) => {
        const v = rel?.[band] ?? 0;
        const pct = Math.max(0, Math.min(1, v));
        const history = sparks[band] ?? [];
        return (
          <div
            key={band}
            className="relative flex items-center gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-3 py-2.5"
          >
            <div className="w-14 shrink-0">
              <div
                className="font-mono text-xs font-semibold uppercase tracking-wider"
                style={{ color: BAND_COLORS[band] }}
              >
                {BAND_LABELS[band]}
              </div>
              <div className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
                {
                  {
                    delta: "0.5–4",
                    theta: "4–8",
                    alpha: "8–13",
                    beta: "13–30",
                    gamma: "30–50",
                  }[band]
                }{" "}
                Hz
              </div>
            </div>

            {/* Bar + overlaid sparkline */}
            <div className="relative flex-1">
              <div className="relative h-8 overflow-hidden rounded-md bg-zinc-950/80 ring-1 ring-inset ring-zinc-800">
                <motion.div
                  className="absolute inset-y-0 left-0"
                  style={{
                    background: `linear-gradient(90deg, ${BAND_COLORS[band]}66 0%, ${BAND_COLORS[band]} 100%)`,
                    boxShadow: `0 0 18px -6px ${BAND_COLORS[band]}`,
                  }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ type: "spring", stiffness: 180, damping: 24 }}
                />
                <Sparkline
                  values={history}
                  color={BAND_COLORS[band]}
                  className="absolute inset-0"
                />
              </div>
            </div>

            <div className="w-12 shrink-0 text-right">
              <div className="font-mono text-sm tabular-nums text-zinc-100">
                {Math.round(pct * 100)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({
  values,
  color,
  className,
}: {
  values: number[];
  color: string;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (values.length < 2) return;
    ctx.strokeStyle = color + "cc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = (i / (values.length - 1)) * w;
      const v = Math.max(0, Math.min(1, values[i]));
      const y = h - 2 - v * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [values, color]);

  return (
    <div ref={containerRef} className={className} style={{ pointerEvents: "none" }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
