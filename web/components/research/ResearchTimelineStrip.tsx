"use client";

import * as React from "react";
import { useNeuroStore } from "@/lib/store";
import type { ResearchEventLog, ResearchStreamSample } from "@/lib/researchTypes";

const DEFAULT_H = 72;

function paintStrip(
  canvas: HTMLCanvasElement,
  timeline: ResearchStreamSample[],
  events: ResearchEventLog[],
  widthCss: number,
  heightCss: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.floor(widthCss * dpr);
  canvas.height = Math.floor(heightCss * dpr);
  canvas.style.width = `${widthCss}px`;
  canvas.style.height = `${heightCss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = widthCss;
  const h = heightCss;
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, w, h);

  if (timeline.length < 2) {
    ctx.fillStyle = "#52525b";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("Waiting for EEG stream…", 8, 22);
    return;
  }
  const take = Math.min(2000, timeline.length);
  const slice = timeline.slice(-take);
  let min = Infinity;
  let max = -Infinity;
  for (const row of slice) {
    const v = row.eeg[0] ?? 0;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    min = -200;
    max = 200;
  }
  const pad = 6;
  ctx.strokeStyle = "rgba(52,211,153,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  slice.forEach((row, i) => {
    const x = pad + (i / (slice.length - 1)) * (w - pad * 2);
    const v = row.eeg[0] ?? 0;
    const t = (v - min) / (max - min);
    const y = pad + (1 - t) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  const t0 = slice[0]?.wallMs ?? 0;
  const t1 = slice[slice.length - 1]?.wallMs ?? 0;
  for (const ev of events) {
    if (ev.label === "stimulus_clock") continue;
    if (ev.wallMs < t0 || ev.wallMs > t1) continue;
    const x = pad + ((ev.wallMs - t0) / Math.max(1, t1 - t0)) * (w - pad * 2);
    ctx.strokeStyle = "rgba(251,191,36,0.65)";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

export function ResearchTimelineStrip({
  height = DEFAULT_H,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const researchTimeline = useNeuroStore((s) => s.researchTimeline);
  const researchEvents = useNeuroStore((s) => s.researchEvents);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [cw, setCw] = React.useState(720);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setCw(Math.max(280, Math.floor(el.getBoundingClientRect().width))),
    );
    ro.observe(el);
    setCw(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    paintStrip(c, researchTimeline, researchEvents, cw, height);
  }, [researchTimeline, researchEvents, cw, height]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const c = canvasRef.current;
      if (!c) return;
      paintStrip(c, researchTimeline, researchEvents, cw, height);
    }, 200);
    return () => window.clearInterval(id);
  }, [researchTimeline, researchEvents, cw, height]);

  return (
    <div ref={wrapRef} className={`w-full min-w-0 ${className}`}>
      <canvas ref={canvasRef} className="block max-w-full rounded border border-zinc-800/80" />
    </div>
  );
}
