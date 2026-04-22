"use client";

import * as React from "react";
import { Radio } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "@/lib/store";
import { cn, formatNumber } from "@/lib/utils";
import { BAND_NAMES, type BandPowers } from "@/lib/types";
import {
  elementsBandAbsoluteArgs,
  elementsBandRelativeArgs,
} from "@/lib/bandOscChannels";

type Mode = "A" | "B";

interface OscRow {
  mode: Mode;
  addr: string;
  tag: string; // OSC type-tag string e.g. "ffff"
  vals: string;
  tone?: "raw" | "bands" | "motion" | "ppg" | "fnirs";
}

const CHANNELS = ["TP9", "AF7", "AF8", "TP10"];

const ZERO_BANDS: BandPowers = {
  delta: 0,
  theta: 0,
  alpha: 0,
  beta: 0,
  gamma: 0,
};

/**
 * Live OSC stream monitor.
 *
 * - Reads the current settings (prefix/host/port/rate/streams) from the store.
 * - Reads the latest EEG, band powers, motion + PPG samples from the store.
 * - Synthesises the OSC message list that the backend is (or would be)
 *   emitting, showing:
 *     Mode A (Muse-compatible arrays): /prefix/bands/alpha_absolute f f f f …
 *     Mode B (scalar per channel):      /prefix/eeg/AF7/alpha f …
 * - Shows a LIVE header with rate + destination, mode chips, and a scrollable
 *   monospace list — same spirit as the old NeuroVis OSC Monitor + NeurOSC
 *   address preview.
 */
export function OSCMonitor({
  height = 420,
  showHeader = true,
  filterEnabled = true,
}: {
  height?: number;
  showHeader?: boolean;
  filterEnabled?: boolean;
}) {
  const { settings, rel, abs, bandTraces, motion, eeg, batteryPct, packetCount } =
    useNeuroStore(
      useShallow((s) => ({
        settings: s.settings,
        rel: s.latestBandsRel,
        abs: s.latestBandsAbs,
        bandTraces: s.latestBandTraces,
        motion: s.motion,
        eeg: s.latestEEG,
        batteryPct: s.batteryPct,
        packetCount: s.packetCount,
      })),
    );

  const prefix = settings.oscPrefix ?? "/muse";
  const host = settings.oscHost ?? "127.0.0.1";
  const port = settings.oscPort ?? 7400;
  const rate = settings.oscRate ?? 10;
  const streams = settings.oscStreams ?? {};

  const rows: OscRow[] = React.useMemo(() => {
    const out: OscRow[] = [];

    // Mode A — Muse-style per-band 4-float arrays (always useful to show
    // the address map even if the per-channel numbers are unknown)
    if (streams.bandPowers ?? true) {
      const absP = abs ?? ZERO_BANDS;
      const relP = rel ?? ZERO_BANDS;
      BAND_NAMES.forEach((b) => {
        const row = bandTraces?.[b];
        const absArgs = elementsBandAbsoluteArgs(b, absP, row);
        const relArgs = elementsBandRelativeArgs(b, relP, row);
        out.push({
          mode: "A",
          addr: `${prefix}/elements/${b}_absolute`,
          tag: '"ffff"',
          vals: absArgs.map((v) => formatNumber(v, 3)).join("  "),
          tone: "bands",
        });
        out.push({
          mode: "A",
          addr: `${prefix}/elements/${b}_relative`,
          tag: '"ffff"',
          vals: relArgs.map((v) => formatNumber(v, 3)).join("  "),
          tone: "bands",
        });
      });
    }

    if (streams.rawEEG) {
      const raw = eeg?.raw ?? [0, 0, 0, 0];
      // Mode A — combined 6-float (4 ch + 2 spare zeros, like Muse /eeg)
      out.push({
        mode: "A",
        addr: `${prefix}/eeg`,
        tag: '"ffffff"',
        vals: [...raw, 0, 0].map((v) => formatNumber(v, 1)).join("  "),
        tone: "raw",
      });
      // Mode B — scalar per-channel
      CHANNELS.forEach((ch, i) => {
        out.push({
          mode: "B",
          addr: `${prefix}/eeg/${ch}`,
          tag: '"f"',
          vals: formatNumber(raw[i] ?? 0, 1),
          tone: "raw",
        });
      });
    }

    if (streams.bandPowers ?? true) {
      // Mode B — scalar per-channel-per-band
      CHANNELS.forEach((ch) => {
        BAND_NAMES.forEach((b) => {
          const r = rel?.[b] ?? 0;
          out.push({
            mode: "B",
            addr: `${prefix}/eeg/${ch}/${b}`,
            tag: '"f"',
            vals: formatNumber(r, 3),
            tone: "bands",
          });
        });
      });
    }

    if (streams.motion) {
      const a = motion.accel ?? [0, 0, 0];
      const g = motion.gyro ?? [0, 0, 0];
      out.push({
        mode: "A",
        addr: `${prefix}/acc`,
        tag: '"fff"',
        vals: a.map((v) => formatNumber(v, 2)).join("  "),
        tone: "motion",
      });
      out.push({
        mode: "A",
        addr: `${prefix}/gyro`,
        tag: '"fff"',
        vals: g.map((v) => formatNumber(v, 1)).join("  "),
        tone: "motion",
      });
    }

    if (streams.ppg) {
      const p = motion.ppg ?? [0, 0, 0];
      out.push({
        mode: "A",
        addr: `${prefix}/ppg`,
        tag: '"fff"',
        vals: p.map((v) => formatNumber(v, 1)).join("  "),
        tone: "ppg",
      });
      out.push({
        mode: "B",
        addr: `${prefix}/ppg/hr`,
        tag: '"f"',
        vals: formatNumber(p[0] ?? 0, 1),
        tone: "ppg",
      });
    }

    if (streams.fnirs) {
      const f = motion.fnirs ?? [0, 0, 0];
      out.push({
        mode: "A",
        addr: `${prefix}/fnirs`,
        tag: '"fff"',
        vals: f.map((v) => formatNumber(v, 3)).join("  "),
        tone: "fnirs",
      });
    }

    if (batteryPct !== null) {
      out.push({
        mode: "B",
        addr: `${prefix}/battery`,
        tag: '"f"',
        vals: formatNumber(batteryPct, 0),
      });
    }

    return out;
  }, [prefix, streams, rel, abs, bandTraces, motion, eeg, batteryPct]);

  const liveTone =
    packetCount > 0 ? "text-emerald-400" : "text-zinc-500";

  return (
    <div className="flex flex-col gap-3">
      {showHeader && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-zinc-400" />
            <span className="font-mono text-[11px] tabular-nums text-zinc-400">
              {host}:{port}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                packetCount > 0
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-zinc-600",
              )}
            />
            <span className={cn("font-mono text-[11px] font-medium", liveTone)}>
              {packetCount > 0 ? "LIVE" : "IDLE"}
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              · {rows.length} addresses @ {rate} Hz
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
            <Chip tone="indigo">A · Muse</Chip>
            <Chip tone="amber">B · Scalar</Chip>
            {filterEnabled && <Chip tone="emerald">Filtered</Chip>}
          </div>
        </div>
      )}

      <div
        className="scroll-thin overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-[11px]"
        style={{ height }}
      >
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            No streams enabled — toggle them in the OSC panel.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((r, i) => (
              <li
                key={`${r.addr}-${i}`}
                className="flex items-baseline gap-3 border-b border-zinc-800/40 px-1 py-1 last:border-0"
              >
                <span
                  className={cn(
                    "w-4 shrink-0 text-center text-[10px] font-bold",
                    r.mode === "A" ? "text-indigo-400" : "text-amber-400",
                  )}
                >
                  {r.mode}
                </span>
                <span className="min-w-[220px] flex-1 truncate text-zinc-300">
                  {r.addr}
                </span>
                <span className="w-12 shrink-0 text-zinc-500">{r.tag}</span>
                <span className="min-w-0 flex-[2] truncate text-right text-emerald-300 tabular-nums">
                  {r.vals}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "indigo" | "amber" | "emerald";
}) {
  const tones: Record<typeof tone, string> = {
    indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  } as const;
  return (
    <span className={cn("rounded-full border px-2 py-0.5", tones[tone])}>
      {children}
    </span>
  );
}
