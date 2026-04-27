"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, ChevronLeft, Clock, Radio } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { BandBars } from "@/components/charts/BandBars";
import { ResearchTimelineStrip } from "@/components/research/ResearchTimelineStrip";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useNeuroStore } from "@/lib/store";

export default function ResearchConcertObserverPage() {
  const {
    wsStatus,
    deviceName,
    packetCount,
    lastStimulusClock,
    researchEvents,
    requestWsReconnect,
  } = useNeuroStore(
    useShallow((s) => ({
      wsStatus: s.wsStatus,
      deviceName: s.deviceName,
      packetCount: s.packetCount,
      lastStimulusClock: s.lastStimulusClock,
      researchEvents: s.researchEvents,
      requestWsReconnect: s.requestWsReconnect,
    })),
  );

  const markerEvents = React.useMemo(
    () =>
      [...researchEvents]
        .filter((e) => e.label !== "stimulus_clock")
        .slice(-16)
        .reverse(),
    [researchEvents],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-3 py-4 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/research/stimulus"
          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          <ChevronLeft className="h-4 w-4" />
          Stimulus EEG
        </Link>
        <button
          type="button"
          onClick={() => requestWsReconnect()}
          className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-900"
        >
          Reconnect WS
        </button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800/80 pb-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Concert observer</h1>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-zinc-500">
            Remote view: relative band powers, rolling EEG trace, and markers. Stimulus clock appears here when the capture machine streams{" "}
            <span className="font-mono text-zinc-400">stimulus_clock</span> over the bridge.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-zinc-500">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${
              wsStatus === "open"
                ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200/90"
                : "border-zinc-700 bg-zinc-900/50"
            }`}
          >
            <Radio className="h-3 w-3" />
            WS {wsStatus}
          </span>
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {deviceName ?? "—"} · pkts {packetCount.toLocaleString()}
          </span>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle icon={<Clock className="h-4 w-4" />} description="Wall time and stimulus ms from last relay tick">
            Stimulus clock (from stream)
          </CardTitle>
        </CardHeader>
        <CardBody>
          {lastStimulusClock ? (
            <div className="grid gap-3 font-mono text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Wall (bridge)</div>
                <div className="mt-1 text-zinc-200">{new Date(lastStimulusClock.wallMs).toISOString()}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Stimulus ms</div>
                <div className="mt-1 text-2xl tabular-nums text-emerald-200/95">
                  {Math.round(lastStimulusClock.audioPositionMs).toLocaleString()}
                </div>
              </div>
              {lastStimulusClock.detail ? (
                <div className="sm:col-span-2 text-[11px] text-zinc-500">{lastStimulusClock.detail}</div>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-zinc-500">
              No <span className="font-mono text-zinc-400">stimulus_clock</span> received yet. Enable &quot;External
              stimulus clock&quot; on the Stimulus EEG page.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Normalized relative band powers (same store as Research Mode)">
            Band powers
          </CardTitle>
        </CardHeader>
        <CardBody>
          <BandBars mode="relative" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Channel 1 · recent wall-time window">EEG timeline</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <ResearchTimelineStrip height={96} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Research markers (stimulus_clock ticks omitted)">Recent markers</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950/50 p-2 font-mono text-[10px] text-zinc-500">
            {markerEvents.length === 0 ? (
              <span>No markers yet.</span>
            ) : (
              markerEvents.map((e) => (
                <div key={e.id} className="truncate">
                  <span className="text-emerald-600/90">{e.source}</span> ·{" "}
                  {new Date(e.wallMs).toISOString()} · <span className="text-zinc-300">{e.label}</span>
                  {typeof e.audioPositionMs === "number" ? (
                    <span className="text-zinc-500"> · audio {e.audioPositionMs.toFixed(0)} ms</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
