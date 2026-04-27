"use client";

import * as React from "react";
import { Activity, Download, Eraser, Keyboard } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  downloadResearchRollingExport,
  defaultSessionDate,
  type ResearchExportMeta,
} from "@/lib/researchExportBundle";
import type { BandName } from "@/lib/types";
import { BAND_NAMES } from "@/lib/types";
import {
  computeEventLockedMeanBand,
  computeEventLockedMeanEeg,
} from "@/lib/researchTimelineMath";
import { inferResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { useNeuroStore } from "@/lib/store";
import type { ResearchEventSource } from "@/lib/researchTypes";

const CHAN_COLORS = [
  "rgba(52,211,153,0.9)",
  "rgba(96,165,250,0.9)",
  "rgba(251,191,36,0.9)",
  "rgba(244,114,182,0.9)",
];

export function ResearchEventLab() {
  const researchTimeline = useNeuroStore((s) => s.researchTimeline);
  const researchEvents = useNeuroStore((s) => s.researchEvents);
  const logResearchEvent = useNeuroStore((s) => s.logResearchEvent);
  const clearResearchEvents = useNeuroStore((s) => s.clearResearchEvents);
  const clearResearchTimeline = useNeuroStore((s) => s.clearResearchTimeline);
  const researchEyesContext = useNeuroStore((s) => s.researchEyesContext);
  const setResearchEyesContext = useNeuroStore((s) => s.setResearchEyesContext);
  const deviceName = useNeuroStore((s) => s.deviceName);
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const settings = useNeuroStore((s) => s.settings);
  const clientSimRunning = useNeuroStore((s) => s.clientSim.running);
  const eegTraceSource = useNeuroStore((s) => s.eegTraceSource);
  const estimatedEegHz = useNeuroStore((s) => s.estimatedEegHz);

  const exportProfile = React.useMemo(
    () =>
      inferResearchDeviceProfile({
        deviceName,
        eegDeviceName: latestEEG?.deviceName,
        settingsSimulator: Boolean(settings.simulatorMode),
        clientSimRunning,
      }),
    [deviceName, latestEEG?.deviceName, settings.simulatorMode, clientSimRunning],
  );

  const [preMs, setPreMs] = React.useState(2500);
  const [postMs, setPostMs] = React.useState(2500);
  const [binMs, setBinMs] = React.useState(100);
  const [labelFilter, setLabelFilter] = React.useState<string>("");
  const [baselineMs, setBaselineMs] = React.useState(500);
  const [useBaseline, setUseBaseline] = React.useState(true);
  const [bandPick, setBandPick] = React.useState<BandName>("alpha");
  const [view, setView] = React.useState<"eeg" | "band">("eeg");
  const [lastMinutes, setLastMinutes] = React.useState(5);
  const [sessionNote, setSessionNote] = React.useState("");
  const [impedanceLog, setImpedanceLog] = React.useState("");

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [cw, setCw] = React.useState(720);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setCw(Math.max(320, Math.floor(el.getBoundingClientRect().width))),
    );
    ro.observe(el);
    setCw(Math.max(320, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const onEv = (e: Event) => {
      const d = (e as CustomEvent).detail as { label?: string; source?: string; detail?: string };
      if (d?.label) {
        const src = (d.source as ResearchEventSource | undefined) ?? "api";
        logResearchEvent(String(d.label), src, d.detail);
      }
    };
    window.addEventListener("neurovis:research-event", onEv);
    (window as unknown as { neurovisLogResearchEvent?: (l: string, detail?: string) => void }).neurovisLogResearchEvent =
      (label: string, detail?: string) => logResearchEvent(label, "api", detail);
    return () => {
      window.removeEventListener("neurovis:research-event", onEv);
      delete (window as unknown as { neurovisLogResearchEvent?: unknown }).neurovisLogResearchEvent;
    };
  }, [logResearchEvent]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        logResearchEvent(`key_e_${Date.now()}`, "keyboard", "hotkey E");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logResearchEvent]);

  const eegAvg = React.useMemo(
    () =>
      computeEventLockedMeanEeg(
        researchTimeline,
        researchEvents,
        labelFilter.trim() || null,
        preMs,
        postMs,
        binMs,
        useBaseline ? { baselineEndMs: baselineMs } : { baselineEndMs: 0 },
      ),
    [
      researchTimeline,
      researchEvents,
      labelFilter,
      preMs,
      postMs,
      binMs,
      baselineMs,
      useBaseline,
    ],
  );

  const bandAvg = React.useMemo(
    () =>
      computeEventLockedMeanBand(
        researchTimeline,
        researchEvents,
        labelFilter.trim() || null,
        bandPick,
        preMs,
        postMs,
        binMs,
        useBaseline ? { baselineEndMs: baselineMs } : { baselineEndMs: 0 },
      ),
    [
      researchTimeline,
      researchEvents,
      labelFilter,
      bandPick,
      preMs,
      postMs,
      binMs,
      baselineMs,
      useBaseline,
    ],
  );

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view !== "eeg" || !eegAvg) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const h = 220;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, cw, h);
    const padL = 44;
    const padR = 8;
    const padT = 12;
    const padB = 28;
    const plotW = cw - padL - padR;
    const plotH = h - padT - padB;
    const { tMs, mean, channelNames } = eegAvg;
    const flat = mean.flatMap((row) => row.filter((v) => Number.isFinite(v)));
    if (flat.length < 2) return;
    let lo = Math.min(...flat);
    let hi = Math.max(...flat);
    const pad = Math.max(5, (hi - lo) * 0.08);
    lo -= pad;
    hi += pad;
    const tx = (i: number) => padL + (i / Math.max(1, tMs.length - 1)) * plotW;
    const ty = (v: number) => padT + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * plotH;
    ctx.strokeStyle = "rgba(39,39,42,0.8)";
    for (let g = 0; g <= 4; g++) {
      const y = padT + (g / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    const t0 = tMs[0] ?? 0;
    const t1 = tMs[tMs.length - 1] ?? 0;
    const mid = -t0 / Math.max(1e-6, t1 - t0);
    const xm = padL + mid * plotW;
    ctx.strokeStyle = "rgba(248,113,113,0.6)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xm, padT);
    ctx.lineTo(xm, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let ch = 0; ch < 4; ch++) {
      ctx.strokeStyle = CHAN_COLORS[ch];
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let s = false;
      for (let i = 0; i < tMs.length; i++) {
        const v = mean[i][ch];
        if (!Number.isFinite(v)) continue;
        const x = tx(i);
        const y = ty(v);
        if (!s) {
          ctx.moveTo(x, y);
          s = true;
        } else ctx.lineTo(x, y);
      }
      if (s) ctx.stroke();
    }
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`${channelNames.join(" ")} · n=${eegAvg.nEpochs}`, padL, h - 8);
  }, [eegAvg, cw, view]);

  const exportRolling = () => {
    const meta: ResearchExportMeta = {
      deviceName,
      eegTraceSource,
      estimatedEegHz,
      software: "neurovis-web@0.1.0",
      sessionNote: sessionNote || undefined,
      impedanceLog: impedanceLog.trim() || undefined,
      sessionDate: defaultSessionDate(),
      channelLabels: exportProfile.channelLabels,
      nominalEegHz: exportProfile.nominalEegHz,
    };
    downloadResearchRollingExport(researchTimeline, researchEvents, meta, lastMinutes);
  };

  const uniqueLabels = React.useMemo(() => {
    const s = new Set<string>();
    for (const e of researchEvents) s.add(e.label);
    return [...s].sort();
  }, [researchEvents]);

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Activity className="h-4 w-4" />}
          description="ERP-adjacent (honest): event-locked means at ~WebSocket/dashboard rate for exploration and demos — not lab-grade ERP (no impedance log, no stim–EEG hardware sync). Pair with rolling export + offline MNE/EEGLAB for real pipelines."
        >
          Event-locked lab &amp; rolling export
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3 text-[11px] leading-relaxed text-zinc-400">
          <span className="font-medium text-zinc-300">Caveats. </span>
          Plots are pseudo-ERP style (mean ± window, optional baseline correction) on the stream the UI sees. Marker
          timing includes software/bridge delay; band traces on timeline rows may lag EEG samples. For manuscripts, use
          exported <span className="font-mono text-zinc-300">eegstream.csv</span> +{" "}
          <span className="font-mono text-zinc-300">events.csv</span> + BIDS-style{" "}
          <span className="font-mono text-zinc-300">channels.tsv</span> /{" "}
          <span className="font-mono text-zinc-300">eeg.json</span> stubs or full-rate recorder CSV with{" "}
          <span className="font-mono text-zinc-300">wall_ms</span> and document{" "}
          <span className="font-mono text-zinc-300">provenance.json</span>{" "}
          <span className="text-zinc-500">analysis_scope</span>. Not for clinical interpretation.
        </div>
        <details className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-400">
          <summary className="cursor-pointer text-zinc-300 select-none">
            External markers (HTTP)
          </summary>
          <p className="mt-2 text-zinc-500">
            Markers hit open WebSocket clients via{" "}
            <code className="text-zinc-300">server-enhanced.js</code>. Next.js
            dev (port 3001) proxies to the bridge; set{" "}
            <code className="text-zinc-300">NEUROVIS_HTTP_BRIDGE_URL</code> if
            the Node server is not on <code className="text-zinc-300">127.0.0.1:3000</code>.
            Optional shared secret:{" "}
            <code className="text-zinc-300">RESEARCH_EVENT_SECRET</code> + header{" "}
            <code className="text-zinc-300">X-NeuroVis-Research-Token</code>.
          </p>
          <pre className="mt-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-900/80 p-2 font-mono text-[10px] text-emerald-200/90">
            {`# Direct to Node bridge (WEB_PORT, default 3000)
curl -sS -X POST http://127.0.0.1:3000/api/research-event \\
  -H 'Content-Type: application/json' \\
  -d '{"label":"stim_on","detail":"trial 3"}'

# Via Next (default http://localhost:3001)
curl -sS -X POST http://127.0.0.1:3001/api/research-event \\
  -H 'Content-Type: application/json' \\
  -d '{"label":"stim_on"}'

# Python OpenBCI server → Node UI: set NEUROVIS_RESEARCH_EVENT_URL then POST its /api/research-event`}
          </pre>
        </details>
        <div className="flex flex-wrap items-end gap-3 text-[11px]">
          <label className="text-zinc-400">
            Pre ms
            <input
              type="number"
              min={100}
              step={100}
              value={preMs}
              onChange={(e) => setPreMs(Number(e.target.value))}
              className="mt-0.5 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
            />
          </label>
          <label className="text-zinc-400">
            Post ms
            <input
              type="number"
              min={100}
              step={100}
              value={postMs}
              onChange={(e) => setPostMs(Number(e.target.value))}
              className="mt-0.5 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
            />
          </label>
          <label className="text-zinc-400">
            Bin ms
            <input
              type="number"
              min={50}
              step={25}
              value={binMs}
              onChange={(e) => setBinMs(Number(e.target.value))}
              className="mt-0.5 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
            />
          </label>
          <label className="text-zinc-400">
            Baseline end (ms pre-event)
            <input
              type="number"
              min={0}
              step={50}
              value={baselineMs}
              onChange={(e) => setBaselineMs(Number(e.target.value))}
              disabled={!useBaseline}
              className="mt-0.5 block w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200 disabled:opacity-40"
            />
          </label>
          <label className="flex items-center gap-1 text-zinc-500">
            <input
              type="checkbox"
              checked={useBaseline}
              onChange={(e) => setUseBaseline(e.target.checked)}
              className="accent-emerald-500"
            />
            Baseline correct
          </label>
          <label className="text-zinc-400">
            Filter label
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="mt-0.5 block min-w-[10rem] rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
            >
              <option value="">All events</option>
              {uniqueLabels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-zinc-400">
            Eyes context (QC rules)
            <select
              value={researchEyesContext}
              onChange={(e) => setResearchEyesContext(e.target.value as "unspecified" | "open" | "closed")}
              className="mt-0.5 block rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
            >
              <option value="unspecified">Unspecified</option>
              <option value="open">Eyes open</option>
              <option value="closed">Eyes closed</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => logResearchEvent(`ui_${Date.now()}`, "ui", "manual")}
            className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200"
          >
            Drop UI marker
          </button>
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Keyboard className="h-3 w-3" /> E = keyboard event · customEvent neurovis:research-event · window.neurovisLogResearchEvent
          </span>
          <button
            type="button"
            onClick={clearResearchEvents}
            className="rounded-lg border border-zinc-700 px-2 py-1 text-[10px] text-zinc-500"
          >
            Clear events
          </button>
          <button
            type="button"
            onClick={clearResearchTimeline}
            className="rounded-lg border border-zinc-700 px-2 py-1 text-[10px] text-zinc-500"
          >
            Clear stream buffer
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs ${view === "eeg" ? "bg-emerald-900/50 text-emerald-200" : "bg-zinc-900 text-zinc-400"}`}
            onClick={() => setView("eeg")}
          >
            Mean EEG (4 ch)
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs ${view === "band" ? "bg-emerald-900/50 text-emerald-200" : "bg-zinc-900 text-zinc-400"}`}
            onClick={() => setView("band")}
          >
            Mean relative band
          </button>
          {view === "band" ? (
            <select
              value={bandPick}
              onChange={(e) => setBandPick(e.target.value as BandName)}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              {BAND_NAMES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div ref={wrapRef} className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          {view === "eeg" ? (
            eegAvg ? (
              <canvas ref={canvasRef} className="block max-w-full" />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
                Need timeline samples + at least one event in range.
              </div>
            )
          ) : bandAvg ? (
            <BandAvgSvg cw={cw} bandAvg={bandAvg} band={bandPick} />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
              Need band snapshots on timeline + events (relative bands update on band packets).
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <label className="text-[11px] text-zinc-400">
            Export last (min)
            <input
              type="number"
              min={1}
              max={120}
              value={lastMinutes}
              onChange={(e) => setLastMinutes(Number(e.target.value))}
              className="mt-0.5 block w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Session note (manifest)
            <input
              value={sessionNote}
              onChange={(e) => setSessionNote(e.target.value)}
              className="mt-0.5 block w-56 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Impedance log (optional · OpenBCI)
            <textarea
              value={impedanceLog}
              onChange={(e) => setImpedanceLog(e.target.value)}
              rows={2}
              placeholder="e.g. Ch1 12kΩ Ch2 8kΩ … (manual; not streamed in UI today)"
              className="mt-0.5 block w-64 resize-y rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-200"
            />
          </label>
          <button
            type="button"
            onClick={exportRolling}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export rolling bundle (BIDS-style names)
          </button>
          <p className="text-[10px] text-zinc-600">
            Files: <code className="text-zinc-500">*_eegstream.csv</code>, <code className="text-zinc-500">*_events.csv</code>,{" "}
            <code className="text-zinc-500">*_provenance.json</code>
          </p>
        </div>

        <div className="max-h-32 overflow-auto rounded border border-zinc-800 bg-zinc-950/50 p-2 font-mono text-[10px] text-zinc-500">
          <div className="mb-1 flex items-center gap-1 text-zinc-600">
            <Eraser className="h-3 w-3" /> Recent events ({researchEvents.length})
          </div>
          {researchEvents.length === 0 ? (
            <span>No events yet.</span>
          ) : (
            researchEvents
              .slice(-24)
              .reverse()
              .map((e) => (
                <div key={e.id} className="truncate">
                  <span className="text-emerald-600/90">{e.source}</span> · {new Date(e.wallMs).toISOString()} ·{" "}
                  <span className="text-zinc-300">{e.label}</span>
                </div>
              ))
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function BandAvgSvg({
  cw,
  bandAvg,
  band,
}: {
  cw: number;
  bandAvg: { tMs: number[]; mean: number[]; nEpochs: number };
  band: BandName;
}) {
  const h = 200;
  const padL = 40;
  const padT = 10;
  const padB = 24;
  const plotW = cw - padL - 8;
  const plotH = h - padT - padB;
  const vals = bandAvg.mean.filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max(0.02, (hi - lo) * 0.1);
  lo -= pad;
  hi += pad;
  const tx = (i: number) => padL + (i / Math.max(1, bandAvg.tMs.length - 1)) * plotW;
  const ty = (v: number) => padT + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * plotH;
  const pts = bandAvg.tMs
    .map((_, i) => {
      const v = bandAvg.mean[i];
      if (!Number.isFinite(v)) return null;
      return `${i === 0 ? "M" : "L"} ${tx(i).toFixed(1)} ${ty(v).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
  const t0 = bandAvg.tMs[0] ?? 0;
  const t1 = bandAvg.tMs[bandAvg.tMs.length - 1] ?? 1;
  const mid = -t0 / Math.max(1e-6, t1 - t0);
  const xm = padL + mid * plotW;
  return (
    <svg width={cw} height={h} className="block max-w-full bg-zinc-950">
      <line x1={xm} y1={padT} x2={xm} y2={padT + plotH} stroke="rgba(248,113,113,0.55)" strokeDasharray="4 4" />
      <path d={pts} fill="none" stroke="rgb(52,211,153)" strokeWidth="1.5" />
      <text x={padL} y={h - 6} fill="rgb(161,161,170)" fontSize="10" fontFamily="ui-monospace, monospace">
        rel {band} · n={bandAvg.nEpochs}
      </text>
    </svg>
  );
}
