"use client";

import * as React from "react";
import { HardDrive, Radio, Square } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

type DiskStatus = {
  active: boolean;
  dir?: string;
  folderName?: string;
  anchorWallMs?: number;
  elapsedMs?: number;
  eegCount?: number;
  bandCount?: number;
  segmentIndex?: number;
};

export function ServerDiskRecordingPanel() {
  const [status, setStatus] = React.useState<DiskStatus>({ active: false });
  const [name, setName] = React.useState("bridge_session");
  const [segmentMinutes, setSegmentMinutes] = React.useState(15);
  const [markerLabel, setMarkerLabel] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [lastResponse, setLastResponse] = React.useState("");

  const refresh = React.useCallback(() => {
    void fetch("/api/session_recording/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setStatus(j as DiskStatus))
      .catch(() => setStatus({ active: false }));
  }, []);

  React.useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const startDisk = async () => {
    setErrorMsg("");
    const r = await fetch("/api/session_recording/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || "session",
        segmentMinutes: segmentMinutes > 0 ? segmentMinutes : 0,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErrorMsg(String((j as { error?: string }).error ?? r.statusText));
    else setLastResponse(`Started: ${(j as { dir?: string }).dir ?? ""}`);
    refresh();
  };

  const stopDisk = async () => {
    setErrorMsg("");
    const r = await fetch("/api/session_recording/stop", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErrorMsg(String((j as { error?: string }).error ?? r.statusText));
    else {
      const dir = (j as { dir?: string }).dir;
      const m = (j as { manifest?: { eeg_samples?: number; band_samples?: number } }).manifest;
      setLastResponse(
        `Stopped. Files on server: ${dir}\n` +
          `eeg_samples=${m?.eeg_samples ?? "?"}, band_samples=${m?.band_samples ?? "?"}`,
      );
    }
    refresh();
  };

  const dropMarker = async () => {
    const lab = markerLabel.trim() || "marker";
    await fetch("/api/session_recording/annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: lab, detail: "server_disk" }),
    });
    refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<HardDrive className="h-4 w-4" />}
          description="Node bridge (server-enhanced.js) streams EEG + bands to disk with the same CSV/manifest shape as the browser recorder. Safe for long runs; set segment rollover (minutes) to split files. Output: NEUROVIS_SESSION_OUT or data/session_recordings/."
        >
          Server disk recording
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${
              status.active
                ? "border-rose-800/60 bg-rose-950/25 text-rose-200/90"
                : "border-zinc-700 bg-zinc-900/50"
            }`}
          >
            <Radio className="h-3 w-3" />
            {status.active ? "RECORDING TO DISK" : "idle"}
          </span>
          {status.active ? (
            <>
              <span>seg {status.segmentIndex ?? 0}</span>
              <span>eeg {status.eegCount?.toLocaleString() ?? "—"}</span>
              <span>bands {status.bandCount?.toLocaleString() ?? "—"}</span>
              <span className="max-w-[20rem] truncate" title={status.dir}>
                {status.dir}
              </span>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] text-zinc-400">
            Session name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={status.active}
              className="mt-0.5 block w-44 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Rollover (min, 0 = one file)
            <input
              type="number"
              min={0}
              max={120}
              step={1}
              value={segmentMinutes}
              onChange={(e) => setSegmentMinutes(Number(e.target.value))}
              disabled={status.active}
              className="mt-0.5 block w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!status.active ? (
            <button
              type="button"
              onClick={() => void startDisk()}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-200"
            >
              <HardDrive className="h-3.5 w-3.5" />
              Start server recording
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void dropMarker()}
                className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200"
              >
                Drop marker
              </button>
              <input
                value={markerLabel}
                onChange={(e) => setMarkerLabel(e.target.value)}
                placeholder="marker label"
                className="w-40 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
              />
              <button
                type="button"
                onClick={() => void stopDisk()}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/30 px-3 py-2 text-xs font-medium text-rose-200"
              >
                <Square className="h-3.5 w-3.5" />
                Stop &amp; write manifest
              </button>
            </>
          )}
        </div>

        {errorMsg ? <p className="text-[11px] text-rose-400/90">{errorMsg}</p> : null}

        {lastResponse ? (
          <pre className="max-h-32 overflow-auto rounded border border-zinc-800 bg-zinc-950/50 p-2 font-mono text-[10px] text-zinc-500 whitespace-pre-wrap">
            {lastResponse}
          </pre>
        ) : null}
      </CardBody>
    </Card>
  );
}
