"use client";

import * as React from "react";
import { Eye, EyeOff, Film, Maximize2, Sparkles } from "lucide-react";
import {
  ConcertVisualizer,
  CONCERT_SCENES,
  type ConcertScene,
} from "@/components/concert/ConcertVisualizer";
import { CsoundV12Renderer, type V12RenderControls } from "@/components/csound/CsoundV12Renderer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Slider } from "@/components/ui/Slider";
import { useNeuroStore } from "@/lib/store";
import type { BandName } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGE_CSOUND_CONTROLS: V12RenderControls = {
  harmonyBand: "alpha",
  bassDriver: "delta",
  melodyDriver: "gamma",
  rhythmDriver: "beta",
  registerDriver: "alpha",
  responseMode: 1,
  orchestration: 1,
  motion: 1,
  palette: 2,
  cc1Mode: "volume",
  melodyVolume: 0.72,
  melodyComplexity: 0.42,
};

function cycleBand(band: BandName): BandName {
  const bands: BandName[] = ["delta", "theta", "alpha", "beta", "gamma"];
  return bands[(bands.indexOf(band) + 1) % bands.length];
}

export default function ConcertPage() {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const latestBandsAbs = useNeuroStore((s) => s.latestBandsAbs);
  const latestBandTraces = useNeuroStore((s) => s.latestBandTraces);
  const wsStatus = useNeuroStore((s) => s.wsStatus);
  const brainState = useNeuroStore((s) => s.brainState);
  const deviceName = useNeuroStore((s) => s.deviceName);
  const motionStreams = useNeuroStore((s) => s.motion);
  const batteryPct = useNeuroStore((s) => s.batteryPct);

  const [scene, setScene] = React.useState<ConcertScene>("auroraBrain");
  const [intensity, setIntensity] = React.useState(1.15);
  const [trails, setTrails] = React.useState(0.9);
  const [showHud, setShowHud] = React.useState(true);
  const [showControls, setShowControls] = React.useState(true);
  const [csoundControls, setCsoundControls] =
    React.useState<V12RenderControls>(STAGE_CSOUND_CONTROLS);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (event.key >= "1" && event.key <= "9") {
        setScene(CONCERT_SCENES[Number(event.key) - 1].id);
      }
      if (event.key === "0") setScene(CONCERT_SCENES[9].id);
      if (event.key === "f" || event.key === "F") {
        void requestStageFullscreen(stageRef.current);
      }
      if (event.key === "h" || event.key === "H") setShowHud((v) => !v);
      if (event.key === "c" || event.key === "C") setShowControls((v) => !v);
      if (event.key === "d") setCsoundControls((v) => ({ ...v, harmonyBand: "delta" }));
      if (event.key === "t") setCsoundControls((v) => ({ ...v, harmonyBand: "theta" }));
      if (event.key === "a") setCsoundControls((v) => ({ ...v, harmonyBand: "alpha" }));
      if (event.key === "b") setCsoundControls((v) => ({ ...v, harmonyBand: "beta" }));
      if (event.key === "L") setCsoundControls((v) => ({ ...v, bassDriver: cycleBand(v.bassDriver) }));
      if (event.key === "N") setCsoundControls((v) => ({ ...v, melodyDriver: cycleBand(v.melodyDriver) }));
      if (event.key === "r") setCsoundControls((v) => ({ ...v, rhythmDriver: cycleBand(v.rhythmDriver) }));
      if (event.key === "e") setCsoundControls((v) => ({ ...v, registerDriver: cycleBand(v.registerDriver) }));
      if (event.key === "z") {
        setCsoundControls((v) => ({
          ...v,
          cc1Mode: v.cc1Mode === "volume" ? "complexity" : "volume",
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const spec = CONCERT_SCENES.find((s) => s.id === scene) ?? CONCERT_SCENES[0];

  return (
    <div className="space-y-5">
      <Card className={cn(!showControls && "hidden")}>
        <CardHeader>
          <CardTitle
            icon={<Film className="h-4 w-4" />}
            description="Ten stage-first EEG visualizers for projection, performance, and large concert audiences."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={wsStatus === "open" ? "emerald" : "rose"} dot>
                  {wsStatus === "open" ? "EEG Live" : wsStatus}
                </Badge>
                {brainState && <Badge tone="violet">{brainState.state}</Badge>}
                {deviceName && <Badge tone="indigo">{deviceName}</Badge>}
              </div>
            }
          >
            Concert Visualizations
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {CONCERT_SCENES.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setScene(item.id)}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  scene === item.id
                    ? "border-emerald-400/80 bg-emerald-500/10 shadow-[0_0_36px_-18px_rgba(16,185,129,.95)]"
                    : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/70",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-100">{item.title}</div>
                  <kbd className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                    {index === 9 ? 0 : index + 1}
                  </kbd>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-500">{item.subtitle}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <Slider
              label="Stage intensity"
              value={intensity}
              min={0.25}
              max={2.25}
              step={0.01}
              onChange={setIntensity}
              format={(v) => `${v.toFixed(2)}x`}
            />
            <Slider
              label="Light trails"
              value={trails}
              min={0.68}
              max={0.97}
              step={0.01}
              onChange={setTrails}
              format={(v) => v.toFixed(2)}
            />
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowHud((v) => !v)}
                leftIcon={showHud ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              >
                HUD
              </Button>
              <Button
                onClick={() => void requestStageFullscreen(stageRef.current)}
                leftIcon={<Maximize2 className="h-4 w-4" />}
              >
                Fullscreen
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/45 p-3 text-xs leading-5 text-zinc-400">
            Performance keys: <kbd className="text-emerald-300">1-9, 0</kbd> scenes,{" "}
            <kbd className="text-emerald-300">F</kbd> fullscreen,{" "}
            <kbd className="text-emerald-300">H</kbd> HUD,{" "}
            <kbd className="text-emerald-300">C</kbd> controls. V12 harmony shortcuts still work
            while this page is open, and the USB MIDI panel below stays mounted for live playing.
          </div>
        </CardBody>
      </Card>

      <section
        ref={stageRef}
        className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-[0_0_80px_-40px_rgba(34,211,238,.75)]"
      >
        <ConcertVisualizer
          scene={scene}
          latestBandsAbs={latestBandsAbs}
          latestBandTraces={latestBandTraces}
          intensity={intensity}
          trails={trails}
          showHud={showHud}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.06] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="pointer-events-none absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              {spec.title}
            </div>
            <div className="mt-1 max-w-2xl text-xs text-zinc-400">{spec.subtitle}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-[11px] text-zinc-400 backdrop-blur-md">
            NeuroVis Concert Mode
          </div>
        </div>
      </section>

      <Card className={cn(!showControls && "hidden")}>
        <CardHeader>
          <CardTitle
            icon={<Sparkles className="h-4 w-4" />}
            description="Stage Performance: browser Csound, USB MIDI, and concert visuals stay together on one page."
          >
            V12 Audio For Concert Mode
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            <Badge tone="emerald">Harmony: {csoundControls.harmonyBand}</Badge>
            <Badge tone="indigo">Bass: {csoundControls.bassDriver}</Badge>
            <Badge tone="violet">Melody: {csoundControls.melodyDriver}</Badge>
            <Badge tone="amber">CC1: {csoundControls.cc1Mode}</Badge>
          </div>
          <CsoundV12Renderer
            controls={csoundControls}
            latestEEG={latestEEG}
            latestBandsAbs={latestBandsAbs}
            latestBandTraces={latestBandTraces}
            motion={motionStreams}
            batteryPct={batteryPct}
          />
        </CardBody>
      </Card>
    </div>
  );
}

async function requestStageFullscreen(element: HTMLElement | null) {
  if (!element) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await element.requestFullscreen();
}
