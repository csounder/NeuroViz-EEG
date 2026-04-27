"use client";

import * as React from "react";
import { BookmarkPlus, Circle, Square } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  recorder,
  downloadRecordingFiles,
  type Annotation,
  type RecorderStatus,
} from "@/lib/recorder";
import { getRecorderEegLayout, inferResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { useNeuroStore } from "@/lib/store";

export function ResearchCapturePanel() {
  const deviceName = useNeuroStore((s) => s.deviceName);
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const settings = useNeuroStore((s) => s.settings);
  const clientSimRunning = useNeuroStore((s) => s.clientSim.running);
  const eegTraceSource = useNeuroStore((s) => s.eegTraceSource);
  const estimatedEegHz = useNeuroStore((s) => s.estimatedEegHz);
  const [status, setStatus] = React.useState<RecorderStatus>(recorder.status());
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("stimulus_on");
  const [epochPre, setEpochPre] = React.useState(2000);
  const [epochPost, setEpochPost] = React.useState(2000);
  const [liveAnnotations, setLiveAnnotations] = React.useState<Annotation[]>([]);

  React.useEffect(() => recorder.subscribe(setStatus), []);

  React.useEffect(() => {
    if (!status.recording) {
      setLiveAnnotations([]);
      return;
    }
    const id = window.setInterval(() => {
      setLiveAnnotations(recorder.getLiveAnnotations());
    }, 400);
    return () => window.clearInterval(id);
  }, [status.recording]);

  const logResearchEvent = useNeuroStore((s) => s.logResearchEvent);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyM" && !e.repeat) {
        e.preventDefault();
        const lab = label.trim() || "marker";
        logResearchEvent(lab, "keyboard", "hotkey M");
        if (recorder.status().recording) {
          recorder.addAnnotation(lab, "hotkey M");
          setLiveAnnotations(recorder.getLiveAnnotations());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [label, logResearchEvent]);

  const recProfile = React.useMemo(
    () =>
      inferResearchDeviceProfile({
        deviceName,
        eegDeviceName: latestEEG?.deviceName,
        settingsSimulator: Boolean(settings.simulatorMode),
        clientSimRunning,
      }),
    [deviceName, latestEEG?.deviceName, settings.simulatorMode, clientSimRunning],
  );

  const eegLayout = React.useMemo(() => getRecorderEegLayout(recProfile), [recProfile]);

  const startCapture = () => {
    const hz = estimatedEegHz ?? 256;
    recorder.start({
      name: name.trim() || undefined,
      source: clientSimRunning ? "simulator" : "device",
      device: deviceName ?? (clientSimRunning ? "CLIENT SIM" : "UNKNOWN"),
      sampleRate: Math.round(hz),
      eegTraceSource,
      estimatedEegHz: hz,
      eegChannelCount: eegLayout.count,
      channelLabels: eegLayout.labels,
    });
  };

  const stopAndExport = () => {
    const rec = recorder.stop();
    if (rec) {
      setTimeout(() => downloadRecordingFiles(rec, { preMs: epochPre, postMs: epochPost }), 200);
    }
  };

  const addMarker = () => {
    const lab = label.trim() || `event_${liveAnnotations.length + 1}`;
    logResearchEvent(lab, "marker", status.recording ? "also in recorder" : "recorder idle");
    if (!status.recording) return;
    recorder.addAnnotation(lab);
    setLiveAnnotations(recorder.getLiveAnnotations());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<BookmarkPlus className="h-4 w-4" />}
          description="Time-anchored event markers (wall-clock + recording-relative t_ms) and a multi-file export: manifest, EEG/bands CSV, BIDS-style channels.tsv + eeg.json stubs, annotations, epochs_summary.json."
        >
          Research capture &amp; export
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="rounded-lg border border-amber-900/45 bg-amber-950/25 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
          <span className="font-medium text-amber-200/95">Long blocks (≈10–30+ min): </span>
          full-rate data stays in tab memory until export. For Ganglion-style lab runs, stop and download periodically, or
          use a native/server recorder that spools to disk.
        </div>
        {recProfile.fourChannelUiCeiling ? (
          <p className="text-[10px] leading-relaxed text-zinc-500">
            Cyton/Daisy: recorder CSV uses <span className="font-mono text-zinc-400">{eegLayout.count}</span> EEG columns (
            <span className="font-mono text-zinc-400">{eegLayout.labels.join(", ")}</span>). Research metrics above still
            emphasize the first four columns unless you extend analysis offline.
          </p>
        ) : null}

        <p className="text-[11px] leading-relaxed text-zinc-500">
          Start capture to stream EEG + bands into the session recorder. Add markers during tasks (button or{" "}
          <kbd className="rounded border border-zinc-700 bg-zinc-950 px-1 font-mono text-zinc-300">M</kbd>).
          Stop to download files (bundle includes BIDS-style <strong className="text-zinc-400">channels.tsv</strong> and{" "}
          <strong className="text-zinc-400">eeg.json</strong> stubs).{" "}
          <strong className="text-zinc-400">epochs_summary.json</strong> summarizes each marker window (mean EEG per
          channel + mean band powers) for quick QC before offline ERP analysis.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] text-zinc-400">
            Session name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={status.recording}
              placeholder="optional"
              className="mt-0.5 block w-48 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Marker label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-0.5 block w-44 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Epoch pre (ms)
            <input
              type="number"
              min={0}
              step={100}
              value={epochPre}
              onChange={(e) => setEpochPre(Number(e.target.value))}
              className="mt-0.5 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Epoch post (ms)
            <input
              type="number"
              min={0}
              step={100}
              value={epochPost}
              onChange={(e) => setEpochPost(Number(e.target.value))}
              className="mt-0.5 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!status.recording ? (
            <button
              type="button"
              onClick={startCapture}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50"
            >
              <Circle className="h-3.5 w-3.5" />
              Start research capture
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={addMarker}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Drop marker
              </button>
              <button
                type="button"
                onClick={stopAndExport}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/30 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-900/40"
              >
                <Square className="h-3.5 w-3.5" />
                Stop &amp; export bundle
              </button>
            </>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 font-mono text-[10px] text-zinc-500">
          {status.recording ? (
            <>
              Recording · {Math.round(status.elapsedMs / 1000)}s · EEG samples {status.eegSamples} · band ticks{" "}
              {status.bandSamples} · markers {status.annotationCount}
              {estimatedEegHz != null ? ` · ~${estimatedEegHz} Hz est.` : ""}
            </>
          ) : (
            <>Idle · estimated stream rate {estimatedEegHz != null ? `~${estimatedEegHz} Hz` : "—"} · trace {eegTraceSource}</>
          )}
        </div>

        {liveAnnotations.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Markers (live)</div>
            <ul className="space-y-1 font-mono text-[10px] text-zinc-400">
              {liveAnnotations.map((a, i) => (
                <li key={`${a.t_ms}-${i}`}>
                  <span className="text-emerald-500/90">t+{a.t_ms.toFixed(0)}ms</span> · {a.wall_time_iso ?? "—"} ·{" "}
                  <span className="text-zinc-200">{a.label}</span>
                  {a.detail ? <span className="text-zinc-600"> · {a.detail}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
