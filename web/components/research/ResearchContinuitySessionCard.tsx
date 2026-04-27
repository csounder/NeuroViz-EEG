"use client";

import * as React from "react";
import { Timer } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { recorder } from "@/lib/recorder";
import type { ResearchDeviceProfile } from "@/lib/researchDeviceProfile";

export function ResearchContinuitySessionCard({
  profile,
  live,
  lastPacketAgeMs,
  packetCount,
  estimatedEegHz,
}: {
  profile: ResearchDeviceProfile;
  live: boolean;
  lastPacketAgeMs: number | null;
  packetCount: number;
  estimatedEegHz: number | null;
}) {
  const [recElapsedSec, setRecElapsedSec] = React.useState(0);
  const [recording, setRecording] = React.useState(false);

  React.useEffect(() => {
    const off = recorder.subscribe((s) => {
      setRecording(s.recording);
      setRecElapsedSec(Math.round(s.elapsedMs / 1000));
    });
    return off;
  }, []);

  const prevRef = React.useRef({ pc: packetCount, t: Date.now() });
  const [instantHz, setInstantHz] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!live) {
      setInstantHz(null);
      return;
    }
    const now = Date.now();
    const dt = (now - prevRef.current.t) / 1000;
    const dpc = packetCount - prevRef.current.pc;
    if (dt > 0.25 && dpc >= 0 && prevRef.current.pc > 0) {
      setInstantHz(dpc / dt);
    }
    prevRef.current = { pc: packetCount, t: now };
  }, [live, packetCount, lastPacketAgeMs]);

  const stall =
    live && lastPacketAgeMs != null && lastPacketAgeMs > 2500
      ? `No EEG packet for ~${Math.round(lastPacketAgeMs)} ms — possible disconnect or stall.`
      : null;

  const nominal = profile.nominalEegHz;
  const ingestVsNominalPct =
    live && instantHz != null && nominal > 0
      ? Math.round(Math.min(250, Math.max(0, (instantHz / nominal) * 100)))
      : null;
  const lowIngest =
    live &&
    estimatedEegHz != null &&
    estimatedEegHz < nominal * 0.72 &&
    profile.family !== "simulator"
      ? `Observed ~${estimatedEegHz.toFixed(1)} Hz is well below nominal ${nominal} Hz — document throttling or bridge limits.`
      : null;

  const longRec =
    recording && recElapsedSec >= 300
      ? `In-browser capture ~${Math.floor(recElapsedSec / 60)} min — RAM grows with duration; stop and export periodically for serious studies.`
      : null;

  const rollRef = React.useRef<{ t0: number; pc0: number } | null>(null);
  const [rollPct, setRollPct] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!live) {
      rollRef.current = null;
      setRollPct(null);
      return;
    }
    const now = Date.now();
    if (!rollRef.current) {
      rollRef.current = { t0: now, pc0: packetCount };
      return;
    }
    const w = rollRef.current;
    const elapsedSec = (now - w.t0) / 1000;
    if (elapsedSec < 5) return;
    const received = Math.max(0, packetCount - w.pc0);
    const expected = Math.max(1, Math.round(nominal * elapsedSec));
    setRollPct(Math.round((received / expected) * 100));
    rollRef.current = { t0: now, pc0: packetCount };
  }, [live, packetCount, lastPacketAgeMs, nominal]);

  const rollHint =
    live && rollPct != null
      ? rollPct < 68
        ? `Rolling ~5s: ~${rollPct}% of nominal-rate packets (heuristic) — possible gaps or bundled packets; a future bridge counter could refine “expected”.`
        : `Rolling ~5s: ~${rollPct}% of nominal packet estimate (rough; assumes ~1 counter tick ≈ one nominal sample epoch).`
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Timer className="h-4 w-4" />}
          description="Stream continuity and session length: browser capture is not unbounded disk logging. Drop / gap statistics here are heuristics from packet timing; publication-grade block counts would need the Node bridge to expose per-block sample counts or explicit gap flags."
        >
          Continuity &amp; long sessions
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-[11px] leading-relaxed text-zinc-400">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <div className="font-mono text-[10px] uppercase text-zinc-500">Packet counter</div>
            <div className="font-mono text-sm text-zinc-200">{packetCount}</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <div className="font-mono text-[10px] uppercase text-zinc-500">Short-term ingest (approx.)</div>
            <div className="font-mono text-sm text-zinc-200">
              {instantHz != null && live ? `${instantHz.toFixed(1)} Hz` : "—"}
              {live && instantHz != null && instantHz < nominal * 0.65 ? (
                <span className="ml-1 text-amber-400">low</span>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <div className="font-mono text-[10px] uppercase text-zinc-500">Vs nominal Fs (rough)</div>
            <div className="font-mono text-sm text-zinc-200">
              {ingestVsNominalPct != null ? (
                <>
                  ~{ingestVsNominalPct}% of {nominal} Hz
                  {ingestVsNominalPct < 72 ? <span className="ml-1 text-amber-400">gap risk</span> : null}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>
        <p className="rounded-md border border-zinc-800/80 bg-zinc-950/40 px-2 py-1.5 text-[10px] text-zinc-500">
          Counter + last-packet age show liveness, not <span className="text-zinc-400">% loss</span> or segment
          boundaries. For field logs, note reconnect times and pair with offline clock checks or a hardware trigger log.
        </p>
        {rollHint ? (
          <div
            className={`rounded-lg border px-3 py-2 text-[11px] ${
              rollPct != null && rollPct < 68
                ? "border-amber-900/40 bg-amber-950/20 text-amber-100/90"
                : "border-zinc-800 bg-zinc-900/30 text-zinc-400"
            }`}
          >
            {rollHint}
          </div>
        ) : null}

        {stall ? (
          <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-rose-100/90">{stall}</div>
        ) : null}
        {lowIngest ? (
          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-amber-100/90">
            {lowIngest}
          </div>
        ) : null}
        {longRec ? (
          <div className="rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2 text-sky-100/90">{longRec}</div>
        ) : null}

        <ul className="list-inside list-disc space-y-1 text-zinc-500">
          <li>
            For multi-hour protocols, plan <span className="text-zinc-400">segmented exports</span> or a native/server
            recorder; this tab keeps full-rate data in memory until you download.
          </li>
          <li>
            Event markers use software timestamps — report latency and jitter in methods; hardware triggers need offline
            alignment.
          </li>
        </ul>
      </CardBody>
    </Card>
  );
}
