"use client";

import * as React from "react";
import { fmt, formatArgs } from "@/lib/researchFormat";
import type { BandName } from "@/lib/types";
import { BAND_NAMES } from "@/lib/types";

export function ResearchTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-zinc-100">{value}</div>
    </div>
  );
}

export function MetricPanel({
  title,
  children,
  caption,
}: {
  title: string;
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{title}</div>
      {caption ? <p className="mb-2 text-[10px] leading-snug text-zinc-600">{caption}</p> : null}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-800/70 bg-zinc-900/30 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="font-mono text-xs tabular-nums text-zinc-100">{value}</span>
      </div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

export function StreamMeter({
  label,
  value,
  display,
}: {
  label: string;
  value: number;
  display?: string;
}) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">{display ?? normalized.toFixed(2)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(normalized * 100)}%` }} />
      </div>
    </div>
  );
}

export function BandValuePanel({
  title,
  unit,
  values,
  mode,
  updateCount,
  deltas,
  relativeVisualGain = 1,
}: {
  title: string;
  unit: string;
  values: Record<BandName, number> | null | undefined;
  mode: "absolute" | "relative";
  updateCount: number;
  deltas?: Record<BandName, number> | null;
  relativeVisualGain?: number;
}) {
  const scale = mode === "absolute" ? absolutePanelScale(values) : null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {title}
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
          {updateCount ? `u${updateCount}` : "waiting"}
        </span>
      </div>
      <div className="space-y-3">
        {BAND_NAMES.map((band) => (
          <BandValueRow
            key={band}
            band={band}
            value={values?.[band]}
            unit={unit}
            mode={mode}
            delta={deltas?.[band]}
            scale={scale}
            relativeVisualGain={mode === "relative" ? relativeVisualGain : 1}
          />
        ))}
      </div>
    </div>
  );
}

function BandValueRow({
  band,
  value,
  unit,
  mode,
  delta,
  scale,
  relativeVisualGain = 1,
}: {
  band: BandName;
  value: number | undefined;
  unit: string;
  mode: "absolute" | "relative";
  delta?: number;
  scale?: { min: number; max: number } | null;
  relativeVisualGain?: number;
}) {
  const displayValue =
    mode === "relative" ? `${((value ?? 0) * 100).toFixed(1)} ${unit}` : `${fmt(value, 2)} ${unit}`;
  const barPercent =
    mode === "relative"
      ? Math.max(0, Math.min(100, (value ?? 0) * 100 * relativeVisualGain))
      : absoluteDbToPercent(value, scale);
  const deltaText =
    mode === "absolute" && delta !== undefined && Number.isFinite(delta)
      ? ` Δ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`
      : "";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium capitalize text-zinc-100">{band}</span>
        <span className="font-mono text-xs tabular-nums text-zinc-300">
          {displayValue}
          {deltaText && <span className="text-zinc-500">{deltaText}</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-100"
          style={{ width: `${barPercent}%` }}
        />
      </div>
    </div>
  );
}

function absolutePanelScale(values: Record<BandName, number> | null | undefined) {
  if (!values) return null;
  const finite = BAND_NAMES.map((band) => values[band]).filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const pad = Math.max((max - min) * 0.25, 1);
  return { min: min - pad, max: max + pad };
}

function absoluteDbToPercent(value: number | undefined, scale?: { min: number; max: number } | null) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  if (scale && scale.max > scale.min) {
    return Math.max(2, Math.min(100, ((value - scale.min) / (scale.max - scale.min)) * 100));
  }
  return Math.max(0, Math.min(100, ((value + 60) / 80) * 100));
}

export function OscAddressRow({
  address,
  info,
}: {
  address: string;
  info: { args: unknown[]; timestamp: number; count: number };
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-cyan-200">{address}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {info.args.length} args | {info.count} packets | {Math.max(0, Date.now() - info.timestamp)} ms ago
        </span>
      </div>
      <div className="mt-2 break-all font-mono text-[11px] text-zinc-300">{formatArgs(info.args)}</div>
    </div>
  );
}
