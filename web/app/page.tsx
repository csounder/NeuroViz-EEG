"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Radio,
  Waves,
  Wifi,
  Zap,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import { BandBars } from "@/components/charts/BandBars";
import { BrainStateCard } from "@/components/widgets/BrainStateCard";
import { QuickActions } from "@/components/widgets/QuickActions";
import { useNeuroStore } from "@/lib/store";
import { BandHistoryChart } from "@/components/charts/BandHistoryChart";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

export default function OverviewPage() {
  const { wsStatus, lastMessageAt, packetCount, deviceName, settings } =
    useNeuroStore(
      useShallow((s) => ({
        wsStatus: s.wsStatus,
        lastMessageAt: s.lastMessageAt,
        packetCount: s.packetCount,
        deviceName: s.deviceName,
        settings: s.settings,
      })),
    );

  const [rawScale, setRawScale] = React.useState<ScaleState>({
    auto: true,
    value: 200,
  });
  const [bandScale, setBandScale] = React.useState<ScaleState>({
    auto: true,
    value: 100,
  });

  const latency =
    lastMessageAt !== null ? Date.now() - lastMessageAt : null;
  const active = deviceName ?? (settings.simulatorMode ? "Simulator" : "—");

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 via-zinc-900/60 to-zinc-950 px-6 py-8 sm:px-8 sm:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(600px 280px at 85% 0%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(500px 300px at 10% 100%, rgba(99,102,241,0.15), transparent 60%)",
          }}
        />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              <Zap className="h-3 w-3 text-emerald-400" />
              Real-time neurofeedback
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              Your brain, in motion.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400 sm:text-base">
              A live window into your EEG — raw traces, band powers, FFT, and
              brain state — streaming from your Muse or OpenBCI device and out
              to Csound, Max/MSP, or any OSC-aware tool.
            </p>
            <div className="mt-6">
              <QuickActions />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm lg:min-w-[280px]">
            <Stat
              label="Connection"
              icon={<Wifi className="h-4 w-4" />}
              value={wsStatus === "open" ? "Live" : wsStatus}
              hint={latency !== null ? `${latency}ms ago` : "Waiting…"}
            />
            <Stat
              label="Source"
              icon={<Activity className="h-4 w-4" />}
              value={active}
              hint={`${packetCount.toLocaleString()} packets`}
            />
          </div>
        </div>
      </section>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle
              icon={<Activity className="h-4 w-4" />}
              description="4-channel live EEG · 4s rolling window"
              actions={
                <Link href="/raw">
                  <Button
                    size="sm"
                    variant="ghost"
                    rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Open
                  </Button>
                </Link>
              }
            >
              Raw EEG
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 p-0">
            <RawEEGChart
              height={320}
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

        <div className="space-y-6">
          <BrainStateCard />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            icon={<BarChart3 className="h-4 w-4" />}
            description="Relative power across five canonical EEG bands"
            actions={
              <Link href="/bands">
                <Button
                  size="sm"
                  variant="ghost"
                  rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  Details
                </Button>
              </Link>
            }
          >
            Band Powers
          </CardTitle>
        </CardHeader>
        <CardBody>
          <BandBars
            mode="relative"
            autoScale={bandScale.auto}
            scaleValue={bandScale.value}
          />
          <div className="mt-6">
            <BandHistoryChart
              height={180}
              autoScale={bandScale.auto}
              scaleValue={bandScale.value}
            />
          </div>
          <div className="mt-4">
            <ScaleControl
              compact
              state={bandScale}
              onChange={setBandScale}
              label="Ceiling"
              unit="%"
              min={5}
              max={500}
              helpAuto="Bars and history are always 0–100 %."
              helpManual="Caps the % ceiling — a lower ceiling stretches subtle changes."
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle
              icon={<Waves className="h-4 w-4" />}
              description="Frequency-domain view"
              actions={
                <Link href="/fft">
                  <Button
                    size="sm"
                    variant="ghost"
                    rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Open
                  </Button>
                </Link>
              }
            >
              FFT Spectrum
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-zinc-400">
              See which frequencies are dominant right now, with band regions
              highlighted behind the live trace.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              icon={<Radio className="h-4 w-4" />}
              description="OSC output for Csound / Max / TouchDesigner"
              actions={
                <Link href="/osc">
                  <Button
                    size="sm"
                    variant="ghost"
                    rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Open
                  </Button>
                </Link>
              }
            >
              OSC Streaming
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-zinc-400">
              Route raw EEG, band powers, and motion over OSC on port{" "}
              <span className="font-mono text-zinc-200">
                {String(settings.oscPort ?? 7400)}
              </span>{" "}
              with full control over rate, smoothing, and scaling.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
