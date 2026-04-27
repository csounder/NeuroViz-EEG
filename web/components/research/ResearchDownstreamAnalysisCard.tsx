"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { BAND_NAMES } from "@/lib/types";

const TOOLS: { href: string; label: string; note: string }[] = [
  {
    href: "https://mne.tools/stable/index.html",
    label: "MNE-Python",
    note: "Python EEG/MEG: read CSV → RawArray, epoch, ICA, stats; strong BIDS support.",
  },
  {
    href: "https://eeglab.org/",
    label: "EEGLAB",
    note: "MATLAB toolbox: event-based epoching, ICA, time–frequency; large plugin ecosystem.",
  },
  {
    href: "https://bids.neuroimaging.io/",
    label: "BIDS",
    note: "Standard dataset layout; NeuroVis exports channels.tsv + eeg.json stubs to pair with CSV.",
  },
  {
    href: "https://www.fieldtriptoolbox.org/",
    label: "FieldTrip",
    note: "MATLAB: advanced analysis and stats; import from common formats after CSV→MAT conversion if needed.",
  },
  {
    href: "https://neuroimage.usc.edu/brainstorm/",
    label: "Brainstorm",
    note: "MATLAB GUI: clinical/research pipelines; import custom time series with event files.",
  },
];

function ColumnTable({
  title,
  rows,
}: {
  title: string;
  rows: { col: string; meaning: string; importAs: string }[];
}) {
  return (
    <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50">
      <div className="border-b border-zinc-800/80 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-zinc-800/80 text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="whitespace-nowrap px-3 py-2 font-medium">Column</th>
              <th className="px-3 py-2 font-medium">Meaning</th>
              <th className="px-3 py-2 font-medium">Import as</th>
            </tr>
          </thead>
          <tbody className="text-zinc-400">
            {rows.map((r) => (
              <tr key={r.col} className="border-b border-zinc-800/60 align-top last:border-b-0">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-emerald-200/85">{r.col}</td>
                <td className="px-3 py-2">{r.meaning}</td>
                <td className="px-3 py-2 text-zinc-500">{r.importAs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResearchDownstreamAnalysisCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<BookOpen className="h-4 w-4" />}
          description="NeuroVis captures and exports tabular data; publication-grade epoching, ICA, and inference belong in offline tools. Use this page as a schema cheat sheet — not a substitute for lab SOPs or preregistration."
        >
          Downstream analysis
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-6">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Vetted external tools
          </h3>
          <ul className="space-y-2 text-[11px] leading-relaxed text-zinc-400">
            {TOOLS.map((t) => (
              <li key={t.href} className="flex gap-2">
                <a
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-sky-400/95 underline-offset-2 hover:underline"
                >
                  {t.label}
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                </a>
                <span className="text-zinc-500">— {t.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            In-app capture (links)
          </h3>
          <ul className="list-inside list-disc text-[11px] text-zinc-400">
            <li>
              <Link href="/research#research-capture" className="text-sky-400/95 underline-offset-2 hover:underline">
                Research capture &amp; Event Lab
              </Link>
              — browser session recorder + rolling timeline export.
            </li>
            <li>
              <Link href="/recordings" className="text-sky-400/95 underline-offset-2 hover:underline">
                Server disk recordings
              </Link>
              — same CSV shapes as the in-browser recorder, written by the Node bridge (survives tab close).
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            CSV columns → import mapping (one-pager)
          </h3>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Times: <span className="font-mono text-zinc-400">t_ms</span> is milliseconds from the recording start (full-rate
            recorder + disk session). <span className="font-mono text-zinc-400">wall_ms</span> is Unix epoch ms — use to align
            markers, HTTP/OSC events, and stimulus clocks. Rolling <span className="font-mono text-zinc-400">eegstream.csv</span>{" "}
            is UI-rate samples keyed by <span className="font-mono text-zinc-400">wall_ms</span> only (no{" "}
            <span className="font-mono text-zinc-400">t_ms</span>).
          </p>

          <ColumnTable
            title="Research rolling export · eegstream.csv (one row per timeline sample)"
            rows={[
              {
                col: "wall_ms",
                meaning: "Unix ms when the sample entered the research timeline.",
                importAs: "Primary time axis for merge with events.csv; convert to seconds if needed.",
              },
              {
                col: "wall_iso",
                meaning: "ISO 8601 string for the same instant.",
                importAs: "Human-readable audit; prefer wall_ms for joins.",
              },
              {
                col: "eeg_tp9, eeg_af7, eeg_af8, eeg_tp10",
                meaning: "Four-channel µV snapshot at that wall time (Muse-style names in the header).",
                importAs: "EEG channels 0–3; map to channels.tsv / your montage labels.",
              },
              {
                col: `rel_* (${BAND_NAMES.join(", ")})`,
                meaning: "Relative band power 0–1 at dashboard rate (same row as EEG).",
                importAs: "Feature columns; not a substitute for PSD recomputed from full-rate raw.",
              },
              {
                col: `abs_* (${BAND_NAMES.join(", ")})`,
                meaning: "Absolute band power (log-scale as produced by the pipeline).",
                importAs: "Features / covariates; confirm scaling in provenance.json.",
              },
              {
                col: "ppg_1..4, fnirs_1..6",
                meaning: "Last optical vectors seen at that row (bridge-dependent; often empty).",
                importAs: "Physiology covariates; document vendor order in lab notes.",
              },
            ]}
          />

          <ColumnTable
            title="Research rolling export · events.csv"
            rows={[
              {
                col: "wall_ms, wall_iso",
                meaning: "When the marker was logged.",
                importAs: "Epoch triggers; align to eegstream or full-rate EEG via wall_ms.",
              },
              { col: "id", meaning: "Stable event id in the session.", importAs: "Primary key within file." },
              { col: "label, source, detail", meaning: "Marker text and origin (keyboard, http, osc, …).", importAs: "Condition / annotation columns." },
              {
                col: "audio_position_ms",
                meaning: "Stimulus timeline position when present.",
                importAs: "Stimulus-locked analysis; may be empty for non-stimulus markers.",
              },
            ]}
          />

          <ColumnTable
            title="Session recorder & disk session · *.eeg.csv (full EEG rate)"
            rows={[
              {
                col: "t_ms",
                meaning: "Milliseconds since recording start (continuous).",
                importAs: "Construct uniform time array: t_s = t_ms / 1000.",
              },
              {
                col: "wall_ms",
                meaning: "Unix ms for each sample (when available).",
                importAs: "Merge with external logs; verify monotonicity.",
              },
              {
                col: "eeg_1 … eeg_N",
                meaning: "µV per channel (N = 4 Muse default, up to 16 Cyton-class).",
                importAs: "Raw data matrix columns; names in manifest / channels.tsv.",
              },
              {
                col: "artifact",
                meaning: "0/1 non-destructive artifact flag from the active trace pipeline.",
                importAs: "Mask or covariate; re-run your own rejection offline.",
              },
            ]}
          />

          <ColumnTable
            title="Session recorder & disk session · *.bands.csv (~10 Hz)"
            rows={[
              {
                col: "t_ms",
                meaning: "Ms since recording start at band-power tick.",
                importAs: "Downsampled axis; interpolate or nearest-neighbour to EEG if needed.",
              },
              {
                col: "rel_delta … rel_gamma",
                meaning: "Five relative band powers (0–1) at each band tick.",
                importAs: "Features; Welch edges follow bridge bandEdgePreset — see manifest / settings.",
              },
              {
                col: "abs_delta … abs_gamma",
                meaning: "Five absolute band powers (server pipeline scaling).",
                importAs: "Features; confirm log vs linear in export provenance.",
              },
              {
                col: "state",
                meaning: "Browser-classified brain state label at tick.",
                importAs: "Ordinal / categorical covariate (not ground truth).",
              },
              {
                col: "accel_*, gyro_*",
                meaning: "Motion snapshot at band tick (µV-scaled path may differ on disk).",
                importAs: "Movement regressors / QC.",
              },
              {
                col: "ppg",
                meaning: "Scalar motion snapshot from server disk path (first PPG component when present).",
                importAs: "Pulse proxy; see bridge docs for live triple in browser bands row.",
              },
              {
                col: "fnirs_1..6",
                meaning: "Optical channel placeholders when forwarded.",
                importAs: "Athena / lab-specific mapping.",
              },
            ]}
          />

          <ColumnTable
            title="Session recorder · annotations.csv"
            rows={[
              {
                col: "t_ms",
                meaning: "Ms since recording start.",
                importAs: "Align to *.eeg.csv t_ms.",
              },
              {
                col: "wall_time_iso",
                meaning: "ISO timestamp string.",
                importAs: "Cross-check with wall_ms in EEG rows if present.",
              },
              { col: "label, detail", meaning: "User or API marker text.", importAs: "Epoch labels." },
            ]}
          />
        </div>

        <p className="text-[10px] leading-relaxed text-zinc-600">
          Companion files: <span className="font-mono text-zinc-500">channels.tsv</span>,{" "}
          <span className="font-mono text-zinc-500">eeg.json</span>,{" "}
          <span className="font-mono text-zinc-500">*.manifest.json</span>, and{" "}
          <span className="font-mono text-zinc-500">provenance.json</span> document sampling rate, channel names, and export
          context — cite them in methods alongside software versions.
        </p>
      </CardBody>
    </Card>
  );
}
