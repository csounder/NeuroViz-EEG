"use client";

import * as React from "react";
import {
  Activity,
  Brain,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Keyboard,
  Music2,
  Radio,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { CsoundV12Renderer } from "@/components/csound/CsoundV12Renderer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Slider } from "@/components/ui/Slider";
import { useNeuroStore } from "@/lib/store";
import type { BandName } from "@/lib/types";
import { BAND_NAMES } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANNELS = ["TP9", "AF7", "AF8", "TP10"];

const BAND_COLORS: Record<BandName, string> = {
  delta: "#60a5fa",
  theta: "#a78bfa",
  alpha: "#34d399",
  beta: "#f59e0b",
  gamma: "#f472b6",
};

const SHORTCUTS = [
  ["1-0", "Select harmonic palette"],
  ["d/t/a/b", "Harmony band: Delta / Theta / Alpha / Beta"],
  ["L", "Cycle bass EEG driver"],
  ["N", "Cycle melody EEG driver"],
  ["r", "Cycle rhythm / energy EEG driver"],
  ["e", "Cycle register EEG driver"],
  ["q", "Cycle response mode"],
  ["o", "Cycle orchestration"],
  ["h", "Cycle harmony motion"],
  ["x", "Toggle standard / open voicing"],
  ["M", "Toggle melody"],
  ["m", "Cycle melody mode"],
  ["c", "Cycle melody character"],
  ["[ / ]", "Melody register down / up"],
  ["z", "CC1: melody volume / complexity"],
  ["P", "Csound dashboard printout"],
];

const RESPONSE_MODES = ["Smooth", "Stepped", "Rhythmic", "Dramatic", "Meditative"];
const ORCHESTRATIONS = ["Classic", "Glass", "Dark"];
const MOTIONS = ["Block", "Arp/Stride", "Slow Glide"];
const PALETTES = [
  "Classical",
  "Pop",
  "Jazz",
  "Lydian-Chromatic",
  "Modal",
  "Whole Tone",
  "Schoenbergian",
  "Fibonacci",
  "Bohlen-Pierce-ish",
  "Partch/Carlos-ish",
];

function normAbs(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, (value + 2.5) / 4));
}

function fmt(value: number | undefined, digits = 3) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function bandTitle(band: BandName) {
  return band[0].toUpperCase() + band.slice(1);
}

function Sparkline({
  values,
  color,
  muted,
}: {
  values: number[];
  color: string;
  muted?: boolean;
}) {
  const path = React.useMemo(() => {
    if (!values.length) return "";
    const tail = values.slice(-96);
    let min = Infinity;
    let max = -Infinity;
    for (const v of tail) {
      if (!Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
    const span = Math.max(0.0001, max - min);
    return tail
      .map((v, i) => {
        const x = (i / Math.max(1, tail.length - 1)) * 100;
        const y = 30 - ((v - min) / span) * 26;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg className="h-9 w-full overflow-visible" viewBox="0 0 100 32" preserveAspectRatio="none">
      <path d="M0,30 L100,30" stroke="rgba(113,113,122,.35)" strokeWidth="0.5" />
      {path && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeOpacity={muted ? 0.22 : 0.95}
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function Meter({
  value,
  color,
  muted,
}: {
  value: number;
  color: string;
  muted?: boolean;
}) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
      <div
        className={cn("h-full rounded-full transition-all", muted && "opacity-25")}
        style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function V12WorkstationPage() {
  const wsStatus = useNeuroStore((s) => s.wsStatus);
  const lastMessageAt = useNeuroStore((s) => s.lastMessageAt);
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const latestBandsAbs = useNeuroStore((s) => s.latestBandsAbs);
  const latestBandTraces = useNeuroStore((s) => s.latestBandTraces);
  const rollingBandRaw = useNeuroStore((s) => s.rollingBandRaw);
  const brainState = useNeuroStore((s) => s.brainState);
  const batteryPct = useNeuroStore((s) => s.batteryPct);
  const deviceName = useNeuroStore((s) => s.deviceName);
  const motionStreams = useNeuroStore((s) => s.motion);

  const [harmonyBand, setHarmonyBand] = React.useState<BandName>("alpha");
  const [bassDriver, setBassDriver] = React.useState<BandName>("delta");
  const [melodyDriver, setMelodyDriver] = React.useState<BandName>("gamma");
  const [rhythmDriver, setRhythmDriver] = React.useState<BandName>("beta");
  const [registerDriver, setRegisterDriver] = React.useState<BandName>("alpha");
  const [responseMode, setResponseMode] = React.useState(1);
  const [orchestration, setOrchestration] = React.useState(0);
  const [motion, setMotion] = React.useState(0);
  const [palette, setPalette] = React.useState(2);
  const [cc1Mode, setCc1Mode] = React.useState<"volume" | "complexity">("volume");
  const [melodyVolume, setMelodyVolume] = React.useState(0.7);
  const [melodyComplexity, setMelodyComplexity] = React.useState(0.35);
  const [solo, setSolo] = React.useState<string | null>(null);
  const [muted, setMuted] = React.useState<Set<string>>(() => new Set());
  const [csdPreview, setCsdPreview] = React.useState("");

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = event.key;
      if (key >= "1" && key <= "9") setPalette(Number(key) - 1);
      if (key === "0") setPalette(9);
      if (key === "d") setHarmonyBand("delta");
      if (key === "t") setHarmonyBand("theta");
      if (key === "a") setHarmonyBand("alpha");
      if (key === "b") setHarmonyBand("beta");
      if (key === "L") setBassDriver((v) => cycleBand(v));
      if (key === "N") setMelodyDriver((v) => cycleBand(v));
      if (key === "r") setRhythmDriver((v) => cycleBand(v));
      if (key === "e") setRegisterDriver((v) => cycleBand(v));
      if (key === "q") setResponseMode((v) => (v + 1) % RESPONSE_MODES.length);
      if (key === "o") setOrchestration((v) => (v + 1) % ORCHESTRATIONS.length);
      if (key === "h") setMotion((v) => (v + 1) % MOTIONS.length);
      if (key === "z") setCc1Mode((v) => (v === "volume" ? "complexity" : "volume"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ageMs = lastMessageAt ? Date.now() - lastMessageAt : null;
  const connected = wsStatus === "open" && (ageMs === null || ageMs < 2500);

  const visible = React.useCallback(
    (id: string) => (solo ? solo === id : !muted.has(id)),
    [muted, solo],
  );

  function toggleMute(id: string) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadCsdPreview() {
    const res = await fetch("/api/csound/v12");
    const text = await res.text();
    setCsdPreview(text.slice(0, 24000));
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle
            icon={<Brain className="h-4 w-4" />}
            description="A self-contained workstation for V12, Mind Monitor streams, EEG assignments, Csound access, and live performance shortcuts."
            actions={
              <div className="flex items-center gap-2">
                <Badge tone={connected ? "emerald" : "rose"} dot>
                  {connected ? "Mind Monitor Live" : wsStatus}
                </Badge>
                {deviceName && <Badge tone="indigo">{deviceName}</Badge>}
              </div>
            }
          >
            V12 EEG Control Matrix Workstation
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 lg:grid-cols-4">
            <StatusTile label="Brain state" value={brainState?.state ?? "unknown"} />
            <StatusTile label="Dominant" value={brainState?.dominant ?? "--"} />
            <StatusTile label="Battery" value={batteryPct == null ? "--" : `${batteryPct}%`} />
            <StatusTile label="Last packet" value={ageMs == null ? "--" : `${Math.round(ageMs)} ms`} />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader>
            <CardTitle
              icon={<Activity className="h-4 w-4" />}
              description="Absolute band powers plus 4-channel band traces. Solo or mute any band/channel stream for visual focus."
            >
              Mind Monitor / Muse Streams
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {BAND_NAMES.map((band) => {
              const color = BAND_COLORS[band];
              const aggregate = latestBandsAbs?.[band] ?? 0;
              const aggregateNorm = normAbs(aggregate);
              return (
                <div key={band} className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">{bandTitle(band)}</div>
                        <div className="font-mono text-[11px] text-zinc-500">
                          abs {fmt(aggregate)} | norm {fmt(aggregateNorm)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className={assignmentPillClass(harmonyBand === band, "emerald")}
                        onClick={() => setHarmonyBand(band)}
                      >
                        Harmony
                      </button>
                      <button
                        className={assignmentPillClass(melodyDriver === band, "violet")}
                        onClick={() => setMelodyDriver(band)}
                      >
                        Melody
                      </button>
                      <button
                        className={assignmentPillClass(bassDriver === band, "amber")}
                        onClick={() => setBassDriver(band)}
                      >
                        Bass
                      </button>
                    </div>
                  </div>
                  <Meter value={aggregateNorm} color={color} />
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {CHANNELS.map((name, ch) => {
                      const id = `${band}:${ch}`;
                      const isVisible = visible(id);
                      const current = latestBandTraces?.[band]?.[ch] ?? 0;
                      return (
                        <div
                          key={id}
                          className={cn(
                            "rounded-lg border border-zinc-800 bg-zinc-900/45 p-2",
                            !isVisible && "opacity-40",
                            solo === id && "border-emerald-500/70",
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-zinc-300">
                              {name} <span className="text-zinc-600">ch{ch + 1}</span>
                            </span>
                            <div className="flex gap-1">
                              <button
                                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700"
                                onClick={() => setSolo(solo === id ? null : id)}
                              >
                                Solo
                              </button>
                              <button
                                className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-700"
                                onClick={() => toggleMute(id)}
                                aria-label={muted.has(id) ? "Unmute stream" : "Mute stream"}
                              >
                                {muted.has(id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            </div>
                          </div>
                          <Sparkline
                            values={rollingBandRaw[band]?.[ch] ?? []}
                            color={color}
                            muted={!isVisible}
                          />
                          <div className="font-mono text-[10px] text-zinc-500">
                            current {fmt(current)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle
                icon={<SlidersHorizontal className="h-4 w-4" />}
                description="Mirrors the V12 assignment matrix and ASCII controls."
              >
                V12 Control Matrix
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <BandAssignmentButtons label="Harmony band" value={harmonyBand} onChange={setHarmonyBand} tone="emerald" />
              <BandAssignmentButtons label="Bass driver (L)" value={bassDriver} onChange={setBassDriver} tone="amber" />
              <BandAssignmentButtons label="Melody driver (N)" value={melodyDriver} onChange={setMelodyDriver} tone="violet" />
              <BandAssignmentButtons label="Rhythm driver (r)" value={rhythmDriver} onChange={setRhythmDriver} tone="rose" />
              <BandAssignmentButtons label="Register driver (e)" value={registerDriver} onChange={setRegisterDriver} tone="sky" />

              <div className="grid grid-cols-2 gap-3">
                <LabeledSelect
                  label="Palette"
                  value={palette}
                  onChange={(v) => setPalette(Number(v))}
                  options={PALETTES.map((p, i) => ({ value: String(i), label: `${i === 9 ? 0 : i + 1}. ${p}` }))}
                />
                <LabeledSelect
                  label="Response (q)"
                  value={responseMode}
                  onChange={(v) => setResponseMode(Number(v))}
                  options={RESPONSE_MODES.map((m, i) => ({ value: String(i), label: m }))}
                />
                <LabeledSelect
                  label="Orchestration (o)"
                  value={orchestration}
                  onChange={(v) => setOrchestration(Number(v))}
                  options={ORCHESTRATIONS.map((m, i) => ({ value: String(i), label: m }))}
                />
                <LabeledSelect
                  label="Motion (h)"
                  value={motion}
                  onChange={(v) => setMotion(Number(v))}
                  options={MOTIONS.map((m, i) => ({ value: String(i), label: m }))}
                />
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">CC1 assignment</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCc1Mode(cc1Mode === "volume" ? "complexity" : "volume")}
                  >
                    z: {cc1Mode}
                  </Button>
                </div>
                <Slider
                  label="Melody volume"
                  value={melodyVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={setMelodyVolume}
                  format={(v) => v.toFixed(2)}
                />
                <Slider
                  className="mt-3"
                  label="Melody complexity"
                  value={melodyComplexity}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={setMelodyComplexity}
                  format={(v) => v.toFixed(2)}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle icon={<Keyboard className="h-4 w-4" />}>ASCII Shortcuts</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid gap-2">
                {SHORTCUTS.map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/40 px-3 py-2">
                    <kbd className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-emerald-300">
                      {key}
                    </kbd>
                    <span className="text-right text-xs text-zinc-400">{label}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            icon={<Music2 className="h-4 w-4" />}
            description="Local access to the V12 CSD plus browser/online Csound options."
            actions={
              <a href="/api/csound/v12" download="MuscV12-EEG-Control-Matrix-Cursor.csd">
                <Button size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>
                  Download CSD
                </Button>
              </a>
            }
          >
            Csound V12 Renderer / CSD
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <CsoundV12Renderer
            controls={{
              harmonyBand,
              bassDriver,
              melodyDriver,
              rhythmDriver,
              registerDriver,
              responseMode,
              orchestration,
              motion,
              palette,
              cc1Mode,
              melodyVolume,
              melodyComplexity,
            }}
            latestEEG={latestEEG}
            latestBandsAbs={latestBandsAbs}
            latestBandTraces={latestBandTraces}
            motion={motionStreams}
            batteryPct={batteryPct}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <a
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-200 hover:border-emerald-500/50"
              href="/api/csound/v12"
              target="_blank"
            >
              <div className="flex items-center gap-2 font-medium">
                <Radio className="h-4 w-4 text-emerald-400" />
                Open local V12 CSD
              </div>
              <p className="mt-1 text-xs text-zinc-500">Served by NeuroVis from your Desktop CSD file.</p>
            </a>
            <a
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-200 hover:border-emerald-500/50"
              href="https://ide.csound.com"
              target="_blank"
            >
              <div className="flex items-center gap-2 font-medium">
                <ExternalLink className="h-4 w-4 text-emerald-400" />
                Csound Web IDE
              </div>
              <p className="mt-1 text-xs text-zinc-500">Paste or load the downloaded V12 CSD for online rendering.</p>
            </a>
            <button
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-left text-sm text-zinc-200 hover:border-emerald-500/50"
              onClick={loadCsdPreview}
            >
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Preview CSD here
              </div>
              <p className="mt-1 text-xs text-zinc-500">Loads the first part of the local V12 instrument into this page.</p>
            </button>
          </div>
          {csdPreview && (
            <textarea
              className="h-96 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300"
              readOnly
              value={csdPreview}
            />
          )}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/80">
            Browser mode runs the V12 CSD through Csound WASM and replaces desktop UDP OSC
            with WebAudio control channels from NeuroVis. For the original desktop OSC/MIDI
            workflow, keep using the downloaded CSD in CsoundQt or the Csound Web IDE.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function cycleBand(value: BandName): BandName {
  const idx = BAND_NAMES.indexOf(value);
  return BAND_NAMES[(idx + 1) % BAND_NAMES.length];
}

function StatusTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-zinc-100">{value}</div>
    </div>
  );
}

function ControlSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BandName;
  onChange: (value: BandName) => void;
}) {
  return (
    <LabeledSelect
      label={label}
      value={value}
      onChange={(v) => onChange(v as BandName)}
      options={BAND_NAMES.map((band) => ({
        value: band,
        label: bandTitle(band),
      }))}
    />
  );
}

function BandAssignmentButtons({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: BandName;
  onChange: (value: BandName) => void;
  tone: "emerald" | "amber" | "violet" | "rose" | "sky";
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", toneClass(tone, true))}>
          {bandTitle(value)}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {BAND_NAMES.map((band) => {
          const active = value === band;
          return (
            <button
              key={band}
              type="button"
              onClick={() => onChange(band)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] font-medium capitalize transition",
                active
                  ? toneClass(tone, true)
                  : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              {band}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function assignmentPillClass(active: boolean, tone: "emerald" | "amber" | "violet") {
  return cn(
    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
    active
      ? toneClass(tone, true)
      : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300",
  );
}

function toneClass(tone: "emerald" | "amber" | "violet" | "rose" | "sky", active: boolean) {
  if (!active) return "";
  if (tone === "emerald") return "border-emerald-400/70 bg-emerald-500/20 text-emerald-100 shadow-[0_0_18px_-10px_rgba(16,185,129,.95)]";
  if (tone === "amber") return "border-amber-400/70 bg-amber-500/20 text-amber-100 shadow-[0_0_18px_-10px_rgba(245,158,11,.95)]";
  if (tone === "violet") return "border-violet-400/70 bg-violet-500/20 text-violet-100 shadow-[0_0_18px_-10px_rgba(139,92,246,.95)]";
  if (tone === "rose") return "border-rose-400/70 bg-rose-500/20 text-rose-100 shadow-[0_0_18px_-10px_rgba(244,63,94,.95)]";
  return "border-sky-400/70 bg-sky-500/20 text-sky-100 shadow-[0_0_18px_-10px_rgba(56,189,248,.95)]";
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/70"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
