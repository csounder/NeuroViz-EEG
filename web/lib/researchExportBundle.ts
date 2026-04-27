import { BAND_NAMES } from "./types";
import type { ResearchEventLog, ResearchStreamSample } from "./researchTypes";
import { buildChannelsTsv, buildEegJsonBidsStub } from "./researchBidsSidecars";

export type ResearchExportMeta = {
  deviceName: string | null;
  eegTraceSource: string;
  estimatedEegHz: number | null;
  software: string;
  sessionNote?: string;
  /** Manual impedance log (OpenBCI / lab notebook); not streamed live in NeuroVis today. */
  impedanceLog?: string;
  /** BIDS-inspired: YYYYMMDD */
  sessionDate: string;
  /** Matches eegstream column semantics (TP9… or Ch1…). */
  channelLabels?: [string, string, string, string];
  /** Override nominal Fs in BIDS sidecars when known from device profile. */
  nominalEegHz?: number;
};

const ROLLING_PPG_COLS = 4;
const ROLLING_FNIRS_COLS = 6;

function padOpticalCols(values: number[] | null | undefined, n: number): string[] {
  const v = values ?? [];
  return Array.from({ length: n }, (_, i) => {
    const x = v[i];
    return Number.isFinite(x) ? String(x) : "";
  });
}

function iso(d: number) {
  return new Date(d).toISOString();
}

function bidsBase(meta: ResearchExportMeta, task: string) {
  const sub = "NEUROVIS";
  const ses = meta.sessionDate;
  return `${sub}_ses-${ses}_task-${task}_`;
}

function downloadText(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Export last N minutes of the in-browser research stream + event log (matches what Research UI accumulates).
 */
export function downloadResearchRollingExport(
  timeline: ResearchStreamSample[],
  events: ResearchEventLog[],
  meta: ResearchExportMeta,
  lastMinutes: number,
) {
  const tCut = Date.now() - lastMinutes * 60_000;
  const tl = timeline.filter((s) => s.wallMs >= tCut);
  const ev = events.filter((e) => e.wallMs >= tCut);

  const task = "livestream";
  const base = bidsBase(meta, task);

  const header = [
    "wall_ms",
    "wall_iso",
    "eeg_tp9",
    "eeg_af7",
    "eeg_af8",
    "eeg_tp10",
    ...BAND_NAMES.map((b) => `rel_${b}`),
    ...BAND_NAMES.map((b) => `abs_${b}`),
    ...Array.from({ length: ROLLING_PPG_COLS }, (_, i) => `ppg_${i + 1}`),
    ...Array.from({ length: ROLLING_FNIRS_COLS }, (_, i) => `fnirs_${i + 1}`),
  ];
  const lines: string[] = [header.join(",")];
  for (const s of tl) {
    const rel = BAND_NAMES.map((b) =>
      s.bandsRel && Number.isFinite(s.bandsRel[b]) ? String(s.bandsRel[b]) : "",
    );
    const abs = BAND_NAMES.map((b) =>
      s.bandsAbs && Number.isFinite(s.bandsAbs[b]) ? String(s.bandsAbs[b]) : "",
    );
    const ppgCols = padOpticalCols(s.ppg, ROLLING_PPG_COLS);
    const fnCols = padOpticalCols(s.fnirs, ROLLING_FNIRS_COLS);
    lines.push(
      [
        s.wallMs,
        iso(s.wallMs),
        s.eeg[0],
        s.eeg[1],
        s.eeg[2],
        s.eeg[3],
        ...rel,
        ...abs,
        ...ppgCols,
        ...fnCols,
      ].join(","),
    );
  }

  const evLines = [
    ["wall_ms", "wall_iso", "id", "label", "source", "detail"].join(","),
    ...ev.map((e) =>
      [e.wallMs, iso(e.wallMs), e.id, escapeCsv(e.label), e.source, escapeCsv(e.detail ?? "")].join(","),
    ),
  ];

  const chLabels = meta.channelLabels ?? (["TP9", "AF7", "AF8", "TP10"] as const);
  const sfReq = Math.round(meta.nominalEegHz ?? meta.estimatedEegHz ?? 256);

  const manifest = {
    schema: "neurovis-research-rolling-v1",
    generated_at: new Date().toISOString(),
    window: { last_minutes: lastMinutes, cutoff_wall_ms: tCut },
    provenance: {
      software: meta.software,
      eeg_trace_source: meta.eegTraceSource,
      estimated_eeg_hz: meta.estimatedEegHz,
      device: meta.deviceName,
      session_note: meta.sessionNote ?? null,
      impedance_log: meta.impedanceLog ?? null,
      bids_entities: { subject: "NEUROVIS", session: meta.sessionDate, task },
      companion_full_rate:
        "Research capture session download: *.eeg.csv includes wall_ms + recording_anchor_wall_ms in manifest for merge with this rolling timeline.",
      analysis_scope: {
        intent: "erp_adjacent_exploratory",
        clinical_use: false,
        notes: [
          "Rolling timeline follows ~WebSocket/UI ingest rate unless noted; not a full high-rate lab ERP pipeline in-browser.",
          "Event wall_ms reflects browser/bridge logging; not hardware-stimulus jitter corrected.",
          "Publication and group inference: use offline tools on these exports with preregistered preprocessing.",
          "ppg_* and fnirs_* columns snapshot last optical vectors at each EEG row (Athena / bridge dependent); empty if modality absent.",
        ],
      },
    },
    streams: {
      timeline_csv: `${base}eegstream.csv`,
      events_csv: `${base}events.csv`,
      channels_tsv: `${base}channels.tsv`,
      eeg_json: `${base}eeg.json`,
    },
    bids_mapping: {
      eegstream_columns_eeg: ["eeg_tp9", "eeg_af7", "eeg_af8", "eeg_tp10"].map((col, i) => ({
        column: col,
        channel_name: chLabels[i],
      })),
      note: "CSV EEG column headers are fixed Muse-style names; channels.tsv maps them to your device labels. Optical columns are vendor-order snapshots.",
    },
    counts: { timeline_rows: tl.length, events: ev.length },
  };

  downloadText(`${base}eegstream.csv`, lines.join("\n"));
  downloadText(`${base}events.csv`, evLines.join("\n"));
  downloadText(`${base}channels.tsv`, buildChannelsTsv([...chLabels], sfReq));
  downloadText(
    `${base}eeg.json`,
    JSON.stringify(
      buildEegJsonBidsStub({
        taskName: task,
        samplingFrequency: sfReq,
        eegChannelCount: 4,
        channelNames: [...chLabels],
        eegReferenceNote: `NeuroVis trace mode ${meta.eegTraceSource}; device ${meta.deviceName ?? "unknown"}; manufacturer reference per hardware docs.`,
        softwareNote: `NeuroVis ${meta.software}; see provenance.json for analysis_scope.`,
      }),
      null,
      2,
    ),
    "application/json",
  );
  downloadText(`${base}provenance.json`, JSON.stringify(manifest, null, 2), "application/json");
}

function escapeCsv(s: string) {
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function defaultSessionDate(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
