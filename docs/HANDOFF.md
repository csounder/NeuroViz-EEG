# NeuroVis — handoff & continuation

This document summarizes the React/Next.js migration and related work, and includes a **prompt** you can paste into a new Cursor chat to resume.

## Canonical Git remote

- **NeuroViz-EEG** (Next.js + `server-enhanced.js` Cursor-era snapshot): [https://github.com/csounder/NeuroViz-EEG](https://github.com/csounder/NeuroViz-EEG)

---

## Project overview

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, Zustand, Framer Motion, canvas charts — in `web/`. Dev server: `cd web && npm run dev` → **http://localhost:3001** (port **3001**).
- **Backend:** Node `server-enhanced.js` at repo root — device/simulator, WebSocket **ws://localhost:8080**, REST **http://localhost:3000**, OSC over UDP (e.g. port **7400**).
- **Proxy:** `web/next.config.mjs` rewrites `/api/*` to `NEUROVIS_API_ORIGIN` (default `http://localhost:3000`).

**Goal:** Modern “pro tool” EEG dashboard with parity to the legacy stack; Mind Monitor–style band traces; DSP; OSC; browser simulator; recordings; dual/quad layouts.

---

## 2026-04-26 — Muse BLE backends, Athena bridge, device UX

### Two BLE backends (one active at a time)
| Backend | When to use | How to start |
|--------|-------------|--------------|
| **Swift MuseBridge** (`./MuseBridge`, default) | Muse 2 / 3 / S, LibMuse GATT | `npm start` or `npm run start:swift` |
| **Python Athena** (`scripts/athena_ble_bridge.py`) | Muse S Athena only (GATT notify **`273e0013`**) | `BRIDGE_MODE=athena` or `npm run start:athena` |

- **Muse 2** (e.g. BLE name `Muse-33C1`) does **not** expose `273e0013`. The Athena script **skips** those devices on scan and **rejects** connect; use **Swift**.
- **Runtime switch** without restarting Node: **`GET /api/bridge`**, **`POST /api/bridge/mode`** with body `{ "mode": "swift" | "athena" }`. Kills the current subprocess, clears the device list, respawns the other bridge (`suppressBridgeAutoRestart` avoids the auto-respawn race). **UI:** **Settings → Muse BLE backend** (dropdown).
- **EEG `deviceName`:** `broadcastEEGData` prefers `currentDevice.displayName` (e.g. `Muse-33C1 (Muse 2)`) over bare BLE / LibMuse packet strings.
- **Athena Python:** auto TLV header skip, RX **reassembly** for split notifications, **async stdout queue** so BLE callbacks don’t block on a full pipe; bridge **`type:error`** JSON is logged and forwarded via **`handleStatus`** to WebSocket clients. **`requirements-athena.txt`** + Bleak.
- **Server:** startup **banner** shows active bridge; `settings.inputFormat` forced to **`microvolts`** for Athena path, reset to **`auto`** when switching back to Swift.

### Research / web fixes
- **`web/lib/researchDeviceProfile.ts`:** Muse 2 class = **PPG + IMU**, **no fNIRS**; serial-style BLE names; Vitest in `researchDeviceProfile.test.ts` / `recorderExportSchema.test.ts`.
- **Hydration:** `CALIBRATION_STATE_HYDRATION_SAFE` in `calibration.ts`; **`QuickActions`** initial state avoids SSR/client mismatch on baseline icon.

### Binary / repo
- **`MuseBridge`** in repo root is a **~6 MB** Mach-O universal (arm64 + x86_64) LibMuse helper; replace via your Xcode/Swift build if needed.

### Where we’re leaving off
- **Athena:** If firmware adds unknown sensor TLV tags, extend `TAG_PAYLOAD_BYTES` / decoder in `scripts/athena_ble_bridge.py` using captured hex.
- **Legacy `public/`** HTML: optional; primary UI is **`web/`** Next.js (port **3001** with default dev config).
- **`.env`:** `BRIDGE_MODE` sets **initial** mode only; in-app / API switch overrides until the next full Node restart.

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
Project: NeuroVis — GitHub https://github.com/csounder/NeuroViz-EEG (local path may be /Users/richardboulanger/dB-Studio/NeuroVis). Next.js app in web/ (port 3001), API/WebSocket/OSC from server-enhanced.js (port 3000, WS 8080).

Read first: web/lib/store.ts, web/lib/clientSim.ts, web/lib/simulator.ts, web/components/charts/BandTracesChart.tsx, web/lib/bandTraceDb.ts, web/lib/displays.tsx, web/components/shell/Sidebar.tsx, web/components/shell/TopBar.tsx, web/lib/researchDeviceProfile.ts, scripts/athena_ble_bridge.py (if BLE). Repo handoff: docs/HANDOFF.md (see § 2026-04-26 for Swift vs Athena, /api/bridge, Muse 2).

What exists: Browser simulator singleton (clientSim) feeding Zustand + optional OSC via WS osc_send; band-pass traces in rollingBandRaw from sim and from ingest EEG; Combined bands = BandTracesChart layout="overlay" (4 ch per band, dB scale); Multichannel bands = layout="stacked" (one row per band, electrode colors); Mind Monitor–style dB via bandTraceDb; dual/quad layouts; DSP pipeline; recordings; presets; OSC monitor; **dual Muse BLE backends** (Swift default, Python Athena optional) with **runtime switch** and Settings UI; research device heuristics + Vitest.

Constraints: Match existing patterns; keep diffs focused; do not expand scope beyond what I ask.

My next task: [describe your task here]
```

---

*Last updated: 2026-04-26 — BLE backends, Athena bridge hardening, handoff for GitHub push.*
