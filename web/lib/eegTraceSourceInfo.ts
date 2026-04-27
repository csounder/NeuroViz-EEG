import type { EegTraceSource } from "./types";

/** UI copy for the EEG trace source selector (Research + docs). */
export const EEG_TRACE_OPTIONS: {
  id: EegTraceSource;
  label: string;
  /** One-line summary under the radio */
  summary: string;
  /** Longer explanation for the details panel */
  body: string;
}[] = [
  {
    id: "server_dsp",
    label: "Server conditioned (recommended for Research)",
    summary:
      "Uses the `processed` vector from the Node backend — same CAR / bandpass / notch / EMA as `/api/dsp/config`.",
    body:
      "The bridge sends `raw` µV; the server runs dsp.js at full EEG rate, then throttles WebSocket `eeg` to ~10 Hz. " +
      "Charts and the per-band trace bank use that `processed` stream, so what you see matches the server DSP controls. " +
      "If `processed` is missing, we fall back to `raw`. Band power messages (`bandPowers`) are always computed on the server separately.",
  },
  {
    id: "device_raw",
    label: "Device raw (minimal)",
    summary: "Uses WebSocket `raw` only — scaling from the bridge / device model, no server filtering.",
    body:
      "Best when you want to inspect what arrived before Node dsp.js, or compare against another offline pipeline. " +
      "Mains noise and drift are not removed by the server on this path (browser band-pass traces still apply their own biquads on top).",
  },
  {
    id: "browser_dsp",
    label: "Browser dspPipeline (legacy default)",
    summary: "Runs the in-browser dspPipeline on `raw` — independent of server notch/CAR settings.",
    body:
      "This was the original NeuroVis behavior: client-side biquads, optional CAR, etc., configured in the browser. " +
        "Useful for A/B comparisons or when tuning the client chain without touching the server. " +
        "Requires dsp master + CAR enabled in the client config for the full chain to run.",
  },
];
