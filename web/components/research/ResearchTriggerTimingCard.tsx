"use client";

import { Clock } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

/**
 * Methods-oriented note: software markers (HTTP, OSC, keyboard) are not hardware triggers.
 * Typical Ganglion / classroom ERP workflows should plan offline alignment.
 */
export function ResearchTriggerTimingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Clock className="h-4 w-4" />}
          description="Event markers in NeuroVis use client wall time — fine for exploratory epochs, not jitter-free ERP without offline sync."
        >
          Markers, triggers &amp; latency
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[11px] leading-relaxed text-zinc-400">
        <p>
          Use <span className="text-zinc-300">Research Event Lab</span> (HTTP proxy, OSC, hotkeys) and the rolling{" "}
          <span className="text-zinc-300">events.csv</span> export. Treat marker <span className="font-mono text-zinc-500">wall_ms</span>{" "}
          as <span className="text-zinc-300">software time</span>: browser scheduling, Wi‑Fi, bridge buffering, and UDP OSC
          jitter are not corrected to your stim computer or ADC clock.
        </p>
        <p>
          For publication ERP: log a parallel hardware trigger or photodiode stream, or use acquisition software with
          sample-accurate markers; align offline (cross-correlation, shared clock, or known cable delay).
        </p>

        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/50">
          <table className="w-full min-w-[520px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Typical concern</th>
                <th className="px-3 py-2">Mitigation</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <Row
                source="Keyboard / UI hotkey"
                concern="Input focus, OS scheduling, tens of ms jitter"
                mitigation="Prefer HTTP/OSC from stim script; log both marker and condition code"
              />
              <Row
                source="HTTP POST /api/research-event"
                concern="Network RTT, proxy, tab throttling if laptop sleeps"
                mitigation="Same subnet; measure round-trip once; document in methods"
              />
              <Row
                source="OSC (Mind Monitor / custom)"
                concern="UDP delivery, Wi‑Fi, bursty packets"
                mitigation="Wired LAN where possible; compare packet timestamps to EEG wall_ms offline"
              />
              <Row
                source="WebSocket EEG path"
                concern="Bridge decimation, browser back-pressure vs nominal Fs"
                mitigation="Continuity card + observed Hz; cross-check raw file length offline"
              />
              <Row
                source="OpenBCI Ganglion + browser"
                concern="No IMU-assisted QC; motion is on-scalp only"
                mitigation="Impedance + artifact QC; external triggers for critical timing"
              />
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function Row({ source, concern, mitigation }: { source: string; concern: string; mitigation: string }) {
  return (
    <tr className="border-b border-zinc-800/70 align-top last:border-b-0">
      <td className="px-3 py-2 font-mono text-[10px] text-emerald-200/85">{source}</td>
      <td className="px-3 py-2">{concern}</td>
      <td className="px-3 py-2 text-zinc-500">{mitigation}</td>
    </tr>
  );
}
