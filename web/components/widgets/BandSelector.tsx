"use client";

import * as React from "react";
import { BAND_NAMES, BAND_RANGES, type BandName } from "@/lib/types";
import { BAND_COLORS, BAND_LABELS, cn } from "@/lib/utils";

/** Compact toggle strip for picking which bands a chart displays. */
export function BandSelector({
  value,
  onChange,
  className,
}: {
  value: BandName[];
  onChange: (next: BandName[]) => void;
  className?: string;
}) {
  const active = new Set(value);
  const toggle = (b: BandName) => {
    const next = new Set(active);
    if (next.has(b)) next.delete(b);
    else next.add(b);
    // Preserve canonical ordering (delta → gamma)
    onChange(BAND_NAMES.filter((x) => next.has(x)));
  };

  const allOn = () => onChange([...BAND_NAMES]);
  const none = () => onChange([]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-800/70 bg-zinc-900/40 px-2 py-1.5",
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        Bands
      </span>
      {BAND_NAMES.map((b) => {
        const [lo, hi] = BAND_RANGES[b];
        const on = active.has(b);
        return (
          <button
            key={b}
            onClick={() => toggle(b)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
              on
                ? "border-transparent"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300",
            )}
            style={
              on
                ? {
                    borderColor: BAND_COLORS[b] + "80",
                    background: BAND_COLORS[b] + "22",
                    color: BAND_COLORS[b],
                  }
                : undefined
            }
            title={`${BAND_LABELS[b]} · ${lo}–${hi} Hz`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: BAND_COLORS[b] }}
            />
            {BAND_LABELS[b]}
          </button>
        );
      })}
      <div className="ml-auto flex gap-1">
        <button
          onClick={allOn}
          className="rounded-sm border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
        >
          all
        </button>
        <button
          onClick={none}
          className="rounded-sm border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
        >
          none
        </button>
      </div>
    </div>
  );
}
