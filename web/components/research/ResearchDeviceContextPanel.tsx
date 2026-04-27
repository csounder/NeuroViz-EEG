"use client";

import * as React from "react";
import { Cpu } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { resolveActiveIngestPath, sensorRowState } from "@/lib/researchDeviceProfile";
import type { EegTraceSource } from "@/lib/types";

function hasMotionRecent(
  accel: number[] | null,
  gyro: number[] | null,
  live: boolean,
): boolean {
  if (!live) return false;
  const a = accel?.some((v) => Number.isFinite(v) && Math.abs(v) > 1e-6);
  const g = gyro?.some((v) => Number.isFinite(v) && Math.abs(v) > 1e-6);
  return Boolean(a || g);
}

function hasPpgRecent(ppg: number[] | null, live: boolean): boolean {
  if (!live || !ppg?.length) return false;
  return ppg.some((v) => Number.isFinite(v));
}

function hasFnirsRecent(fnirs: number[] | null, live: boolean): boolean {
  if (!live || !fnirs?.length) return false;
  return fnirs.some((v) => Number.isFinite(v));
}

/** Muse-class top-down layout (TP9, AF7, AF8, TP10). */
export function MontageMuseFigure() {
  return (
    <svg viewBox="0 0 220 200" className="h-36 w-full max-w-[220px] text-zinc-100" aria-hidden>
      <ellipse
        cx="110"
        cy="102"
        rx="78"
        ry="88"
        fill="rgba(39,39,42,0.5)"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-zinc-500"
      />
      <text x="110" y="28" textAnchor="middle" className="fill-zinc-500 text-[9px]">
        nose
      </text>
      <circle cx="48" cy="108" r="6" className="fill-emerald-500/90" />
      <text x="48" y="128" textAnchor="middle" className="fill-zinc-300 text-[9px] font-mono">
        TP9
      </text>
      <circle cx="82" cy="58" r="6" className="fill-sky-400/90" />
      <text x="82" y="78" textAnchor="middle" className="fill-zinc-300 text-[9px] font-mono">
        AF7
      </text>
      <circle cx="138" cy="58" r="6" className="fill-amber-400/90" />
      <text x="138" y="78" textAnchor="middle" className="fill-zinc-300 text-[9px] font-mono">
        AF8
      </text>
      <circle cx="172" cy="108" r="6" className="fill-fuchsia-400/90" />
      <text x="172" y="128" textAnchor="middle" className="fill-zinc-300 text-[9px] font-mono">
        TP10
      </text>
    </svg>
  );
}

/** Ganglion / generic 4-ch — linear montage (not anatomical). */
export function MontageFourChannelFigure({ labels }: { labels: [string, string, string, string] }) {
  return (
    <svg viewBox="0 0 280 100" className="h-24 w-full max-w-[280px] text-zinc-100" aria-hidden>
      <text x="140" y="14" textAnchor="middle" className="fill-zinc-500 text-[9px]">
        4-channel montage (verify electrode placement in lab notes)
      </text>
      {[0, 1, 2, 3].map((i) => {
        const x = 40 + i * 70;
        return (
          <g key={labels[i]}>
            <circle cx={x} cy="52" r="10" className="fill-zinc-700 stroke-zinc-500" strokeWidth={1} />
            <text x={x} y="56" textAnchor="middle" className="fill-zinc-100 text-[10px] font-mono">
              {i + 1}
            </text>
            <text x={x} y="78" textAnchor="middle" className="fill-zinc-400 text-[9px] font-mono">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ResearchMontageFigure({ profile }: { profile: ResearchDeviceProfile }) {
  const museLayout =
    profile.family === "muse_athena" ||
    profile.family === "muse_other" ||
    profile.family === "simulator" ||
    (profile.family === "unknown" && profile.capabilities.museContactTiles);
  return (
    <div className="flex flex-col items-center">
      {museLayout ? <MontageMuseFigure /> : <MontageFourChannelFigure labels={profile.channelLabels} />}
      <p className="mt-1 max-w-[280px] text-center text-[10px] text-zinc-500">
        {museLayout ? (
          "Muse-style ear + frontal layout (wearer’s left/right)."
        ) : profile.family === "openbci_ganglion" ? (
          <>
            <span className="text-zinc-400">Ganglion · </span>
            software columns{" "}
            <span className="font-mono text-emerald-200/90">{profile.channelLabels.join(", ")}</span>
            <span className="text-zinc-500"> · nominal </span>
            <span className="font-mono text-sky-200/85">{profile.nominalEegHz} Hz</span>
            <span className="text-zinc-500"> — map each channel to scalp sites in lab notes (not an anatomical cap).</span>
          </>
        ) : (
          "OpenBCI-style labels — map Ch1–4 to your electrode positions in methods."
        )}
      </p>
    </div>
  );
}

export function ResearchDeviceContextPanel({
  profile,
  estimatedEegHz,
  eegTraceSource,
  motion,
  live,
  mindMonitorOscAddresses,
  mindMonitorMode,
}: {
  profile: ResearchDeviceProfile;
  estimatedEegHz: number | null;
  eegTraceSource: EegTraceSource;
  motion: {
    accel: number[] | null;
    gyro: number[] | null;
    ppg: number[] | null;
    fnirs: number[] | null;
  };
  live: boolean;
  mindMonitorOscAddresses: number;
  mindMonitorMode: boolean;
}) {
  const imuRecent = hasMotionRecent(motion.accel, motion.gyro, live);
  const ppgRecent = hasPpgRecent(motion.ppg, live);
  const fnirsRecent = hasFnirsRecent(motion.fnirs, live);

  const rows: { key: string; label: string; expected: boolean; state: ReturnType<typeof sensorRowState> }[] = [
    {
      key: "eeg",
      label: "EEG (4 ch in UI)",
      expected: true,
      state: live ? "active" : "waiting",
    },
    {
      key: "imu",
      label: "Accel / gyro",
      expected: profile.capabilities.imu,
      state: sensorRowState(profile.capabilities.imu, imuRecent),
    },
    {
      key: "ppg",
      label: "PPG (optical pulse)",
      expected: profile.capabilities.ppg,
      state: sensorRowState(profile.capabilities.ppg, ppgRecent),
    },
    {
      key: "fnirs",
      label: "fNIRS / optical aux",
      expected: profile.capabilities.fnirs,
      state: sensorRowState(profile.capabilities.fnirs, fnirsRecent),
    },
  ];

  const pathBadge =
    profile.dataPath === "mind_monitor_osc"
      ? "indigo"
      : profile.dataPath === "direct_bridge"
        ? "emerald"
        : profile.dataPath === "simulator"
          ? "amber"
          : "neutral";

  const active = resolveActiveIngestPath({
    profile,
    mindMonitorMode,
    mindMonitorOscAddressCount: mindMonitorOscAddresses,
    live,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Cpu className="h-4 w-4" />}
          description="Device-aware montage, nominal vs observed rate, expected sensors, and ingest path — Ganglion vs Muse Athena side-by-side clarity."
          actions={
            <div className="flex flex-wrap items-center gap-1">
              <Badge tone={active.badgeTone} title={active.methodsNote}>
                Active: {active.label}
              </Badge>
              <Badge tone={pathBadge} title="Heuristic from device name / connection string">
                Name hint: {profile.dataPath.replace(/_/g, " ")}
              </Badge>
              {profile.family === "openbci_ganglion" ? (
                <Badge tone="neutral" title="Typical BrainFlow / Ganglion board rate">
                  4ch · ~200 Hz nominal
                </Badge>
              ) : null}
              {profile.fourChannelUiCeiling ? (
                <Badge tone="amber">8ch hardware · 4ch UI</Badge>
              ) : null}
            </div>
          }
        >
          Device &amp; sensors · {profile.displayLabel}
        </CardTitle>
      </CardHeader>
      <CardBody className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <ResearchMontageFigure profile={profile} />

        <div className="space-y-4 text-[11px]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Sampling</div>
            <div className="mt-1 text-zinc-300">
              Nominal EEG: <span className="font-mono text-emerald-200/90">{profile.nominalEegHz} Hz</span>
              {estimatedEegHz != null ? (
                <>
                  {" "}
                  · Observed ingest:{" "}
                  <span className="font-mono text-sky-200/90">{estimatedEegHz.toFixed(1)} Hz</span>
                  {estimatedEegHz < profile.nominalEegHz * 0.75 ? (
                    <span className="ml-1 text-amber-400">(below nominal — check bridge/throttle)</span>
                  ) : null}
                </>
              ) : (
                <span className="text-zinc-500"> · Observed: — (stream EEG)</span>
              )}
            </div>
            <div className="mt-1 text-zinc-500">
              Trace mode: <span className="font-mono text-zinc-400">{eegTraceSource}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Streams (expected vs live)
            </div>
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="py-1 pr-2">Sensor</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-zinc-800/60">
                    <td className="py-1.5 pr-2">{r.label}</td>
                    <td className="py-1.5">
                      {r.state === "unsupported" ? (
                        <span className="text-zinc-600">Not on this device</span>
                      ) : r.state === "waiting" ? (
                        <span className="text-amber-200/80">Expected · no data yet</span>
                      ) : (
                        <span className="text-emerald-300/90">Receiving</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-zinc-400 leading-relaxed">
            <span className="font-medium text-zinc-300">Ingest path. </span>
            {active.methodsNote} {profile.dataPathDetail}
            {profile.family === "muse_athena" && profile.dataPath === "direct_bridge" ? (
              <span>
                {" "}
                Athena PPG/fNIRS typically need the direct BLE/bridge path; Mind Monitor OSC may omit or differ in
                optical channels.
              </span>
            ) : null}
            {profile.dataPath === "mind_monitor_osc" && mindMonitorOscAddresses > 0 ? (
              <span className="block mt-1 text-zinc-500">
                OSC inspector: {mindMonitorOscAddresses} address(es) seen — compare to direct stream for duplicate/conflict
                checks.
              </span>
            ) : null}
          </div>

          {profile.family === "muse_athena" ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-[11px] leading-relaxed text-zinc-500">
              <span className="font-medium text-zinc-400">Reference &amp; aux (Muse S Athena). </span>
              Consumer Muse headsets use a manufacturer-defined reference / driven-leg scheme (often described as DRL-like)
              with dry active EEG electrodes; NeuroVis shows scaled µV traces as delivered by your bridge, not a
              user-selected bipolar montage in this UI. Optical PPG and fNIRS/aux channels are separate sensors — cite the
              vendor datasheet for exact EEG reference topology and optical wavelengths in methods.
            </div>
          ) : null}

          {profile.family === "openbci_ganglion" ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-[11px] leading-relaxed text-zinc-500">
              <span className="font-medium text-zinc-400">What people do with Ganglion vs what NeuroVis shows. </span>
              Typical use is affordable 4-channel EEG (~200 Hz) in lab or classroom, often with OpenBCI GUI or BrainFlow,
              ERP-style designs with external triggers, and impedance checks before recording. NeuroVis provides streaming
              EEG, spectral QC on rolling raw, markers (HTTP/OSC/keyboard), and 4-column exports — it does{" "}
              <span className="text-zinc-400">not</span> add IMU, PPG, or fNIRS, and does not replace impedance logging or
              hardware-aligned triggers. See <span className="text-zinc-400">Markers, triggers &amp; latency</span> for
              software marker limits.
            </div>
          ) : null}

          {profile.family === "openbci_cyton" ? (
            <div className="rounded-lg border border-amber-900/35 bg-amber-950/15 p-3 text-[11px] leading-relaxed text-amber-100/85">
              <span className="font-medium text-amber-200/95">Cyton / Daisy · product gap. </span>
              Hardware may expose more than four EEG channels, but Research mode, PLV/coupling tiles, and the in-browser
              recorder are still <span className="text-zinc-200">4-channel–shaped</span> (first four columns). For full
              montage studies, use native acquisition + offline tools, or extend NeuroVis to fan out additional channels —
              until then, document which pins feed exported Ch1–Ch4.
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
