"use client";

import type { PpgSample } from "@/lib/researchPageAnalysis";

export function ResearchPpgWaveform({
  samples,
  channel,
  beats,
}: {
  samples: PpgSample[];
  channel: number;
  beats: number[];
}) {
  const width = 640;
  const height = 180;
  const recent = samples.filter((sample) => Date.now() - sample.t <= 12000);
  const points = recent
    .map((sample) => ({ t: sample.t, value: sample.values[channel] }))
    .filter((point) => Number.isFinite(point.value));
  const firstT = points[0]?.t ?? Date.now() - 12000;
  const lastT = points.at(-1)?.t ?? Date.now();
  const values = points.map((point) => point.value);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const centered = values.map((value) => value - mean);
  const maxAbs = Math.max(1e-9, ...centered.map((value) => Math.abs(value)));
  const path = points
    .map((point, index) => {
      const x = ((point.t - firstT) / Math.max(1, lastT - firstT)) * width;
      const y = height / 2 - (centered[index] / maxAbs) * (height * 0.42);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const visibleBeats = beats.filter((beat) => beat >= firstT && beat <= lastT);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">PPG pulse waveform</span>
        <span className="font-mono text-[10px] text-zinc-500">PPG optical · DC removed · 12s</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full rounded-md bg-zinc-950">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(63,63,70,0.7)" strokeDasharray="4 4" />
        {[1, 2, 3, 4, 5].map((i) => (
          <line key={i} x1={(i / 6) * width} y1="0" x2={(i / 6) * width} y2={height} stroke="rgba(39,39,42,0.7)" />
        ))}
        {path ? (
          <path d={path} fill="none" stroke="rgb(52,211,153)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <text x={width / 2} y={height / 2} textAnchor="middle" fill="rgb(161,161,170)" fontSize="13">
            Waiting for PPG optical samples
          </text>
        )}
        {visibleBeats.map((beat) => {
          const x = ((beat - firstT) / Math.max(1, lastT - firstT)) * width;
          return <line key={beat} x1={x} y1="12" x2={x} y2={height - 12} stroke="rgb(248,113,113)" strokeWidth="1.5" />;
        })}
      </svg>
    </div>
  );
}
