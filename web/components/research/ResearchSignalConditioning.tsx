"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EEG_TRACE_OPTIONS } from "@/lib/eegTraceSourceInfo";
import { useNeuroStore } from "@/lib/store";

type BaselineStatus = {
  logTransform: boolean;
  baselineNormalize: boolean;
  windowSec: number;
  maxSamples: number;
  baselineBandRateHz?: number;
  sampleCounts: Record<string, number>;
  ready: boolean;
};

type CalibrationStatus = {
  isCalibrating: boolean;
  isLocked: boolean;
  progress: number;
  samplesCollected: number;
};

type DspConfig = {
  applyCAR: boolean;
  applyNotch: boolean;
  applyBandpass: boolean;
  smoothingAmount: number;
  notchHz: number;
  bandpassLo: number;
  bandpassHi: number;
  applyMedian3: boolean;
};

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

function EegTraceSourcePanel() {
  const eegTraceSource = useNeuroStore((s) => s.eegTraceSource);
  const setEegTraceSource = useNeuroStore((s) => s.setEegTraceSource);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/35 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">EEG traces in the browser</h3>
        <span className="font-mono text-[10px] text-zinc-500">
          docs: <span className="text-zinc-400">docs/RESEARCH-EEG-AND-BASELINE-PATHS.md</span>
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        This choice only affects <strong className="text-zinc-400">waveform charts</strong> and the{" "}
        <strong className="text-zinc-400">band-pass trace bank</strong> (Combined / Multichannel / Raw pages).
        Server <strong className="text-zinc-400">band power</strong> numbers, REST{" "}
        <code className="text-zinc-600">/api/bands</code>, and OSC still use the server pipeline below.
      </p>
      <div className="space-y-2" role="radiogroup" aria-label="EEG trace source">
        {EEG_TRACE_OPTIONS.map((opt) => (
          <label
            key={opt.id}
            className={`flex cursor-pointer gap-3 rounded-md border p-2.5 transition-colors ${
              eegTraceSource === opt.id
                ? "border-emerald-600/50 bg-emerald-950/25"
                : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
            }`}
          >
            <input
              type="radio"
              name="eeg-trace-source"
              className="mt-0.5 accent-emerald-500"
              checked={eegTraceSource === opt.id}
              onChange={() => setEegTraceSource(opt.id)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-200">{opt.label}</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">{opt.summary}</span>
            </span>
          </label>
        ))}
      </div>
      <details className="mt-3 text-[11px] text-zinc-500">
        <summary className="cursor-pointer font-medium text-zinc-400 hover:text-zinc-300">
          Compare all three (full detail)
        </summary>
        <ul className="mt-2 space-y-2 border-t border-zinc-800 pt-2">
          {EEG_TRACE_OPTIONS.map((opt) => (
            <li key={opt.id}>
              <span className="font-mono text-emerald-600/90">{opt.id}</span>
              <span className="text-zinc-600"> — </span>
              {opt.body}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function ResearchSignalConditioning() {
  const settings = useNeuroStore((s) => s.settings);
  const eegTraceSource = useNeuroStore((s) => s.eegTraceSource);
  const calibWs = useNeuroStore((s) => s.calibration);

  const [baseline, setBaseline] = React.useState<BaselineStatus | null>(null);
  const [calib, setCalib] = React.useState<CalibrationStatus | null>(null);
  const [dsp, setDsp] = React.useState<DspConfig | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [baselineWindowLocal, setBaselineWindowLocal] = React.useState(60);

  const applyBaseline = Boolean(settings.applyBaseline ?? baseline?.baselineNormalize);
  const logTransform = Boolean(settings.logTransform ?? baseline?.logTransform);

  const refresh = React.useCallback(async () => {
    try {
      const [b, c, d] = await Promise.all([
        fetch("/api/baseline/status", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/calibration/status", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/dsp/config", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setBaseline(b as BaselineStatus);
      setCalib(c as CalibrationStatus);
      setDsp(d as DspConfig);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Status fetch failed");
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(id);
  }, [refresh]);

  React.useEffect(() => {
    if (baseline?.windowSec != null) setBaselineWindowLocal(baseline.windowSec);
  }, [baseline?.windowSec]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const ch1Samples = baseline?.sampleCounts?.CH1 ?? 0;
  const calibrating = Boolean(calib?.isCalibrating || calibWs.isCalibrating);
  const progress = calibrating
    ? calib?.progress != null
      ? calib.progress
      : calibWs.percent / 100
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<SlidersHorizontal className="h-4 w-4" />}
          description="Server pipeline: optional log-scaling and rolling z-score on relative band powers, plus µV conditioning (average reference, bandpass, notch, EMA, optional 3-point median) before FFT/bands. Browser trace source is separate; band powers and OSC stay on the server unless you use the in-tab simulator."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="violet" className="normal-case">
                traces: {eegTraceSource.replace(/_/g, " ")}
              </Badge>
              {baseline?.ready ? (
                <Badge tone="emerald">Rolling stats ready</Badge>
              ) : (
                <Badge tone="neutral">Warming up (&lt;10 ticks)</Badge>
              )}
              {calib?.isCalibrating || calibWs.isCalibrating ? (
                <Badge tone="amber">Calibrating</Badge>
              ) : calib?.isLocked ? (
                <Badge tone="indigo">Calibration locked</Badge>
              ) : null}
            </div>
          }
        >
          Baseline & signal conditioning
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-6">
        <EegTraceSourcePanel />
        <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-400">Reading the baseline:</strong> when &quot;Z-score relative
            bands&quot; is on, the server keeps a rolling history (default {baseline?.windowSec ?? 60}s ≈{" "}
            {baseline?.maxSamples ?? "—"} samples at ~{baseline?.baselineBandRateHz ?? 10} Hz) of each
            relative band, then outputs
            deviation from that mean. Muse streams one global set of bands; history is tracked on CH1 as the
            representative channel. Absolute dB bands from the server FFT are not z-scored here.
          </p>

          {err ? (
            <p className="rounded border border-rose-900/60 bg-rose-950/40 px-2 py-1 font-mono text-[11px] text-rose-200">
              {err}
            </p>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              className="mt-1 accent-emerald-500"
              checked={applyBaseline}
              disabled={!!busy}
              onChange={(event) =>
                void run("baseline", () =>
                  postJson("/api/settings", { applyBaseline: event.target.checked }),
                )
              }
            />
            <span>
              <span className="font-medium">Z-score relative band powers</span>
              <span className="block text-[11px] text-zinc-500">
                Rolling-mean z-score on relative power: values become roughly standard deviations from your
                recent window (useful for trends and session comparisons).
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              className="mt-1 accent-emerald-500"
              checked={logTransform}
              disabled={!!busy}
              onChange={(event) =>
                void run("log", () => postJson("/api/settings", { logTransform: event.target.checked }))
              }
            />
            <span>
              <span className="font-medium">Log₁₀ before z-score</span>
              <span className="block text-[11px] text-zinc-500">
                Optional log₁₀ on relative power before the rolling mean/std step (common when spans are
                large).
              </span>
            </span>
          </label>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-zinc-200" htmlFor="baseline-window-sec">
                Rolling baseline window
              </label>
              <span className="font-mono text-[11px] text-zinc-500">
                {baselineWindowLocal}s → ~{Math.round(baselineWindowLocal * (baseline?.baselineBandRateHz ?? 10))}{" "}
                samples
              </span>
            </div>
            <input
              id="baseline-window-sec"
              type="range"
              min={10}
              max={600}
              step={5}
              value={baselineWindowLocal}
              disabled={!!busy}
              onChange={(event) => setBaselineWindowLocal(Number(event.target.value))}
              onPointerUp={(event) => {
                const windowSec = Number((event.target as HTMLInputElement).value);
                void run("baseline-window", () =>
                  postJson("/api/baseline/config", { windowSec }),
                );
              }}
              className="mt-1 w-full accent-emerald-500"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Shorter windows react faster; longer windows stabilize z-scores (30–120s is typical for
              resting baselines). Clamped 10–600s. History is trimmed if you shrink the window.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 font-mono text-[11px] text-zinc-400">
            <div className="flex justify-between gap-2">
              <span>Rolling samples (CH1 / α)</span>
              <span className="text-zinc-200">{ch1Samples}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span>Server flags</span>
              <span className="text-zinc-200">
                z={baseline?.baselineNormalize ? "on" : "off"} · log=
                {baseline?.logTransform ? "on" : "off"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => void run("reset-baseline", () => postJson("/api/baseline/reset", {}))}
            >
              Clear rolling baseline
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="rounded-md border border-emerald-800 bg-emerald-950/50 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-50"
              onClick={() => void run("cal-start", () => postJson("/api/calibration/start", {}))}
            >
              Start 90s calibration
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => void run("cal-stop", () => postJson("/api/calibration/stop", {}))}
            >
              Stop early
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => void run("cal-reset", () => postJson("/api/calibration/reset", {}))}
            >
              Reset calibration
            </button>
          </div>

          <div>
            {calibrating ? (
              <>
                <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                  <span>Guided protocol progress</span>
                  <span>
                    {Math.round(progress * 100)}% · {calib?.samplesCollected ?? calibWs.samples} samples
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
                    style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-[10px] text-zinc-600">
                Idle — start the 90s protocol to clear history and turn on server z-score (
                <code className="text-zinc-500">applyBaseline</code>
                ), or toggle z-score manually and stay still while the ~{baseline?.windowSec ?? 60}s window
                fills.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-zinc-800 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-400">Post-conditioning (raw EEG, server DSP):</strong> runs on
            the µV stream (internally at device rate, e.g. 256 Hz) before features—same family of steps as
            in open toolkits (e.g. average reference, bandpass, line notch in{" "}
            <a
              className="text-emerald-500 underline"
              href="https://mne.tools/stable/auto_tutorials/raw/40_visualize_raw.html"
              target="_blank"
              rel="noreferrer"
            >
              MNE
            </a>
            ). Use presets below or set edges manually; enable 3-point median for short impulse rejection
            after the bandpass.
          </p>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Bandpass presets
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy || !dsp}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                onClick={() =>
                  void run("bp-muse", () =>
                    postJson("/api/dsp/config", { bandpassLo: 1, bandpassHi: 45 }),
                  )
                }
              >
                Wide 1–45 Hz (Muse-friendly)
              </button>
              <button
                type="button"
                disabled={!!busy || !dsp}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                onClick={() =>
                  void run("bp-narrow", () =>
                    postJson("/api/dsp/config", { bandpassLo: 4, bandpassHi: 40 }),
                  )
                }
              >
                Narrow 4–40 Hz (common ML / analysis band)
              </button>
              <button
                type="button"
                disabled={!!busy || !dsp}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                onClick={() =>
                  void run("bp-slow", () =>
                    postJson("/api/dsp/config", { bandpassLo: 0.5, bandpassHi: 48 }),
                  )
                }
              >
                Slow–gamma 0.5–48 Hz
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-zinc-400">
                Lo (Hz)
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={55}
                  value={dsp?.bandpassLo ?? 1}
                  disabled={!!busy || !dsp}
                  onChange={(e) =>
                    setDsp((p) => (p ? { ...p, bandpassLo: Number(e.target.value) } : p))
                  }
                  className="ml-1 w-16 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 font-mono text-zinc-200"
                />
              </label>
              <label className="text-[11px] text-zinc-400">
                Hi (Hz)
                <input
                  type="number"
                  step={1}
                  min={2}
                  max={80}
                  value={dsp?.bandpassHi ?? 45}
                  disabled={!!busy || !dsp}
                  onChange={(e) =>
                    setDsp((p) => (p ? { ...p, bandpassHi: Number(e.target.value) } : p))
                  }
                  className="ml-1 w-16 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 font-mono text-zinc-200"
                />
              </label>
              <button
                type="button"
                disabled={!!busy || !dsp}
                className="rounded bg-emerald-900/40 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-900/60 disabled:opacity-50"
                onClick={() =>
                  void run("bp-apply", () =>
                    postJson("/api/dsp/config", {
                      bandpassLo: dsp?.bandpassLo ?? 1,
                      bandpassHi: dsp?.bandpassHi ?? 45,
                    }),
                  )
                }
              >
                Apply edges
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {(
              [
                ["applyCAR", "CAR (common average reference)", "Subtracts the mean across channels each sample to attenuate shared noise."],
                [
                  "applyBandpass",
                  `Bandpass (${dsp?.bandpassLo ?? 1}–${dsp?.bandpassHi ?? 45} Hz)`,
                  "Butterworth-style high-pass + low-pass biquads; edges set above.",
                ],
              ] as const
            ).map(([key, label, help]) => (
              <label key={key} className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  className="mt-1 accent-emerald-500"
                  checked={Boolean(dsp?.[key])}
                  disabled={!!busy || !dsp}
                  onChange={(event) =>
                    void run(`dsp-${key}`, () =>
                      postJson("/api/dsp/config", { [key]: event.target.checked }),
                    )
                  }
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-[11px] text-zinc-500">{help}</span>
                </span>
              </label>
            ))}

            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-2">
              <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  className="mt-1 accent-emerald-500"
                  checked={Boolean(dsp?.applyNotch)}
                  disabled={!!busy || !dsp}
                  onChange={(event) =>
                    void run("dsp-applyNotch", () =>
                      postJson("/api/dsp/config", { applyNotch: event.target.checked }),
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    Notch ({dsp?.notchHz ?? 60} Hz mains)
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    Narrow biquad at the line frequency. EU/Australia often need 50 Hz; Americas typically 60
                    Hz.
                  </span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">Center</span>
                    <select
                      value={dsp?.notchHz === 50 ? 50 : 60}
                      disabled={!!busy || !dsp}
                      onChange={(event) => {
                        const hz = Number(event.target.value) as 50 | 60;
                        void run("dsp-notch-hz", () => postJson("/api/dsp/config", { notchHz: hz }));
                      }}
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
                    >
                      <option value={50}>50 Hz</option>
                      <option value={60}>60 Hz</option>
                    </select>
                  </div>
                </span>
              </label>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-800/80 bg-zinc-950/30 p-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              className="mt-1 accent-emerald-500"
              checked={Boolean(dsp?.applyMedian3)}
              disabled={!!busy || !dsp}
              onChange={(event) =>
                void run("dsp-median", () =>
                  postJson("/api/dsp/config", { applyMedian3: event.target.checked }),
                )
              }
            />
            <span>
              <span className="font-medium">3-point median (post-bandpass)</span>
              <span className="block text-[11px] text-zinc-500">
                Running median filter per channel — rejects single-sample spikes; lightweight step used in
                many embedded EEG pipelines (distinct from full ASR/ICA in research tools).
              </span>
            </span>
          </label>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-zinc-200" htmlFor="research-smoothing">
                Raw smoothing (EMA)
              </label>
              <span className="font-mono text-[11px] text-zinc-500">
                τ ≈ {dsp?.smoothingAmount ?? 0} ms · 0 = off
              </span>
            </div>
            <input
              id="research-smoothing"
              type="range"
              min={0}
              max={50}
              step={1}
              value={dsp?.smoothingAmount ?? 10}
              disabled={!!busy || !dsp}
              onChange={(event) =>
                setDsp((prev) =>
                  prev ? { ...prev, smoothingAmount: Number(event.target.value) } : prev,
                )
              }
              onPointerUp={(event) => {
                const value = Number((event.target as HTMLInputElement).value);
                void run("dsp-smooth", () => postJson("/api/dsp/config", { smoothingAmount: value }));
              }}
              className="mt-1 w-full accent-emerald-500"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Exponential time constant per channel on the raw stream (server-side). Higher = smoother,
              slower response. This acts on the time-domain µV path before scaling/output.
            </p>
          </div>
        </div>
        </div>
      </CardBody>
    </Card>
  );
}
