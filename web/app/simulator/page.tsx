"use client";

import * as React from "react";
import {
  AlertTriangle,
  Brain,
  CircleDot,
  FlaskConical,
  Play,
  Power,
  RotateCcw,
  Sliders,
  Send,
  Waves,
  Server,
  Globe,
  Users,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Stat } from "@/components/ui/Stat";
import { Slider } from "@/components/ui/Slider";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";
import { OSCMonitor } from "@/components/widgets/OSCMonitor";
import { BandBars } from "@/components/charts/BandBars";
import { BandHistoryChart } from "@/components/charts/BandHistoryChart";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { FFTChart } from "@/components/charts/FFTChart";
import { useNeuroStore } from "@/lib/store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { clientSim } from "@/lib/clientSim";
import {
  startDualRehearsal,
  stopDualRehearsal,
} from "@/lib/dualRehearsalSim";
import { SIM_PROFILES, type SimProfile } from "@/lib/simulator";
import type { DualRehearsalDriver } from "@/lib/types";
import { BAND_NAMES, type BandPowers } from "@/lib/types";
import { BAND_COLORS, BAND_LABELS } from "@/lib/utils";

const PROFILES: {
  id: SimProfile;
  name: string;
  band: string;
  hint: string;
  emoji: string;
}[] = [
  {
    id: "relaxed_eyes_closed",
    name: "Relaxed — eyes closed",
    band: "alpha",
    hint: "Posterior alpha dominant (10 Hz Berger rhythm). Classic baseline.",
    emoji: "🌙",
  },
  {
    id: "focused",
    name: "Focused",
    band: "beta",
    hint: "Beta-forward (≈18–24 Hz). Active thinking, problem solving.",
    emoji: "🎯",
  },
  {
    id: "meditative",
    name: "Meditative",
    band: "theta",
    hint: "Theta-forward (≈5–7 Hz). Deep meditation, creative flow.",
    emoji: "🧘",
  },
  {
    id: "drowsy",
    name: "Drowsy",
    band: "delta",
    hint: "Delta-heavy (≈1–3 Hz). Falling asleep, very low arousal.",
    emoji: "💤",
  },
  {
    id: "aroused",
    name: "Aroused",
    band: "gamma",
    hint: "High beta + gamma. Stressed, excited, or caffeinated.",
    emoji: "⚡",
  },
];

type Mode = "client" | "server";

export default function SimulatorPage() {
  const { settings, wsStatus, simState, dualRehearsal } = useNeuroStore(
    useShallow((s) => ({
      settings: s.settings,
      wsStatus: s.wsStatus,
      simState: s.clientSim,
      dualRehearsal: s.dualRehearsal,
    })),
  );
  const setDualRehearsal = useNeuroStore((s) => s.setDualRehearsal);

  const [mode, setMode] = React.useState<Mode>("client");
  const [busy, setBusy] = React.useState<string | null>(null);

  // Live option state for the client simulator
  const [oscPrefix, setOscPrefix] = React.useState(
    settings.oscPrefix ?? "/muse",
  );
  const [sendRaw, setSendRaw] = React.useState(false);
  const [sendBands, setSendBands] = React.useState(true);
  const [sendMotion, setSendMotion] = React.useState(false);
  const [sendPPG, setSendPPG] = React.useState(false);
  const [amplitude, setAmplitude] = React.useState(1);
  const [mainsHz, setMainsHz] = React.useState<50 | 60>(60);
  const [manualMode, setManualMode] = React.useState(false);
  const [manualBands, setManualBandsLocal] = React.useState<BandPowers>(
    SIM_PROFILES.relaxed_eyes_closed,
  );

  // Keep oscPrefix synced with server-side settings as a sensible default
  React.useEffect(() => {
    if (settings.oscPrefix && oscPrefix === "/muse") {
      setOscPrefix(settings.oscPrefix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.oscPrefix]);

  // Sync this page's option UI state into the long-lived sim singleton.
  // Because `clientSim` is a module singleton, these calls are safe even on
  // remount — they don't restart anything.
  React.useEffect(() => {
    clientSim.setOptions({
      oscPrefix,
      sendRaw,
      sendBands,
      sendMotion,
      sendPPG,
      amplitudeScale: amplitude,
      mainsHz,
    });
  }, [
    oscPrefix,
    sendRaw,
    sendBands,
    sendMotion,
    sendPPG,
    amplitude,
    mainsHz,
  ]);

  const run = async (key: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  // Master toggles — dispatch to either client or server engine
  const start = async () => {
    stopDualRehearsal();
    if (mode === "client") {
      // Stop any server-side sim to avoid two streams racing
      await api.useSimulator(false).catch(() => {});
      // Ensure the server's OSC gate is open (for other flows that use it)
      await api
        .setDspConfig({ oscSending: true })
        .catch(() => {});
      clientSim.start();
    } else {
      // Server-side: stop client loop if running, then kick the existing endpoint
      clientSim.stop();
      await api.useSimulator(true);
    }
  };
  const stop = async () => {
    if (mode === "client") {
      clientSim.stop();
    } else {
      await api.useSimulator(false);
    }
  };

  const running =
    mode === "client" ? simState.running : Boolean(settings.simulatorMode);
  const dualRunning = dualRehearsal.enabled;

  const startDualRehearsalMode = () =>
    run("dual", async () => {
      clientSim.stop();
      await api.useSimulator(false).catch(() => {});
      startDualRehearsal();
    });

  const stopDualRehearsalMode = () => {
    stopDualRehearsal();
  };

  const setProfile = (p: SimProfile) => {
    setManualMode(false);
    setManualBandsLocal(SIM_PROFILES[p]);
    if (mode === "client") {
      clientSim.setProfile(p);
    } else {
      run("profile", () => api.setSimulatorProfile(p));
    }
  };

  // Exit manual mode → clear the override in the sim.
  React.useEffect(() => {
    if (mode !== "client") return;
    if (!manualMode) {
      clientSim.setManualBands(null);
    }
  }, [manualMode, mode]);

  // Drag a slider: update local UI state AND push straight to the sim so
  // Csound hears the change immediately. (Imperative — no effect loop.)
  const setBand = (band: keyof BandPowers, v: number) => {
    const next = { ...manualBands, [band]: Math.max(0, v) };
    setManualBandsLocal(next);
    if (mode === "client") clientSim.setManualBands(next);
    if (!manualMode) setManualMode(true);
  };

  const activeProfileId =
    mode === "client"
      ? simState.profile
      : ((settings as any).simulatorProfile ?? "relaxed_eyes_closed");

  const elapsedMs = simState.startedAt ? Date.now() - simState.startedAt : 0;
  const elapsed = Math.floor(elapsedMs / 1000);
  const packets =
    mode === "client"
      ? simState.packetsSent
      : 0; // server-side count is cumulative across sessions

  const [rawScale, setRawScale] = React.useState<ScaleState>({
    auto: true,
    value: 200,
  });
  const [fftScale, setFftScale] = React.useState<ScaleState>({
    auto: true,
    value: 40,
  });
  const [bandScaleState, setBandScaleState] = React.useState<ScaleState>({
    auto: true,
    value: 100,
  });

  return (
    <div className="space-y-6">
      {/* Master card */}
      <Card className="overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60"
          style={{
            background: running
              ? "radial-gradient(600px 200px at 20% 0%, rgba(245,158,11,0.18), transparent 60%)"
              : "radial-gradient(600px 200px at 20% 0%, rgba(16,185,129,0.12), transparent 60%)",
          }}
        />
        <CardHeader>
          <CardTitle
            icon={<FlaskConical className="h-4 w-4" />}
            description="Physiologically accurate synthetic EEG — feeds every display and streams OSC to Csound / Max"
            actions={
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider",
                  running
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-zinc-700 bg-zinc-900/60 text-zinc-400",
                )}
              >
                <CircleDot
                  className={cn(
                    "h-3 w-3",
                    running ? "text-amber-400 animate-pulse" : "text-zinc-500",
                  )}
                />
                {running ? "Running" : "Off"}
                {running && simState.oscRelayActive && mode === "client" && (
                  <span className="ml-1 text-emerald-300">· OSC relay</span>
                )}
              </div>
            }
          >
            Simulator
          </CardTitle>
        </CardHeader>
        <CardBody className="relative space-y-5">
          {/* Mode selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
              <Button
                size="sm"
                variant={mode === "client" ? "secondary" : "ghost"}
                onClick={() => setMode("client")}
                leftIcon={<Globe className="h-3.5 w-3.5" />}
              >
                Browser → OSC relay
              </Button>
              <Button
                size="sm"
                variant={mode === "server" ? "secondary" : "ghost"}
                onClick={() => setMode("server")}
                leftIcon={<Server className="h-3.5 w-3.5" />}
              >
                Server-side (through DSP)
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              {mode === "client"
                ? "Simulation runs in the browser; OSC packets are relayed to UDP by the server. Interactive sliders work live."
                : "Simulation runs on the server and passes through the full DSP pipeline. Best for testing backend filters."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={running ? "danger" : "primary"}
              onClick={() => run("toggle", () => (running ? stop() : start()))}
              disabled={
                busy !== null || wsStatus !== "open" || dualRunning
              }
              leftIcon={
                running ? (
                  <Power className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )
              }
            >
              {running ? "Stop simulator" : "Start simulator"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="State"
              value={running ? "RUNNING" : "OFF"}
              icon={<FlaskConical className="h-4 w-4" />}
            />
            <Stat
              label="Mode"
              value={mode === "client" ? "Browser" : "Server"}
              hint={
                mode === "client"
                  ? "Relay → UDP :7400"
                  : "Backend interval → UDP :7400"
              }
            />
            <Stat
              label="Duration"
              value={
                running && mode === "client"
                  ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                  : running
                    ? "—"
                    : "—"
              }
            />
            <Stat
              label="Packets (sim→OSC)"
              value={running && mode === "client" ? packets.toLocaleString() : "—"}
              hint={mode === "client" ? `${BAND_NAMES.length * 4 + (sendRaw ? 5 : 0) + (sendMotion ? 2 : 0) + (sendPPG ? 2 : 0)} streams` : "—"}
            />
          </div>

          {wsStatus !== "open" && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                WebSocket isn't connected. Start the backend (
                <code className="font-mono text-amber-200">npm start</code>) to
                enable the OSC relay.
              </span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Two-person rehearsal — distinct synthetic minds on one machine */}
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Users className="h-4 w-4" />}
            description="Rehearse Amy vs you before two laptops: two profile-shaped band streams with different motion; pick who drives the dashboard or alternate / blend."
            actions={
              dualRunning ? (
                <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-violet-200">
                  Dual rehearsal on
                </span>
              ) : null
            }
          >
            Dual rehearsal (Amy + you)
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs leading-relaxed text-zinc-500">
            Not full 256 Hz DSP twins — avoids fighting the shared simulator filters — but band powers, coarse µV, and traces diverge so Concert / Csound / OSC hear{" "}
            <strong className="text-zinc-300">different characters</strong>. Stop this mode before starting the standard simulator above.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Amy (preset)
              </label>
              <select
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/60"
                value={dualRehearsal.amyProfile}
                disabled={busy !== null}
                onChange={(e) =>
                  setDualRehearsal({
                    amyProfile: e.target.value as SimProfile,
                  })
                }
              >
                {PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                You (preset)
              </label>
              <select
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/60"
                value={dualRehearsal.selfProfile}
                disabled={busy !== null}
                onChange={(e) =>
                  setDualRehearsal({
                    selfProfile: e.target.value as SimProfile,
                  })
                }
              >
                {PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Who feeds the dashboard
            </label>
            <select
              className="w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/60"
              value={dualRehearsal.driver}
              disabled={busy !== null}
              onChange={(e) =>
                setDualRehearsal({
                  driver: e.target.value as DualRehearsalDriver,
                })
              }
            >
              <option value="alternate">Alternate Amy / You (every few seconds)</option>
              <option value="amy">Amy only</option>
              <option value="self">You only</option>
              <option value="blend">Blend both (average bands)</option>
            </select>
          </div>

          {dualRehearsal.driver === "alternate" && (
            <Slider
              label="Alternate interval"
              value={dualRehearsal.alternatePeriodSec}
              min={3}
              max={20}
              step={1}
              onChange={(v) => setDualRehearsal({ alternatePeriodSec: v })}
              format={(v) => `${v}s`}
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={dualRunning ? "danger" : "secondary"}
              onClick={() =>
                dualRunning ? stopDualRehearsalMode() : startDualRehearsalMode()
              }
              disabled={busy !== null || running}
              leftIcon={
                dualRunning ? (
                  <Power className="h-3.5 w-3.5" />
                ) : (
                  <Users className="h-3.5 w-3.5" />
                )
              }
            >
              {dualRunning ? "Stop dual rehearsal" : "Start dual rehearsal"}
            </Button>
            {dualRunning && dualRehearsal.lastDriverLabel && (
              <span className="font-mono text-xs text-violet-300">
                {dualRehearsal.lastDriverLabel}
              </span>
            )}
          </div>
          {running && (
            <p className="text-xs text-amber-400">
              Stop the standard simulator first — dual rehearsal and full EEG simulator cannot run together.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Profiles */}
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Brain className="h-4 w-4" />}
            description="Quick-switch brain states — useful for exercising Csound/Max receivers"
            actions={
              manualMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setManualMode(false);
                    clientSim.setManualBands(null);
                  }}
                >
                  Back to profile
                </Button>
              )
            }
          >
            Brain state profile
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {PROFILES.map((p) => {
              const active = activeProfileId === p.id && !manualMode;
              return (
                <button
                  key={p.id}
                  onClick={() => setProfile(p.id)}
                  disabled={busy !== null}
                  className={cn(
                    "flex h-full flex-col gap-1 rounded-lg border px-3 py-3 text-left transition-colors",
                    active
                      ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]"
                      : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900",
                    busy !== null && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{p.emoji}</span>
                    <span
                      className={cn(
                        "font-mono text-[9px] uppercase tracking-wider",
                        `text-band-${p.band}`,
                      )}
                    >
                      {p.band}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-100">
                    {p.name}
                  </div>
                  <div className="text-xs leading-snug text-zinc-500">
                    {p.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Live band mixer (client mode only) */}
      {mode === "client" && (
        <Card>
          <CardHeader>
            <CardTitle
              icon={<Sliders className="h-4 w-4" />}
              description="Drag a band to manually override the profile — Csound/Max hear it live"
            >
              Live band mixer
              {manualMode && (
                <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
                  manual
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              {BAND_NAMES.map((b) => (
                <div key={b} className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span
                      className="font-mono text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: BAND_COLORS[b] }}
                    >
                      {BAND_LABELS[b]}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-zinc-200">
                      {Math.round(manualBands[b] * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={manualBands[b]}
                    onChange={(e) =>
                      setBand(b, parseFloat(e.target.value))
                    }
                    className="w-full accent-emerald-500"
                    style={{ accentColor: BAND_COLORS[b] }}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Bands are normalised before being sent — absolute values are
              relative proportions. Perfect for iterating filter and OSC-range
              settings against Csound until the sound is exactly right.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Streams + noise (client only) */}
      {mode === "client" && (
        <Card>
          <CardHeader>
            <CardTitle description="What to send and how rich to make it — receivers see every change instantly">
              Output streams
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Toggle
                checked={sendBands}
                onCheckedChange={setSendBands}
                label="Band powers"
                hint="/muse/bands/absolute, /muse/elements/alpha_absolute …"
              />
              <Toggle
                checked={sendRaw}
                onCheckedChange={setSendRaw}
                label="Raw EEG"
                hint="256 Hz /muse/eeg + /muse/eeg/{TP9,AF7,AF8,TP10}"
              />
              <Toggle
                checked={sendMotion}
                onCheckedChange={setSendMotion}
                label="Accel / Gyro"
                hint="/muse/acc, /muse/gyro"
              />
              <Toggle
                checked={sendPPG}
                onCheckedChange={setSendPPG}
                label="PPG / HR"
                hint="/muse/ppg, /muse/ppg/hr (72 BPM synth)"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Slider
                label="Amplitude"
                value={amplitude}
                min={0.1}
                max={3}
                step={0.05}
                onChange={setAmplitude}
                format={(v) => `${v.toFixed(2)}×`}
              />
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Power mains
                </div>
                <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
                  {[50, 60].map((hz) => (
                    <Button
                      key={hz}
                      size="sm"
                      variant={mainsHz === hz ? "secondary" : "ghost"}
                      onClick={() => setMainsHz(hz as 50 | 60)}
                    >
                      {hz} Hz
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  OSC prefix
                </div>
                <input
                  value={oscPrefix}
                  onChange={(e) => setOscPrefix(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* OSC + band bars side by side */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle
              icon={<Send className="h-4 w-4" />}
              description="What Csound / Max are actually receiving — this IS the wire"
            >
              OSC output
            </CardTitle>
          </CardHeader>
          <CardBody>
            <OSCMonitor height={400} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle description="Current simulated band distribution">
              Band powers
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <BandBars
              mode="relative"
              autoScale={bandScaleState.auto}
              scaleValue={bandScaleState.value}
            />
            <BandHistoryChart
              height={140}
              autoScale={bandScaleState.auto}
              scaleValue={bandScaleState.value}
            />
            <ScaleControl
              compact
              state={bandScaleState}
              onChange={setBandScaleState}
              label="Ceiling"
              unit="%"
              min={5}
              max={500}
              helpAuto="Bars and history are always 0–100 %."
              helpManual="Cap the percentage ceiling to magnify subtle profile differences."
            />
          </CardBody>
        </Card>
      </div>

      {/* Raw + FFT previews */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle
              icon={<CircleDot className="h-4 w-4" />}
              description="Synthetic 4-channel time-series with 1/f noise, mains, breathing"
            >
              Simulated raw EEG
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 p-0">
            <RawEEGChart
              height={260}
              autoScale={rawScale.auto}
              scaleValue={rawScale.value}
            />
            <div className="px-5 pb-4">
              <ScaleControl
                compact
                state={rawScale}
                onChange={setRawScale}
                label="Y"
                unit="µV"
                bipolar
                min={10}
                max={2000}
                helpAuto="Each lane auto-scales to its own signal."
                helpManual="Fixed ±µV range across all lanes."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              icon={<Waves className="h-4 w-4" />}
              description="Spectrum of the simulator output — verify expected band peaks"
            >
              Simulated FFT
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <FFTChart
              height={260}
              autoScale={fftScale.auto}
              scaleValue={fftScale.value}
            />
            <ScaleControl
              compact
              state={fftScale}
              onChange={setFftScale}
              label="Y"
              unit="dB"
              min={10}
              max={120}
              helpAuto="EMA tracks signal dB min/max."
              helpManual="Fix 0 to a dB value."
            />
          </CardBody>
        </Card>
      </div>

      {/* Guide */}
      <Card>
        <CardHeader>
          <CardTitle description="How to use this with Csound / Max">
            Receiver test plan
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-zinc-400">
          <ol className="ml-4 list-decimal space-y-1.5">
            <li>
              Point your receiver at{" "}
              <code className="font-mono text-zinc-200">
                {settings.oscHost ?? "127.0.0.1"}:{settings.oscPort ?? 7400}
              </code>{" "}
              (configured in the OSC page).
            </li>
            <li>
              Pick <b>Browser → OSC relay</b> mode above. Start the simulator.
            </li>
            <li>
              Switch between the 5 profiles and confirm your receiver reacts.
            </li>
            <li>
              Toggle <b>Live band mixer</b> and drag any band — Csound hears
              the change instantly, ideal for iterating filter / range / scale
              settings.
            </li>
            <li>
              Once happy, save a named preset on the OSC page so the exact
              settings come back later.
            </li>
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
