# NeuroVis — handoff & continuation

This document summarizes the React/Next.js migration and related work, and includes a **prompt** you can paste into a new Cursor chat to resume.

---

## Project overview

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, Zustand, Framer Motion, canvas charts — in `web/`. Dev server: `cd web && npm run dev` → **http://localhost:3001** (port **3001**).
- **Backend:** Node `server-enhanced.js` at repo root — device/simulator, WebSocket **ws://localhost:8080**, REST **http://localhost:3000**, OSC over UDP (e.g. port **7400**).
- **Proxy:** `web/next.config.mjs` rewrites `/api/*` to `NEUROVIS_API_ORIGIN` (default `http://localhost:3000`).

**Goal:** Modern “pro tool” EEG dashboard with parity to the legacy stack; Mind Monitor–style band traces; DSP; OSC; browser simulator; recordings; dual/quad layouts.

---

## Major features (implemented)

- **Shell:** Sidebar, TopBar, dark theme, navigation for all main routes.
- **Visualizations:** Raw EEG, band powers, FFT (`web/lib/fft.ts`), FFT+Bands, 3D waterfall, brain state, stats, DSP pipeline page, OSC page, simulator page, recordings (CSV + JSON manifest + in-app review/scrubber).
- **Scaling:** `ScaleControl` (AUTO + log-scaled manual range + tooltips) across displays; waterfall includes on-canvas view controls (angle, tilt, zoom).
- **OSC:** `OSCMonitor`; server handles WebSocket **`osc_send`** and forwards to UDP; browser simulator can drive Csound/Max when WS is open and relay is configured.
- **Simulator:** `web/lib/clientSim.ts` is a **module singleton** so the run survives route changes; `web/lib/simulator.ts` generates EEG, bands, motion; integrates `dspPipeline` and `bandFilters`. TopBar Start/Stop works **without WebSocket** for local charts; OSC relay to UDP still requires the backend WebSocket path.
- **DSP:** `web/lib/dspPipeline.ts` — detrend, CAR, bandpass, notch, smoothing, artifact flag, log/z-score on band powers; wired into ingest and simulator.
- **Calibration:** Guided session, audio cues (`web/lib/beep.ts`), baseline persistence and `dsp.seedBaseline` (`CalibrationGuide`, brain-state page).
- **Presets:** `web/lib/presets.ts` — localStorage, import/export JSON (OSC, DSP, ranges, full).
- **Dual / Quad:** `DisplayPanel`, `web/lib/layouts.ts`, registry in `web/lib/displays.tsx`.
- **Band traces (Mind Monitor–inspired):**
  - `web/lib/bandFilters.ts` — five bands × four channels (biquad bank).
  - Store: `rollingBandRaw`, `feedSimBandTraces`, `latestBandTraces`; **`ingest` for `eeg`** also runs the band filter bank so **hardware/server** streams populate the same buffers (not only the browser sim).
  - `web/components/charts/BandTracesChart.tsx`:
    - **`layout="overlay"`** — Combined bands: one canvas, each selected band shows TP9/AF7/AF8/TP10 overlaid in that band’s color.
    - **`layout="stacked"`** — Multichannel bands: one time-domain **strip per band**; four traces with fixed electrode colors.
  - **dB display:** `web/lib/bandTraceDb.ts` — Mind Monitor–*style* mapping (`70 + 10·log10(µV²)` with smoothing); scale controls on those pages use **dB span**.
- **OSC band payloads (browser sim):** `web/lib/bandOscChannels.ts` — `/muse/elements/{band}_absolute` and `_relative` carry **four distinct floats** per band from per-channel traces; `OSCMonitor` previews using the same math.

---

## File map (quick reference)

| Area | Path |
|------|------|
| App routes | `web/app/**/page.tsx` |
| Global state | `web/lib/store.ts` |
| WebSocket | `web/lib/useWebSocket.ts` |
| Browser sim | `web/lib/simulator.ts`, `web/lib/clientSim.ts` |
| Band traces + dB | `web/lib/bandFilters.ts`, `web/lib/bandTraceDb.ts`, `web/components/charts/BandTracesChart.tsx` |
| DSP | `web/lib/dspPipeline.ts` |
| Display registry | `web/lib/displays.tsx` |
| Navigation | `web/components/shell/Sidebar.tsx`, `web/components/shell/TopBar.tsx` |
| Backend | `server-enhanced.js` |

---

## Run locally (typical)

1. Start backend (from repo root): run `server-enhanced.js` as you normally do → HTTP **3000**, WS **8080**.
2. Frontend: `cd web && npm install && npm run dev` → **3001**.
3. Open **http://localhost:3001**.

---

## Caveats

- On-screen **dB** is calibrated for a similar **numeric feel** to Mind Monitor; it is **not** bit-identical to Muse’s closed SDK.
- Band filter correctness depends on **effective sample rate**; the store adapts `bandFilters` from EEG message timing — fine for demos, not a substitute for lab-grade fixed-FS design when the stream is heavily throttled.

---

## Continuation prompt (paste into a new Cursor chat)

```
Project: NeuroVis at /Users/richardboulanger/dB-Studio/NeuroVis. Next.js app in web/ (port 3001), API/WebSocket/OSC from server-enhanced.js (port 3000, WS 8080).

Read first: web/lib/store.ts, web/lib/clientSim.ts, web/lib/simulator.ts, web/components/charts/BandTracesChart.tsx, web/lib/bandTraceDb.ts, web/lib/displays.tsx, web/components/shell/Sidebar.tsx, web/components/shell/TopBar.tsx. Repo handoff: docs/HANDOFF.md.

What exists: Browser simulator singleton (clientSim) feeding Zustand + optional OSC via WS osc_send; band-pass traces in rollingBandRaw from sim and from ingest EEG; Combined bands = BandTracesChart layout="overlay" (4 ch per band, dB scale); Multichannel bands = layout="stacked" (one row per band, electrode colors); Mind Monitor–style dB via bandTraceDb; dual/quad layouts; DSP pipeline; recordings; presets; OSC monitor.

Constraints: Match existing patterns; keep diffs focused; do not expand scope beyond what I ask.

My next task: [describe your task here]
```

---

*Last updated from project handoff notes.*
