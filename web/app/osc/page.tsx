"use client";

import * as React from "react";
import { Radio, Send } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Slider } from "@/components/ui/Slider";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useNeuroStore } from "@/lib/store";
import { OSCMonitor } from "@/components/widgets/OSCMonitor";
import { PresetPicker } from "@/components/widgets/PresetPicker";
import type { Preset, OscPresetData } from "@/lib/presets";

export default function OSCPage() {
  const settings = useNeuroStore((s) => s.settings);
  const [prefix, setPrefix] = React.useState(settings.oscPrefix ?? "/muse");
  const [port, setPort] = React.useState(settings.oscPort ?? 7400);
  const [host, setHost] = React.useState(settings.oscHost ?? "127.0.0.1");
  const [rate, setRate] = React.useState(settings.oscRate ?? 10);
  const [smoothing, setSmoothing] = React.useState(
    settings.oscSmoothing ?? 0.5,
  );
  const [scale, setScale] = React.useState(settings.oscScale ?? 1);
  const [streams, setStreams] = React.useState({
    rawEEG: Boolean(settings.oscStreams?.rawEEG),
    bandPowers: Boolean(settings.oscStreams?.bandPowers ?? true),
    motion: Boolean(settings.oscStreams?.motion),
    ppg: Boolean(settings.oscStreams?.ppg),
    fnirs: Boolean(settings.oscStreams?.fnirs),
  });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (settings.oscPrefix !== undefined) setPrefix(settings.oscPrefix);
    if (settings.oscPort !== undefined) setPort(settings.oscPort);
    if (settings.oscHost !== undefined) setHost(settings.oscHost);
    if (settings.oscRate !== undefined) setRate(settings.oscRate);
    if (settings.oscSmoothing !== undefined)
      setSmoothing(settings.oscSmoothing);
    if (settings.oscScale !== undefined) setScale(settings.oscScale);
    if (settings.oscStreams)
      setStreams((prev) => ({ ...prev, ...settings.oscStreams }));
  }, [settings]);

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api.updateSettings({
        oscPrefix: prefix,
        oscHost: host,
        oscPort: port,
        oscRate: rate,
        oscSmoothing: smoothing,
        oscScale: scale,
        oscStreams: streams,
      });
    } finally {
      setBusy(false);
    }
  };

  const testOSC = async () => {
    setBusy(true);
    try {
      await api.updateSettings({ oscTest: true }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Radio className="h-4 w-4" />}
            description="Live preview of the OSC messages flowing to Csound / Max / TouchDesigner"
            actions={
              <Badge tone="emerald" dot>
                {host}:{port}
              </Badge>
            }
          >
            OSC Monitor
          </CardTitle>
        </CardHeader>
        <CardBody>
          <OSCMonitor height={320} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Named bundles of the full OSC config — host / port / prefix / rate / smoothing / scale / streams">
            Presets
          </CardTitle>
        </CardHeader>
        <CardBody>
          <PresetPicker
            scope="osc"
            label="OSC presets"
            capture={(): Partial<Preset> => ({
              osc: {
                oscHost: host,
                oscPort: port,
                oscPrefix: prefix,
                oscRate: rate,
                oscSmoothing: smoothing,
                oscScale: scale,
                oscStreams: streams,
              } satisfies OscPresetData,
            })}
            apply={(p) => {
              const o = p.osc;
              if (!o) return;
              if (o.oscHost !== undefined) setHost(o.oscHost);
              if (o.oscPort !== undefined) setPort(o.oscPort);
              if (o.oscPrefix !== undefined) setPrefix(o.oscPrefix);
              if (o.oscRate !== undefined) setRate(o.oscRate);
              if (o.oscSmoothing !== undefined) setSmoothing(o.oscSmoothing);
              if (o.oscScale !== undefined) setScale(o.oscScale);
              if (o.oscStreams) {
                setStreams((s) => ({ ...s, ...(o.oscStreams as any) }));
              }
              // Push to backend immediately
              api
                .updateSettings({
                  oscHost: o.oscHost,
                  oscPort: o.oscPort,
                  oscPrefix: o.oscPrefix,
                  oscRate: o.oscRate,
                  oscSmoothing: o.oscSmoothing,
                  oscScale: o.oscScale,
                  oscStreams: o.oscStreams,
                })
                .catch(() => {});
            }}
          />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle
              description="Send live EEG to any OSC-speaking tool on your network"
            >
              Output
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <LabelInput
                label="Host"
                value={host}
                onChange={setHost}
                placeholder="127.0.0.1"
              />
              <LabelInput
                label="Port"
                value={String(port)}
                onChange={(v) => setPort(Number(v) || 0)}
                placeholder="7400"
                mono
              />
              <LabelInput
                label="Address prefix"
                value={prefix}
                onChange={setPrefix}
                placeholder="/muse"
                mono
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Slider
                label="Rate"
                unit="Hz"
                value={rate}
                min={1}
                max={100}
                step={1}
                onChange={setRate}
              />
              <Slider
                label="Smoothing"
                value={smoothing}
                min={0}
                max={1}
                step={0.01}
                onChange={setSmoothing}
                format={(v) => v.toFixed(2)}
              />
              <Slider
                label="Scale"
                unit="×"
                value={scale}
                min={0.1}
                max={5}
                step={0.1}
                onChange={setScale}
                format={(v) => v.toFixed(1)}
              />
            </div>

            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Streams
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Toggle
                  checked={streams.bandPowers}
                  onCheckedChange={(v) =>
                    setStreams((s) => ({ ...s, bandPowers: v }))
                  }
                  label="Band powers"
                  hint="Csound/Max arrays — /muse/bands/alpha_absolute f f f f"
                />
                <Toggle
                  checked={streams.rawEEG}
                  onCheckedChange={(v) =>
                    setStreams((s) => ({ ...s, rawEEG: v }))
                  }
                  label="Raw EEG"
                  hint="Scalar — /eeg/AF7/raw f (256 Hz, no throttle)"
                />
                <Toggle
                  checked={streams.motion}
                  onCheckedChange={(v) =>
                    setStreams((s) => ({ ...s, motion: v }))
                  }
                  label="Accel / Gyro"
                />
                <Toggle
                  checked={streams.ppg}
                  onCheckedChange={(v) =>
                    setStreams((s) => ({ ...s, ppg: v }))
                  }
                  label="PPG / Heart rate"
                  hint="Muse S / Athena only"
                />
                <Toggle
                  checked={streams.fnirs}
                  onCheckedChange={(v) =>
                    setStreams((s) => ({ ...s, fnirs: v }))
                  }
                  label="fNIRS"
                  hint="Muse Athena only"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={saveSettings}
                disabled={busy}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={testOSC}
                disabled={busy}
                leftIcon={<Send className="h-3.5 w-3.5" />}
              >
                Send test bundle
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle description="How to receive in Csound / Max">
              Receiver snippets
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4 text-xs">
            <div>
              <div className="mb-1 font-mono uppercase tracking-wider text-zinc-500">
                Csound (OSCinit / OSClisten)
              </div>
              <pre className="scroll-thin overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[11px] leading-5 text-zinc-300">
{`giOSC OSCinit ${port}
ka[] init 5
kF   OSClisten giOSC, "${prefix}/bands/alpha_absolute", "ffff", ka[0], ka[1], ka[2], ka[3]`}
              </pre>
            </div>
            <div>
              <div className="mb-1 font-mono uppercase tracking-wider text-zinc-500">
                Max / MSP (udpreceive)
              </div>
              <pre className="scroll-thin overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[11px] leading-5 text-zinc-300">
{`[udpreceive ${port}]
    |
[route ${prefix}]
    |
[route /bands /eeg /motion]`}
              </pre>
            </div>
            <p className="text-zinc-500">
              Full address reference is in{" "}
              <code>README-CSOUND-INTEGRATION.md</code>.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function LabelInput({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-500/60 focus:bg-zinc-900 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
