"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AUTO toggle + log-scaled slider for controlling a display's Y-axis range.
 * Linear / log scale slider for trace amplitude.
 *
 * Log mapping between slider position `t∈[0,100]` and scale value `v∈[min,max]`:
 *     v = min · (max/min)^(t/100)         → sliderToValue
 *     t = 100 · log(v/min) / log(max/min) → valueToSlider
 *
 * When `auto` is true the slider is disabled and greyed out.
 */

export interface ScaleState {
  auto: boolean;
  value: number;
}

export function TraceSpeedControl({
  value,
  onChange,
  min = 64,
  max = 1024,
  sampleRate = 256,
  label = "Trace window",
  className,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  sampleRate?: number;
  label?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const clamped = Math.max(min, Math.min(max, value));
  const seconds = clamped / sampleRate;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-md border border-zinc-800/70 bg-zinc-900/40 px-3 py-2",
        compact && "gap-3 px-2 py-1.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <HelpTip
          content={
            <div className="space-y-1">
              <div>
                Shorter windows make the traces move faster and reveal rapid EEG motion.
              </div>
              <div>Longer windows show more history but look slower.</div>
            </div>
          }
        />
      </div>
      <div className="flex flex-1 items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={16}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          className="neurovis-scale-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-500"
        />
        <span className="min-w-[86px] text-right font-mono text-[11px] tabular-nums text-zinc-200">
          {seconds.toFixed(seconds < 1 ? 2 : 1)}s
        </span>
      </div>
    </div>
  );
}

export function ScaleControl({
  state,
  onChange,
  min = 10,
  max = 10000,
  unit = "",
  bipolar = false,
  label = "Y-range",
  helpAuto = "Auto: Y-axis tracks signal min/max smoothly (EMA).",
  helpManual = "Manual: fixed Y-axis from the slider.",
  className,
  compact = false,
}: {
  state: ScaleState;
  onChange: (next: ScaleState) => void;
  min?: number;
  max?: number;
  unit?: string;
  bipolar?: boolean;
  label?: React.ReactNode;
  helpAuto?: string;
  helpManual?: string;
  className?: string;
  compact?: boolean;
}) {
  const sliderToValue = React.useCallback(
    (t: number) =>
      Math.round(min * Math.pow(max / min, Math.max(0, Math.min(100, t)) / 100)),
    [min, max],
  );
  const valueToSlider = React.useCallback(
    (v: number) =>
      Math.max(
        0,
        Math.min(
          100,
          Math.round((100 * Math.log(Math.max(v, min) / min)) / Math.log(max / min)),
        ),
      ),
    [min, max],
  );

  const display = bipolar
    ? `±${state.value}${unit ? ` ${unit}` : ""}`
    : `${state.value}${unit ? ` ${unit}` : ""}`;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-md border border-zinc-800/70 bg-zinc-900/40 px-3 py-2",
        compact && "gap-3 px-2 py-1.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <HelpTip
          content={
            <div className="space-y-1">
              <div>
                <span className="font-medium text-zinc-200">Auto:</span>{" "}
                {helpAuto}
              </div>
              <div>
                <span className="font-medium text-zinc-200">Manual:</span>{" "}
                {helpManual}
              </div>
              <div className="text-zinc-500">
                Slider is logarithmic: left is fine, right is coarse.
              </div>
            </div>
          }
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Auto
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={state.auto}
          onClick={() => onChange({ ...state, auto: !state.auto })}
          title={state.auto ? "Auto-range enabled" : "Auto-range disabled"}
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
            state.auto ? "bg-emerald-500" : "bg-zinc-700",
          )}
        >
          <span
            className={cn(
              "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform",
              state.auto ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      <div className="flex flex-1 items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={valueToSlider(state.value)}
          disabled={state.auto}
          onChange={(e) =>
            onChange({ ...state, value: sliderToValue(Number(e.target.value)) })
          }
          className={cn(
            "neurovis-scale-slider h-1.5 w-full appearance-none rounded-full bg-zinc-800 accent-emerald-500 transition-opacity",
            state.auto && "cursor-not-allowed opacity-40",
            !state.auto && "cursor-pointer",
          )}
        />
        <span
          className={cn(
            "min-w-[64px] text-right font-mono text-[11px] tabular-nums",
            state.auto ? "text-zinc-500" : "text-zinc-200",
          )}
        >
          {state.auto ? "AUTO" : display}
        </span>
      </div>

      <style jsx>{`
        .neurovis-scale-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: rgb(16 185 129);
          border: 2px solid rgb(4 120 87);
          cursor: pointer;
        }
        .neurovis-scale-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: rgb(16 185 129);
          border: 2px solid rgb(4 120 87);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function HelpTip({ content }: { content: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3.5 w-3.5 cursor-help text-zinc-500 hover:text-zinc-300" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-md border border-zinc-700/70 bg-zinc-950/95 px-3 py-2 text-[11px] leading-snug text-zinc-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
