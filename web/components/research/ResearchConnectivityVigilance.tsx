"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import type { BandPlvResult } from "@/lib/researchConnectivity";
import type { VigilanceBreakdown } from "@/lib/researchVigilance";

function fmtPlv(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(3);
}

export function ResearchConnectivityVigilance({
  plvAlpha,
  plvBeta,
  vigilance,
}: {
  plvAlpha: BandPlvResult | null;
  plvBeta: BandPlvResult | null;
  vigilance: VigilanceBreakdown | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Activity className="h-4 w-4" />}
          description="Short-window PLV on band-pass traces (α / β): standard for small mobile montages — hemispheric tracking, not source imaging. Vigilance strip blends δ, θ, β−1, slow-α drift, and EMG proxy; not PERCLOS / clinical staging."
        >
          Connectivity &amp; vigilance (exploratory)
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <PlvTable title="Alpha / mu band PLV" result={plvAlpha} />
          <PlvTable title="Beta band PLV" result={plvBeta} />
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Vigilance (1 = alert)
            </span>
            {vigilance && (
              <span className="font-mono text-xs text-zinc-400">
                drowsy pressure {vigilance.drowsyPressure01.toFixed(2)}
              </span>
            )}
          </div>
          {vigilance ? (
            <>
              <div className="h-4 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 via-emerald-500 to-sky-500"
                  style={{
                    width: `${Math.round(vigilance.vigilance01 * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-3 grid gap-2 font-mono text-[10px] text-zinc-500 sm:grid-cols-5">
                <Contributor label="δ" v={vigilance.contributors.delta} w={vigilance.weights.delta} />
                <Contributor label="θ" v={vigilance.contributors.theta} w={vigilance.weights.theta} />
                <Contributor label="1−β" v={vigilance.contributors.betaLow} w={vigilance.weights.betaLow} />
                <Contributor label="α drift" v={vigilance.contributors.alphaDrift} w={vigilance.weights.alphaDrift} />
                <Contributor label="EMG" v={vigilance.contributors.emg} w={vigilance.weights.emg} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{vigilance.caveat}</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Waiting for relative band powers…</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function PlvTable({ title, result }: { title: string; result: BandPlvResult | null }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{title}</div>
      {!result ? (
        <p className="text-xs text-zinc-500">Need ≥64 samples/ch in band traces @ stable Fs estimate.</p>
      ) : (
        <div className="space-y-1.5">
          {result.pairs.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-2 rounded border border-zinc-800/80 bg-zinc-900/30 px-2 py-1.5 text-xs"
            >
              <span className="text-zinc-400">{row.label}</span>
              <span className="font-mono tabular-nums text-zinc-100">{fmtPlv(row.plv)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Contributor({
  label,
  v,
  w,
}: {
  label: string;
  v: number;
  w: number;
}) {
  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-900/20 px-2 py-1">
      <div className="text-zinc-400">{label}</div>
      <div className="text-zinc-300">
        ×{w.toFixed(2)} · {v.toFixed(2)}
      </div>
    </div>
  );
}
