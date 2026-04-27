"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bluetooth,
  Brain,
  Check,
  Circle,
  FlaskConical,
  Play,
  Power,
  Square,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { getRecorderEegLayout, inferResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { useNeuroStore } from "@/lib/store";
import { recorder } from "@/lib/recorder";
import { clientSim } from "@/lib/clientSim";
import { dsp } from "@/lib/dspPipeline";
import {
  calibration,
  CALIBRATION_STATE_HYDRATION_SAFE,
} from "@/lib/calibration";

/**
 * Overview-hero action bar.
 *
 * Layout intentionally split into two groups:
 *
 *   ┌──────────── data-source & capture (LEFT) ────────────┐    ┌── sandbox (RIGHT) ──┐
 *   │  [Connect]  [Start stream]  [Record session]         │    │  [Start simulator]  │
 *   └──────────────────────────────────────────────────────┘    └─────────────────────┘
 *
 * The left group follows the natural real-world workflow: pair a headset,
 * begin streaming its data through the pipeline, record a session. The right
 * group is the testing sandbox — a browser-side simulator that never touches
 * hardware but flows through the same OSC + DSP path.
 */
export function QuickActions() {
  const { wsStatus, settings, deviceName, simRunning, latestEEGDevice } = useNeuroStore(
    useShallow((s) => ({
      wsStatus: s.wsStatus,
      settings: s.settings,
      deviceName: s.deviceName,
      simRunning: s.clientSim.running,
      latestEEGDevice: s.latestEEG?.deviceName,
    })),
  );

  const [recState, setRecState] = React.useState(recorder.status());
  React.useEffect(() => recorder.subscribe(setRecState), []);

  const [calibState, setCalibState] = React.useState(CALIBRATION_STATE_HYDRATION_SAFE);
  React.useEffect(() => calibration.subscribe(setCalibState), []);

  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  };

  const simOn = simRunning || Boolean(settings.simulatorMode);
  const isConnected = Boolean(deviceName) && !simOn;

  const toggleRecord = () => {
    if (recState.recording) {
      const rec = recorder.stop();
      if (rec) {
        // Fire-and-forget — /recordings will offer the actual download buttons.
        // Users get instant feedback that it saved.
      }
    } else {
      const profile = inferResearchDeviceProfile({
        deviceName,
        eegDeviceName: latestEEGDevice,
        settingsSimulator: Boolean(settings.simulatorMode),
        clientSimRunning: simRunning,
      });
      const layout = getRecorderEegLayout(profile);
      recorder.start({
        name: `session-${new Date().toISOString().slice(0, 16).replace(/[:]/g, "")}`,
        source: simOn ? "simulator" : isConnected ? "device" : "simulator",
        device: deviceName ?? "SIMULATOR",
        sampleRate: 256,
        simulatorProfile: (settings as any).simulatorProfile,
        dsp: dsp.getConfig(),
        eegChannelCount: layout.count,
        channelLabels: layout.labels,
      });
    }
  };

  const startSim = async () => {
    await api.useSimulator(false).catch(() => {});
    await api.setDspConfig({ oscSending: true } as any).catch(() => {});
    clientSim.start();
  };
  const stopSim = () => clientSim.stop();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      {/* ── LEFT: real-time data flow ── */}
      <div className="flex flex-col gap-2">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Device
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* ① Connect / Disconnect */}
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => run("disc", api.disconnect)}
              disabled={busy !== null}
              leftIcon={<Power className="h-3.5 w-3.5" />}
            >
              Disconnect{deviceName ? ` · ${deviceName}` : ""}
            </Button>
          ) : (
            <Link href="/settings">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Bluetooth className="h-3.5 w-3.5" />}
              >
                Connect
              </Button>
            </Link>
          )}

          {/*
           * ② Calibrate
           *
           * Pattern: before running, this is a *shortcut to the setup page*
           * (/brain-state has the breathing guide + instructions). Once
           * running, the same button becomes an in-place Stop toggle so you
           * don't have to navigate away to cancel.
           */}
          {calibState.running ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => calibration.stop("cancelled")}
              leftIcon={<Square className="h-3.5 w-3.5" />}
              title={`Stop calibration (${Math.round(calibState.progress * 100)}%)`}
            >
              Stop · {Math.round(calibState.progress * 100)}%
            </Button>
          ) : (
            <Link href="/brain-state">
              <Button
                variant={calibState.baseline ? "outline" : "secondary"}
                size="sm"
                leftIcon={
                  calibState.baseline ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Brain className="h-3.5 w-3.5" />
                  )
                }
                title={
                  calibState.baseline
                    ? "Baseline saved — click to open the calibration page"
                    : "Open the calibration page — 90 s guided session"
                }
              >
                {calibState.baseline ? "Re-calibrate" : "Calibrate"}
              </Button>
            </Link>
          )}

          {/* ③ Start stream (toggle — no config page needed) */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("start", api.start)}
            disabled={busy !== null || wsStatus !== "open" || !isConnected}
            leftIcon={<Play className="h-3.5 w-3.5" />}
            title={
              !isConnected
                ? "Connect a device first (or click Start simulator on the right)"
                : "Begin streaming through the DSP + OSC pipeline"
            }
          >
            Start stream
          </Button>

          {/*
           * ④ Record session
           *
           * Same pattern as Calibrate: before running → link to /recordings
           * (name the session, see what will be captured, pick options).
           * While running → direct in-place Stop toggle with live elapsed.
           */}
          {recState.recording ? (
            <Button
              variant="danger"
              size="sm"
              onClick={toggleRecord}
              leftIcon={<Square className="h-3.5 w-3.5" />}
              title="Stop recording — session will appear on the Recordings page"
            >
              Stop · {Math.floor(recState.elapsedMs / 1000)}s
            </Button>
          ) : (
            <Link href="/recordings">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Circle className="h-3.5 w-3.5" />}
                title="Open the Recordings page to name the session and start capturing"
              >
                Record session
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── RIGHT: sandbox ── */}
      <div className="flex flex-col gap-2 sm:items-end">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          No device? Sandbox
        </div>
        <Button
          variant={simOn ? "danger" : "outline"}
          size="sm"
          onClick={() => run("sim", () => (simOn ? stopSim() : startSim()))}
          disabled={busy !== null || wsStatus !== "open"}
          leftIcon={<FlaskConical className="h-3.5 w-3.5" />}
        >
          {simOn ? "Stop simulator" : "Start simulator"}
        </Button>
      </div>
    </div>
  );
}
