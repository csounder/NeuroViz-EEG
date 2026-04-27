"use client";

import * as React from "react";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { FFTChart } from "@/components/charts/FFTChart";

/**
 * MuseLab-style stacked view: multi-channel time series above a spectrum pane,
 * similar to the classic MuseLab desktop layout.
 */
export function MuseLabPanel({ height = 360 }: { height?: number }) {
  const rawH = Math.max(140, Math.floor(height * 0.48));
  const fftH = Math.max(120, height - rawH - 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 shrink-0">
        <RawEEGChart height={rawH} autoScale />
      </div>
      <div className="min-h-0 flex-1">
        <FFTChart height={fftH} autoScale updateIntervalMs={120} />
      </div>
    </div>
  );
}
