/**
 * NeuroVis server-side session recorder: streams EEG + bands to disk with the same
 * CSV column layout as the in-browser recorder (manifest + channels.tsv + eeg.json stub).
 * Survives browser refresh; optional time-based file rollover for long runs.
 */

const fs = require("fs");
const path = require("path");

const BAND_NAMES = ["delta", "theta", "alpha", "beta", "gamma"];
const FNIRS_EXPORT_CH = 6;

const DEFAULT_CH4 = ["TP9", "AF7", "AF8", "TP10"];

function slug(s) {
  const t = String(s || "session").replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 80);
  return t || "session";
}

function normalizeChannelLabels(base, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const raw = base?.[i]?.trim();
    if (raw) out.push(raw);
    else if (n === 4) out.push(DEFAULT_CH4[i] ?? `Ch${i + 1}`);
    else out.push(`Ch${i + 1}`);
  }
  return out;
}

function bandsHeaderLine() {
  const parts = [
    "t_ms",
    ...BAND_NAMES.map((b) => `rel_${b}`),
    ...BAND_NAMES.map((b) => `abs_${b}`),
    "state",
    "accel_x",
    "accel_y",
    "accel_z",
    "gyro_x",
    "gyro_y",
    "gyro_z",
    "ppg",
  ];
  for (let i = 0; i < FNIRS_EXPORT_CH; i++) parts.push(`fnirs_${i + 1}`);
  return parts.join(",");
}

function buildChannelsTsv(channelNames, sf) {
  const lines = ["name\ttype\tunits\tsampling_frequency"];
  for (const name of channelNames) {
    lines.push(`${name}\tEEG\tuV\t${sf}`);
  }
  return lines.join("\n");
}

function buildEegJsonStub(input) {
  return {
    TaskName: input.taskName,
    SamplingFrequency: input.samplingFrequency,
    EEGChannelCount: input.eegChannelCount,
    EEGReference: input.eegReferenceNote,
    SoftwareFilters: input.softwareNote,
    PowerLineFrequency: 60,
    EEGChannelNames: input.channelNames,
    NeuroVisNote:
      "Stub sidecar from NeuroVis server disk session recorder. Pair with channels.tsv.",
  };
}

function csvEscape(s) {
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

let session = null;
let rolloverTimer = null;
let rolloverInProgress = false;

const lastMotion = {
  accel: [0, 0, 0],
  gyro: [0, 0, 0],
  ppg: 0,
  fnirs: Array(FNIRS_EXPORT_CH).fill(0),
};

function setLastMotion(sensorType, values) {
  if (sensorType === "accel" && values?.length >= 3) {
    lastMotion.accel = values.slice(0, 3).map((v) => Number(v) || 0);
  } else if (sensorType === "gyro" && values?.length >= 3) {
    lastMotion.gyro = values.slice(0, 3).map((v) => Number(v) || 0);
  } else if (sensorType === "ppg" && values?.length) {
    lastMotion.ppg = Number(values[0]) || 0;
  } else if (sensorType === "fnirs" && values?.length) {
    for (let i = 0; i < FNIRS_EXPORT_CH; i++) {
      lastMotion.fnirs[i] = Number(values[i]) || 0;
    }
  }
}

function isActive() {
  return session != null;
}

function getStatus() {
  if (!session) {
    return { active: false };
  }
  return {
    active: true,
    dir: session.dir,
    folderName: session.folderName,
    anchorWallMs: session.anchorWallMs,
    elapsedMs: Date.now() - session.anchorWallMs,
    eegCount: session.eegCount,
    bandCount: session.bandCount,
    segmentIndex: session.segmentIndex,
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function openSegmentFiles(sess) {
  const seg = String(sess.segmentIndex).padStart(3, "0");
  const base = path.join(sess.dir, `recording_seg${seg}`);
  sess.eegPath = `${base}.eeg.csv`;
  sess.bandsPath = `${base}.bands.csv`;
  sess.eegStream = fs.createWriteStream(sess.eegPath, { flags: "w" });
  sess.bandsStream = fs.createWriteStream(sess.bandsPath, { flags: "w" });
  sess.eegHeaderWritten = false;
  sess.bandsHeaderWritten = false;
  sess.segmentStartAt = Date.now();
  sess.segmentEegRows = 0;
  sess.segmentBandRows = 0;
}

function closeSegmentStreams(sess) {
  return new Promise((resolve) => {
    let n = 0;
    const done = () => {
      n++;
      if (n >= 2) resolve();
    };
    if (sess.eegStream) {
      sess.eegStream.end(done);
      sess.eegStream = null;
    } else done();
    if (sess.bandsStream) {
      sess.bandsStream.end(done);
      sess.bandsStream = null;
    } else done();
  });
}

function pushSegmentMeta(sess) {
  if (!sess.segments) sess.segments = [];
  const seg = String(sess.segmentIndex).padStart(3, "0");
  sess.segments.push({
    index: sess.segmentIndex,
    eeg_csv: `recording_seg${seg}.eeg.csv`,
    bands_csv: `recording_seg${seg}.bands.csv`,
    started_at: new Date(sess.segmentStartAt).toISOString(),
    ended_at: new Date().toISOString(),
    eeg_rows: sess.segmentEegRows || 0,
    band_rows: sess.segmentBandRows || 0,
  });
}

async function doRolloverIfNeeded() {
  const sess = session;
  if (!sess || !sess.segmentMs || rolloverInProgress) return;
  if (Date.now() - sess.segmentStartAt < sess.segmentMs) return;

  rolloverInProgress = true;
  try {
    await closeSegmentStreams(sess);
    pushSegmentMeta(sess);
    sess.segmentIndex++;
    openSegmentFiles(sess);
  } finally {
    rolloverInProgress = false;
  }
}

function startSession(opts = {}) {
  if (session) {
    throw new Error("session_recording_already_active");
  }
  const baseRoot =
    opts.outRoot ||
    process.env.NEUROVIS_SESSION_OUT ||
    path.join(process.cwd(), "data", "session_recordings");
  const folderName = `${slug(opts.name)}_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const dir = path.join(baseRoot, folderName);
  ensureDir(dir);

  const segmentMinutes = Math.max(0, Number(opts.segmentMinutes) || 0);
  const segmentMs = segmentMinutes > 0 ? segmentMinutes * 60 * 1000 : 0;

  session = {
    dir,
    folderName,
    name: opts.name || "session",
    anchorWallMs: Date.now(),
    segmentMs,
    segmentIndex: 0,
    segments: [],
    device: opts.device || "UNKNOWN",
    source: opts.source === "simulator" ? "simulator" : "device",
    sampleRate: Math.round(Number(opts.sampleRate) || 256),
    eegChannelLabels: Array.isArray(opts.channels) ? opts.channels : [...DEFAULT_CH4],
    eegCount: 0,
    bandCount: 0,
    annotations: [],
    eegTraceSource: opts.eegTraceSource || "server_dsp",
  };

  openSegmentFiles(session);

  if (segmentMs) {
    rolloverTimer = setInterval(() => {
      void doRolloverIfNeeded();
    }, 1000);
  }

  return { dir, folderName, sessionId: folderName };
}

function appendEeg(timestamp, processed, artifact = 0) {
  const sess = session;
  if (!sess || !sess.eegStream || rolloverInProgress) return;

  const wallMs = Math.round(Number(timestamp) || Date.now());
  const tMs = wallMs - sess.anchorWallMs;
  const ch = (processed || []).map((v) => Number(v) || 0);
  if (ch.length === 0) return;

  if (!sess.eegHeaderWritten) {
    sess.eegChannelLabels = normalizeChannelLabels(sess.eegChannelLabels, ch.length);
    const labels = sess.eegChannelLabels;
    const header = ["t_ms", "wall_ms", ...labels.map((_, i) => `eeg_${i + 1}`), "artifact"].join(
      ",",
    );
    sess.eegStream.write(header + "\n");
    sess.eegHeaderWritten = true;
  }

  const parts = [tMs.toFixed(2), String(wallMs), ...ch.map((v) => v.toFixed(3)), String(artifact | 0)];
  sess.eegStream.write(parts.join(",") + "\n");
  sess.eegCount++;
  sess.segmentEegRows++;
}

function appendBands(nowWall, absolute, relative) {
  const sess = session;
  if (!sess || !sess.bandsStream || rolloverInProgress) return;

  const wallMs = Math.round(nowWall);
  const tMs = wallMs - sess.anchorWallMs;

  if (!sess.bandsHeaderWritten) {
    sess.bandsStream.write(bandsHeaderLine() + "\n");
    sess.bandsHeaderWritten = true;
  }

  const rel = BAND_NAMES.map((b) => (Number(relative?.[b]) || 0).toFixed(4));
  const abs = BAND_NAMES.map((b) => (Number(absolute?.[b]) || 0).toFixed(4));
  const m = lastMotion;
  const row = [
    tMs.toFixed(2),
    ...rel,
    ...abs,
    "neutral",
    m.accel[0].toFixed(3),
    m.accel[1].toFixed(3),
    m.accel[2].toFixed(3),
    m.gyro[0].toFixed(3),
    m.gyro[1].toFixed(3),
    m.gyro[2].toFixed(3),
    m.ppg.toFixed(3),
    ...m.fnirs.map((v) => Number(v).toFixed(5)),
  ];
  sess.bandsStream.write(row.join(",") + "\n");
  sess.bandCount++;
  sess.segmentBandRows++;
}

function addAnnotation(label, detail) {
  const sess = session;
  if (!sess) return;
  const wallMs = Date.now();
  const tMs = wallMs - sess.anchorWallMs;
  sess.annotations.push({
    t_ms: tMs,
    wall_time_iso: new Date(wallMs).toISOString(),
    label: String(label).slice(0, 240),
    detail: detail != null ? String(detail).slice(0, 600) : undefined,
  });
}

async function stopSession() {
  if (!session) return null;
  if (rolloverTimer) {
    clearInterval(rolloverTimer);
    rolloverTimer = null;
  }
  while (rolloverInProgress) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const sess = session;
  session = null;

  await closeSegmentStreams(sess);
  pushSegmentMeta(sess);

  const safe = slug(sess.name);
  const channelNames = sess.eegChannelLabels?.length
    ? sess.eegChannelLabels
    : [...DEFAULT_CH4];
  const startedIso = new Date(sess.anchorWallMs).toISOString();
  const durationMs = Date.now() - sess.anchorWallMs;
  const sessionBids = startedIso.slice(0, 10).replace(/-/g, "");
  const taskName = safe.slice(0, 64) || "session";

  const eegHeaderCols = ["t_ms", "wall_ms", ...channelNames.map((_, i) => `eeg_${i + 1}`), "artifact"];
  const bandsHeaderCols = bandsHeaderLine().split(",");

  const manifest = {
    id: `srv_${sess.folderName}`,
    name: sess.name,
    started_at: startedIso,
    duration_ms: durationMs,
    sample_rate: sess.sampleRate,
    device: sess.device,
    source: sess.source,
    eeg_samples: sess.eegCount,
    band_samples: sess.bandCount,
    channels: channelNames,
    band_names: [...BAND_NAMES],
    annotations: sess.annotations.map((a) => ({ ...a })),
    eeg_trace_source: sess.eegTraceSource,
    estimated_eeg_hz: sess.sampleRate,
    recording_anchor_wall_ms: sess.anchorWallMs,
    provenance: {
      export_schema: "neurovis-research-v1",
      neurovis_web: "0.1.0",
      recorder: "neurovis-server-disk-v1",
      disk_session_dir: sess.dir,
      disk_segments: sess.segments,
      bids_entities: {
        subject: "NEUROVIS",
        session: sessionBids,
        task: taskName,
      },
      bids_sidecar_files: ["channels.tsv", "eeg.json"],
      bids_sidecar_note:
        "Server disk recorder; EEG/bands CSV columns match in-browser session recorder. Segmented runs use recording_segNNN.* files.",
      eeg_ui_channel_count: channelNames.length,
      analysis_scope: {
        intent: "erp_adjacent_exploratory",
        clinical_use: false,
        notes: [
          "Recorded on Node bridge; wall_ms and recording_anchor_wall_ms align with browser exports.",
          "Stimulus block (manifest.stimulus) is not written by the server; merge from browser or external logs if needed.",
        ],
      },
    },
    schema: {
      eeg_csv: eegHeaderCols,
      bands_csv: bandsHeaderCols,
      annotations_csv: ["t_ms", "wall_time_iso", "label", "detail"],
      epochs_json: "epochs_summary.json",
      channels_tsv: "channels.tsv",
      eeg_json: "eeg.json",
      t_unit: "ms",
    },
  };

  fs.writeFileSync(path.join(sess.dir, `${safe}.manifest.json`), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(sess.dir, `${safe}.channels.tsv`),
    buildChannelsTsv(channelNames, sess.sampleRate),
  );
  fs.writeFileSync(
    path.join(sess.dir, `${safe}.eeg.json`),
    JSON.stringify(
      buildEegJsonStub({
        taskName,
        samplingFrequency: sess.sampleRate,
        eegChannelCount: channelNames.length,
        channelNames: [...channelNames],
        eegReferenceNote: `NeuroVis server disk session; device ${sess.device}; trace ${sess.eegTraceSource}.`,
        softwareNote: "See manifest.json provenance.recorder and disk_segments.",
      }),
      null,
      2,
    ),
  );

  if (sess.annotations.length) {
    const annLines = [
      "t_ms,wall_time_iso,label,detail",
      ...sess.annotations.map(
        (a) =>
          `${a.t_ms.toFixed(2)},${csvEscape(a.wall_time_iso ?? "")},${csvEscape(a.label)},${csvEscape(a.detail ?? "")}`,
      ),
    ];
    fs.writeFileSync(path.join(sess.dir, `${safe}.annotations.csv`), annLines.join("\n"));
  }

  return { manifest, dir: sess.dir, folderName: sess.folderName };
}

module.exports = {
  isActive,
  getStatus,
  startSession,
  appendEeg,
  appendBands,
  addAnnotation,
  stopSession,
  setLastMotion,
  BAND_NAMES,
  FNIRS_EXPORT_CH,
};
