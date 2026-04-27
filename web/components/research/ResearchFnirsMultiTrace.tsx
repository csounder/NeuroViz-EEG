"use client";

import * as React from "react";

export type FnirsTraceSample = {
  t: number;
  values: number[];
  /** Acceleration magnitude (or similar) at sample time — for motion–optical QC */
  motionMag?: number;
};

const COLORS = [
  "rgb(56,189,248)",
  "rgb(244,114,182)",
  "rgb(250,204,21)",
  "rgb(167,139,250)",
];

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function meanAbs(values: number[]) {
  const xs = values.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Exploratory: std / mean|Δ| on centered series (higher ≈ smoother vs steppy noise). */
function snrProxy(series: number[]): number {
  if (series.length < 12) return 0;
  const m = mean(series);
  const c = series.map((v) => v - m);
  const std = Math.sqrt(c.reduce((s, v) => s + v * v, 0) / c.length) || 0;
  const diffs = c.slice(1).map((v, i) => Math.abs(v - c[i]));
  const md = mean(diffs) + 1e-9;
  return std / md;
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n !== y.length || n < 6) return null;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = x[i] - mx;
    const ay = y[i] - my;
    num += ax * ay;
    dx += ax * ax;
    dy += ay * ay;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : null;
}

/** Multi-channel optical trace (Athena fNIRS / aux); DC removed per channel + coarse Δ & QC. */
export function ResearchFnirsMultiTrace({
  samples,
  windowMs = 60000,
  height = 160,
}: {
  samples: FnirsTraceSample[];
  windowMs?: number;
  height?: number;
}) {
  const width = 640;
  const tick = samples.length ? samples.at(-1)!.t : 0;

  const analysis = React.useMemo(() => {
    const now = Date.now();
    const recent = samples.filter((s) => now - s.t <= windowMs);
    const channelCount = Math.max(0, ...recent.map((s) => s.values.length));
    if (recent.length < 2 || channelCount < 1) {
      return {
        paths: [] as { d: string; color: string; label: string }[],
        deltaD: null as string | null,
        snrText: "—",
        motionCorr: null as number | null,
        deltaCaption: "",
      };
    }

    const firstT = recent[0]?.t ?? now - windowMs;
    const lastT = recent.at(-1)?.t ?? now;
    const span = Math.max(1, lastT - firstT);
    const paths: { d: string; color: string; label: string }[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const pts = recent
        .map((s) => ({ t: s.t, v: s.values[ch] }))
        .filter((p) => Number.isFinite(p.v));
      if (pts.length < 2) continue;
      const vals = pts.map((p) => p.v);
      const m = mean(vals);
      const centered = vals.map((v) => v - m);
      const maxAbs = Math.max(1e-9, ...centered.map((v) => Math.abs(v)));
      const d = pts
        .map((p, i) => {
          const x = ((p.t - firstT) / span) * width;
          const y = height / 2 - (centered[i] / maxAbs) * (height * 0.38);
          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
      paths.push({
        d,
        color: COLORS[ch % COLORS.length],
        label: `λ${ch + 1}`,
      });
    }

    let deltaD: string | null = null;
    let deltaCaption = "";
    if (channelCount >= 2) {
      const pts = recent
        .map((s) => ({
          t: s.t,
          v: (s.values[0] ?? 0) - (s.values[1] ?? 0),
        }))
        .filter((p) => Number.isFinite(p.v));
      if (pts.length >= 2) {
        const vals = pts.map((p) => p.v);
        const m = mean(vals);
        const centered = vals.map((v) => v - m);
        const maxAbs = Math.max(1e-9, ...centered.map((v) => Math.abs(v)));
        deltaD = pts
          .map((p, i) => {
            const x = ((p.t - firstT) / span) * width;
            const y = height / 2 - (centered[i] / maxAbs) * (height * 0.32);
            return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ");
        deltaCaption = "Δλ1−λ2 (coarse contrast proxy — not validated HbO−HbR)";
      }
    }

    const snrParts: string[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const ser = recent.map((s) => s.values[ch]).filter((v) => Number.isFinite(v));
      if (ser.length >= 12) snrParts.push(`λ${ch + 1} ${snrProxy(ser).toFixed(1)}`);
    }
    const snrText = snrParts.length ? snrParts.join(" · ") : "—";

    const motionPairs = recent.filter(
      (s) => typeof s.motionMag === "number" && Number.isFinite(s.motionMag) && s.values.length,
    );
    let motionCorr: number | null = null;
    if (motionPairs.length >= 8) {
      const fx = motionPairs.map((s) => meanAbs(s.values));
      const my = motionPairs.map((s) => s.motionMag!);
      motionCorr = pearson(fx, my);
    }

    return { paths, deltaD, snrText, motionCorr, deltaCaption };
  }, [samples, windowMs, height, width, tick]);

  const chDisplay =
    analysis.paths.length > 0
      ? analysis.paths.length
      : Math.max(0, samples.at(-1)?.values.length ?? 0);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          fNIRS / optical aux · {Math.round(windowMs / 1000)}s window
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          {chDisplay || "—"} ch · DC removed · exploratory
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full rounded-md bg-zinc-950">
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgba(63,63,70,0.6)"
          strokeDasharray="4 4"
        />
        {analysis.paths.length ? (
          analysis.paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth="1.75"
              strokeLinecap="round"
              opacity={0.92}
            />
          ))
        ) : (
          <text x={width / 2} y={height / 2} textAnchor="middle" fill="rgb(161,161,170)" fontSize="12">
            Waiting for fNIRS / optical samples (Athena direct path)
          </text>
        )}
        {analysis.deltaD ? (
          <path
            d={analysis.deltaD}
            fill="none"
            stroke="rgba(244,244,245,0.85)"
            strokeWidth="1.25"
            strokeDasharray="5 4"
            strokeLinecap="round"
            opacity={0.9}
          />
        ) : null}
      </svg>
      {analysis.paths.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] text-zinc-500">
          {analysis.paths.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
          ))}
          {analysis.deltaCaption ? (
            <span className="inline-flex items-center gap-1 text-zinc-400">
              <span className="h-0.5 w-3 border-t border-dashed border-zinc-400" />
              {analysis.deltaCaption}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-1.5 rounded-md border border-zinc-800/80 bg-zinc-950/60 px-2 py-2 font-mono text-[10px] text-zinc-500">
        <div>
          <span className="text-zinc-600">SNR proxy (std / mean|Δ|): </span>
          {analysis.snrText}
        </div>
        <div>
          <span className="text-zinc-600">Motion vs mean |optical| r (exploratory): </span>
          {analysis.motionCorr != null ? analysis.motionCorr.toFixed(2) : "—"}{" "}
          {analysis.motionCorr != null && Math.abs(analysis.motionCorr) > 0.45 ? (
            <span className="text-amber-400/90">· possible motion coupling</span>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-zinc-600">
        Not Homer/MNE HbO/HbR — vendor raw or bridge-normalized optical channels. Map wavelengths and processing in
        methods; use offline tools for publication-grade chromophore separation.
      </p>
    </div>
  );
}
