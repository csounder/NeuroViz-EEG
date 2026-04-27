"use client";

import * as React from "react";
import { HardDrive } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

export function ResearchOfflineErpWorkflow() {
  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<HardDrive className="h-4 w-4" />}
          description="Honest ERP-adjacent path: explore in NeuroVis, then epoch and analyze in MNE / EEGLAB / your own code on exported files. Not for clinical inference."
        >
          Offline ERP-style workflow
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[11px] leading-relaxed text-zinc-400">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Role</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <FileRow
                file="…eegstream.csv"
                detail="Rolling UI-rate timeline: wall_ms, wall_iso, 4ch µV, bands, padded ppg_1..4 and fnirs_1..6 snapshots when the bridge forwards optical data (Athena). Pairs with events.csv and provenance.json."
              />
              <FileRow
                file="…events.csv"
                detail="Marker log: wall_ms, label, source (keyboard, http, osc, …). Align to eegstream wall_ms for exploratory windows — not jitter-corrected to stim hardware."
              />
              <FileRow
                file="…provenance.json"
                detail="Session + impedance_log (optional manual OpenBCI notes), trace source, estimated Hz, BIDS entities, analysis_scope. Pairs with channels.tsv / eeg.json from the same export."
              />
              <FileRow
                file="*.eeg.csv (recorder)"
                detail="Full-rate (in-browser) capture: t_ms from record start, wall_ms column, channels + artifact flag. Manifest records recording_anchor_wall_ms, DSP snapshot, annotations."
              />
              <FileRow
                file="*.bands.csv (recorder)"
                detail="Band-power rows at dashboard rate with IMU/PPG and fnirs_1..6 columns (optical forwarded at band tick — same session clock as EEG bundle). manifest.json lists BIDS stub filenames."
              />
              <FileRow
                file="*.annotations.csv"
                detail="Recorder markers with t_ms and wall_time_iso; use for epoching in offline tools."
              />
              <FileRow
                file="*.epochs_summary.json"
                detail="Optional coarse per-event stats from recorder export — not a substitute for trial-level ERP QC offline."
              />
              <FileRow
                file="*.channels.tsv"
                detail="BIDS-EEG–style channel table: name, type, units, sampling_frequency per row. Maps exported EEG column names to human-readable sites (device-dependent)."
              />
              <FileRow
                file="*.eeg.json"
                detail="Minimal BIDS-EEG sidecar stub (TaskName, SamplingFrequency, EEGChannelCount, references note). Complete BIDS layout (participants, scans, etc.) is still your responsibility."
              />
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-rose-900/35 bg-rose-950/15 p-3 text-[11px] text-zinc-400">
          <span className="font-medium text-rose-200/90">Not clinical. </span>
          Exploratory research and demos only. Consumer montage, dry electrodes, and browser/bridge timing do not support
          diagnostic claims, source imaging, or publication-grade ERP without offline validation and preregistered
          pipelines.
        </div>

        <p className="text-zinc-500">
          <span className="text-zinc-400">Typical offline steps: </span>
          ingest CSV → parse wall_ms (or anchor + t_ms) → epoch on events → baseline reject (amplitude, ICA if montage
          allows) → report software versions matching provenance.
        </p>
      </CardBody>
    </Card>
  );
}

function FileRow({ file, detail }: { file: string; detail: string }) {
  return (
    <tr className="border-b border-zinc-800/80 align-top last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-emerald-200/90">{file}</td>
      <td className="px-3 py-2 text-zinc-400">{detail}</td>
    </tr>
  );
}
