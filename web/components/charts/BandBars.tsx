"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "@/lib/store";
import { BAND_NAMES } from "@/lib/types";
import { BAND_COLORS, BAND_LABELS, formatNumber } from "@/lib/utils";

/**
 * Animated band-power bars (delta/theta/alpha/beta/gamma).
 * Shows the relative (normalized 0–1) bars by default.
 */
export function BandBars({
  mode = "relative",
  autoScale = true,
  scaleValue = 100,
}: {
  mode?: "absolute" | "relative";
  /** In absolute mode: auto-picks the largest band as 100 %. In relative mode: no effect (already 0..1). */
  autoScale?: boolean;
  /** When autoScale=false and mode=absolute, this is the max bar height (100 = µV²). Also used in relative mode as % ceiling (default 100). */
  scaleValue?: number;
}) {
  const { absolute, relative } = useNeuroStore(
    useShallow((s) => ({
      absolute: s.latestBandsAbs,
      relative: s.latestBandsRel,
    })),
  );

  const data = mode === "relative" ? relative : absolute;
  const autoMax = data
    ? Math.max(0.0001, ...BAND_NAMES.map((b) => data[b] ?? 0))
    : 1;
  const maxForAbs = autoScale ? autoMax : Math.max(scaleValue, 0.0001);
  const relativeCeiling =
    autoScale ? 1 : Math.max(scaleValue / 100, 0.0001);

  return (
    <div className="grid grid-cols-5 gap-3 sm:gap-4">
      {BAND_NAMES.map((band) => {
        const v = data?.[band] ?? 0;
        const pct =
          mode === "relative"
            ? Math.max(0, Math.min(1, v / relativeCeiling)) * 100
            : Math.max(0, Math.min(1, v / maxForAbs)) * 100;
        return (
          <div
            key={band}
            className="flex flex-col items-stretch gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3"
          >
            <div className="flex items-baseline justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: BAND_COLORS[band] }}
              >
                {BAND_LABELS[band]}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                {mode === "relative"
                  ? `${(v * 100).toFixed(1)}%`
                  : formatNumber(v, 2)}
              </span>
            </div>
            <div className="relative h-28 w-full overflow-hidden rounded-md bg-zinc-950/80 ring-1 ring-inset ring-zinc-800">
              <motion.div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  background: `linear-gradient(180deg, ${BAND_COLORS[band]} 0%, ${BAND_COLORS[band]}55 100%)`,
                  boxShadow: `0 -6px 18px -6px ${BAND_COLORS[band]}80`,
                }}
                animate={{ height: `${pct}%` }}
                transition={{ type: "spring", stiffness: 180, damping: 24 }}
              />
              {/* Tick marks */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-px w-full bg-zinc-800/70"
                  />
                ))}
              </div>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              {
                {
                  delta: "0.5–4 Hz",
                  theta: "4–8 Hz",
                  alpha: "8–13 Hz",
                  beta: "13–30 Hz",
                  gamma: "30–50 Hz",
                }[band]
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
