"use client";

import * as React from "react";
import { Play, Square } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useNeuroStore } from "@/lib/store";

type Phase = "baseline" | "task" | "rest";

type RunState =
  | { kind: "idle" }
  | { kind: "running"; phase: Phase; phaseEndsAt: number; cycle: number };

export function ResearchBlockProtocol() {
  const logResearchEvent = useNeuroStore((s) => s.logResearchEvent);

  const [baselineSec, setBaselineSec] = React.useState(30);
  const [taskSec, setTaskSec] = React.useState(60);
  const [restSec, setRestSec] = React.useState(30);
  const [repeat, setRepeat] = React.useState(1);
  const [run, setRun] = React.useState<RunState>({ kind: "idle" });
  const [, setPulse] = React.useState(0);

  const runRef = React.useRef<RunState>(run);
  runRef.current = run;

  const setRunState = React.useCallback((next: RunState) => {
    runRef.current = next;
    setRun(next);
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const st = runRef.current;
      if (st.kind !== "running") return;
      setPulse((x) => x + 1);
      if (Date.now() < st.phaseEndsAt) return;

      const now = Date.now();
      const { phase, cycle } = st;

      if (phase === "baseline") {
        logResearchEvent(
          `epoch_task_b${cycle + 1}`,
          "marker",
          `block ${cycle + 1}/${repeat} task ${taskSec}s`,
        );
        setRunState({
          kind: "running",
          phase: "task",
          phaseEndsAt: now + taskSec * 1000,
          cycle,
        });
        return;
      }
      if (phase === "task") {
        logResearchEvent(
          `epoch_rest_b${cycle + 1}`,
          "marker",
          `block ${cycle + 1}/${repeat} rest ${restSec}s`,
        );
        setRunState({
          kind: "running",
          phase: "rest",
          phaseEndsAt: now + restSec * 1000,
          cycle,
        });
        return;
      }

      logResearchEvent(
        `epoch_block_end_b${cycle + 1}`,
        "marker",
        `block ${cycle + 1}/${repeat} complete`,
      );
      if (cycle + 1 < repeat) {
        logResearchEvent(
          `epoch_baseline_b${cycle + 2}`,
          "marker",
          `auto block ${cycle + 2}/${repeat} baseline ${baselineSec}s`,
        );
        setRunState({
          kind: "running",
          phase: "baseline",
          phaseEndsAt: now + baselineSec * 1000,
          cycle: cycle + 1,
        });
      } else {
        logResearchEvent("protocol_complete", "marker", `${repeat} block(s) finished`);
        setRunState({ kind: "idle" });
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [
    baselineSec,
    logResearchEvent,
    repeat,
    restSec,
    setRunState,
    taskSec,
  ]);

  const remainingMs =
    run.kind === "running" ? Math.max(0, run.phaseEndsAt - Date.now()) : 0;
  const phaseLabel =
    run.kind === "running"
      ? run.phase === "baseline"
        ? "Baseline"
        : run.phase === "task"
          ? "Task"
          : "Rest"
      : "Idle";

  const onStart = () => {
    const now = Date.now();
    logResearchEvent(
      "protocol_start",
      "marker",
      `blocks=${repeat} baseline=${baselineSec}s task=${taskSec}s rest=${restSec}s`,
    );
    logResearchEvent(
      "epoch_baseline_b1",
      "marker",
      `block 1/${repeat} baseline ${baselineSec}s`,
    );
    setRunState({
      kind: "running",
      phase: "baseline",
      phaseEndsAt: now + baselineSec * 1000,
      cycle: 0,
    });
  };

  const onStop = () => {
    logResearchEvent("protocol_abort", "marker", "user stop");
    setRunState({ kind: "idle" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle description="Baseline → task → rest with automatic epoch labels in the research event log (exportable with rolling CSV / HTTP markers).">
          Block protocol
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
          <label className="text-zinc-400">
            Baseline (s)
            <input
              type="number"
              min={5}
              step={5}
              value={baselineSec}
              disabled={run.kind === "running"}
              onChange={(e) => setBaselineSec(Math.max(5, Number(e.target.value) || 5))}
              className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
            />
          </label>
          <label className="text-zinc-400">
            Task (s)
            <input
              type="number"
              min={5}
              step={5}
              value={taskSec}
              disabled={run.kind === "running"}
              onChange={(e) => setTaskSec(Math.max(5, Number(e.target.value) || 5))}
              className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
            />
          </label>
          <label className="text-zinc-400">
            Rest (s)
            <input
              type="number"
              min={5}
              step={5}
              value={restSec}
              disabled={run.kind === "running"}
              onChange={(e) => setRestSec(Math.max(5, Number(e.target.value) || 5))}
              className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
            />
          </label>
          <label className="text-zinc-400">
            Repeat blocks
            <input
              type="number"
              min={1}
              max={99}
              value={repeat}
              disabled={run.kind === "running"}
              onChange={(e) => setRepeat(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
              className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {run.kind === "idle" ? (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              <Play className="h-4 w-4" />
              Run block
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          )}
          <span className="font-mono text-xs text-zinc-500">
            Markers: protocol_start, epoch_baseline_*, epoch_task_*, epoch_rest_*, epoch_block_end_*,
            protocol_complete
          </span>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-6 py-8 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {phaseLabel}
            {run.kind === "running"
              ? ` · block ${run.cycle + 1}/${repeat}`
              : ""}
          </div>
          <div className="mt-2 font-mono text-5xl tabular-nums text-zinc-100">
            {(remainingMs / 1000).toFixed(1)}s
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
