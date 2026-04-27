"use client";

import { contactQualityScore } from "@/lib/researchContactQuality";

export type ContactTrendSample = {
  t: number;
  tp9: string;
  af7: string;
  af8: string;
  tp10: string;
};

const KEYS = ["tp9", "af7", "af8", "tp10"] as const;

function scoreColor(s: number): string {
  if (s >= 3) return "rgb(52,211,153)";
  if (s >= 2) return "rgb(250,204,21)";
  if (s >= 1) return "rgb(251,146,60)";
  return "rgb(239,68,68)";
}

/** ~1 Hz contact-hint history for Muse-layout channels (from raw EEG rings, not impedance). */
export function ResearchContactTrendStrip({
  samples,
  channelLabels,
}: {
  samples: ContactTrendSample[];
  channelLabels: readonly [string, string, string, string];
}) {
  const recent = samples.slice(-180);
  const rowLabels = KEYS.map((k, i) => `${channelLabels[i]} (${k})`);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Contact quality over time
        </span>
        <span className="font-mono text-[10px] text-zinc-600">~1 Hz · exploratory · not kΩ impedance</span>
      </div>
      <div className="space-y-1">
        {KEYS.map((key, row) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 font-mono text-[9px] text-zinc-500">{rowLabels[row]}</span>
            <div className="flex min-h-[10px] flex-1 flex-wrap gap-px overflow-hidden rounded bg-zinc-900/80 p-px">
              {recent.length ? (
                recent.map((s, i) => {
                  const sc = contactQualityScore(s[key]);
                  return (
                    <span
                      key={`${s.t}-${i}`}
                      className="h-2 w-1 shrink-0 rounded-[1px]"
                      style={{ background: scoreColor(sc) }}
                      title={`${new Date(s.t).toLocaleTimeString()} · ${s[key]}`}
                    />
                  );
                })
              ) : (
                <span className="px-2 py-1 text-[10px] text-zinc-600">Waiting for EEG ring buffer…</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-600">
        Green → amber → red from “Good” toward flat/noisy hints. Use alongside impedance logs if you measure them
        offline.
      </p>
    </div>
  );
}
