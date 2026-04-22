"use client";

import * as React from "react";
import {
  Check,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, BAND_COLORS, BAND_LABELS } from "@/lib/utils";
import { BAND_NAMES } from "@/lib/types";
import {
  calibration,
  DEFAULT_DURATION_SEC,
  type CalibrationSessionState,
} from "@/lib/calibration";
import {
  enableAudio,
  getVolume,
  isMuted,
  setMuted,
  setVolume,
} from "@/lib/beep";

const DEFAULT_CUE_LINES = [
  "Sit comfortably, feet on the floor.",
  "Close your eyes.",
  "Breathe with the circle: in for 4 s, out for 6 s.",
  "Let thoughts pass without grabbing them.",
];

/**
 * Immersive calibration widget.
 *
 * - Big breathing circle that expands on inhale (4 s) and contracts on
 *   exhale (6 s). Cue text and timer sit inside the circle.
 * - Start chime, inhale/exhale ticks, and a descending end chime when done.
 * - Live sample counter + progress bar underneath.
 * - The EEG feed is never touched: this is a purely-client flow that SAMPLES
 *   the existing band power stream into a local array.
 */
export function CalibrationGuide() {
  const [session, setSession] = React.useState<CalibrationSessionState>(
    () => calibration.state,
  );
  const [mutedState, setMutedState] = React.useState(isMuted());
  const [volumeState, setVolumeState] = React.useState(getVolume());

  React.useEffect(() => calibration.subscribe(setSession), []);

  const start = () => {
    // Browsers require a user gesture to unlock audio on iOS/Safari.
    enableAudio();
    calibration.start(DEFAULT_DURATION_SEC);
  };
  const stop = () => calibration.stop("cancelled");
  const clearBaseline = () => calibration.clearBaseline();
  const toggleMute = () => {
    const next = !mutedState;
    setMuted(next);
    setMutedState(next);
  };

  const running = session.running;
  const baseline = session.baseline;

  // Circle scale animates between inhale (grow) and exhale (shrink).
  const circleScale = running
    ? session.phase === "inhale"
      ? 0.68 + 0.32 * session.phaseProgress
      : 1.0 - 0.32 * session.phaseProgress
    : 1.0;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto,1fr]">
      {/* ─── Breathing circle ─── */}
      <div className="relative mx-auto flex h-64 w-64 items-center justify-center">
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full transition-all",
            running
              ? "bg-gradient-to-br from-emerald-500/20 to-indigo-500/10"
              : "bg-gradient-to-br from-zinc-800/50 to-zinc-900/50",
          )}
          style={{
            transform: `scale(${circleScale.toFixed(3)})`,
            transitionDuration:
              session.phase === "inhale" ? "4000ms" : "6000ms",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            filter: running ? "blur(8px)" : "blur(4px)",
          }}
        />
        <div
          className={cn(
            "absolute inset-4 rounded-full border-2",
            running
              ? "border-emerald-500/40"
              : "border-zinc-700",
          )}
          style={{
            transform: `scale(${circleScale.toFixed(3)})`,
            transitionProperty: "transform",
            transitionDuration:
              session.phase === "inhale" ? "4000ms" : "6000ms",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        <div className="relative flex flex-col items-center gap-1 px-4 text-center">
          <div
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest",
              running ? "text-emerald-300" : "text-zinc-500",
            )}
          >
            {running
              ? session.phase === "inhale"
                ? "Inhale"
                : "Exhale"
              : baseline
                ? "Last baseline"
                : "Ready"}
          </div>
          <div className="font-mono text-3xl tabular-nums text-zinc-100">
            {running ? Math.ceil(session.phaseSecondsLeft) : "—"}
          </div>
          <div className="mt-1 max-w-[12rem] text-[11px] leading-tight text-zinc-400">
            {running
              ? session.cue
              : baseline
                ? `${baseline.samples} samples · ${baseline.durationSec}s`
                : "Click Start when ready"}
          </div>
        </div>
      </div>

      {/* ─── Controls + instructions + baseline ─── */}
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!running ? (
            <Button
              variant="primary"
              onClick={start}
              leftIcon={<Play className="h-3.5 w-3.5" />}
            >
              Start 90 s calibration
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={stop}
              leftIcon={<Square className="h-3.5 w-3.5" />}
            >
              Stop
            </Button>
          )}
          {baseline && !running && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearBaseline}
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Clear baseline
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleMute}
              title={mutedState ? "Unmute cues" : "Mute cues"}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 p-1.5 text-zinc-400 hover:text-zinc-200"
            >
              {mutedState ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumeState}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                setVolumeState(v);
              }}
              className="h-1 w-20 cursor-pointer accent-emerald-500"
              aria-label="Volume"
            />
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-zinc-400">
              {running
                ? `Breath ${session.cycle} · ${Math.round(session.progress * 100)}%`
                : baseline
                  ? "Baseline ready"
                  : "Not yet calibrated"}
            </span>
            <span className="font-mono tabular-nums text-zinc-200">
              {running
                ? `${Math.ceil(session.elapsedSec)}s / ${session.totalSec}s`
                : "—"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn(
                "h-full transition-[width]",
                running ? "bg-emerald-500" : "bg-emerald-500/40",
              )}
              style={{
                width: `${Math.round(session.progress * 100)}%`,
                transitionDuration: "120ms",
              }}
            />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {session.samples.toLocaleString()} samples collected
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs leading-relaxed text-zinc-400">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {running ? "Stay with the breath" : "Instructions"}
          </div>
          <ol className="ml-4 list-decimal space-y-0.5">
            {DEFAULT_CUE_LINES.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-zinc-500">
            The live EEG keeps flowing underneath — this just records a 90 s
            window so NeuroVis can tell later whether your alpha/beta/… are
            above or below your own baseline.
          </p>
        </div>

        {/* Baseline summary */}
        {baseline && !running && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-200">
              <Check className="h-4 w-4" />
              Your baseline
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BAND_NAMES.map((b) => {
                const s = baseline.bandsRelative[b];
                return (
                  <div key={b} className="text-center">
                    <div
                      className="font-mono text-[10px] uppercase tracking-wider"
                      style={{ color: BAND_COLORS[b] }}
                    >
                      {BAND_LABELS[b]}
                    </div>
                    <div className="mt-0.5 font-mono text-xs tabular-nums text-zinc-100">
                      {(s.mean * 100).toFixed(0)}%
                    </div>
                    <div className="font-mono text-[9px] tabular-nums text-zinc-500">
                      ± {(s.std * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Enable <span className="text-zinc-300">Z-Score</span> in the DSP
              page — state changes will now be reported relative to this
              baseline instead of an absolute textbook reference.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
