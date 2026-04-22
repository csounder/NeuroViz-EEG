# NeuroVis — Next.js frontend

A React + Next.js (App Router, TypeScript, Tailwind) rebuild of the NeuroVis
EEG dashboard UI, with a cleaner, more human interface. It connects to the
existing `server-enhanced.js` backend unchanged — no device logic was ported.

## Architecture

```
Muse / OpenBCI
      │
      ▼
MuseBridge / BrainFlow                 (hardware connectors)
      │
      ▼
server-enhanced.js  ───► OSC (Csound / Max / TouchDesigner ...)
  │     │
  │     └─► REST    (http://localhost:3000/api/*)
  │
  └────► WebSocket (ws://localhost:8080)
             │
             ▼
     web/  (this app — Next.js on port 3001)
```

The Next.js app:

- Opens a single WebSocket to `ws://localhost:8080` and fans out messages
  (`eeg`, `bandPowers`, `motionData`, `battery`, `touching`,
  `calibration_status`, `settings_updated`, `device_list`, …) into a Zustand
  store consumed by every page and chart.
- Proxies `/api/*` to `http://localhost:3000/api/*` via a Next.js rewrite,
  so the REST endpoints in `server-enhanced.js` are reachable from the
  browser with no CORS setup.

## Quick start

```bash
# 1. Start the backend (hardware + DSP + OSC + WebSocket) — one-time in repo root
cd ..
npm install          # installs Node deps for the backend (already done if you ran the old dashboard)
npm start            # http://localhost:3000 (old dashboard)  +  ws://localhost:8080

# 2. Start the new Next.js frontend — in this folder
npm install
npm run dev          # http://localhost:3001
```

Open **http://localhost:3001** for the new UI. The legacy dashboard remains
available on port 3000 side-by-side.

## Configuration

Copy `.env.local.example` to `.env.local` to override defaults:

```
NEUROVIS_API_ORIGIN=http://localhost:3000          # backend HTTP origin
NEXT_PUBLIC_NEUROVIS_WS_URL=ws://localhost:8080    # backend WebSocket URL
```

## Pages

| Route            | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `/`              | Overview — live raw, band powers, brain state, hero  |
| `/raw`           | 4-channel live EEG (canvas, 4 s rolling window)      |
| `/bands`         | Animated band-power bars + 60 s history              |
| `/fft`           | FFT spectrum 0–50 Hz with band regions highlighted   |
| `/brain-state`   | State classifier + 90 s calibration controls         |
| `/dsp`           | 23-filter DSP pipeline config (presets + per-stage)  |
| `/osc`           | OSC host / port / rate / streams / receiver snippets |
| `/stats`         | Pipeline health, latency, raw payload                |
| `/settings`      | Device list, simulator toggle, backend info         |

## Project layout

```
web/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # root layout (fonts + shell)
│   ├── page.tsx            # overview
│   ├── raw/, bands/, …     # tabs
│   └── globals.css         # tailwind + app styles
├── components/
│   ├── shell/              # AppShell, Sidebar, TopBar
│   ├── ui/                 # Card, Button, Badge, Toggle, Slider, Stat
│   ├── charts/             # RawEEGChart, FFTChart, BandBars, BandHistoryChart
│   └── widgets/            # BrainStateCard, DeviceSelector, QuickActions
├── lib/
│   ├── types.ts            # TS types mirroring the server WS/REST contract
│   ├── api.ts              # REST client (/api/…)
│   ├── store.ts            # Zustand store + classifier
│   ├── useWebSocket.ts     # auto-reconnecting WS hook
│   └── utils.ts
└── next.config.mjs         # rewrites /api/* to backend
```

## Design system

- **Aesthetic**: Linear / Vercel-inspired — dark-first, near-black (`#09090b`)
  canvas with subtle emerald + indigo aurora accents.
- **Typography**: Inter (sans) + JetBrains Mono (tabular numerics).
- **Bands**: each band has a canonical color shared across all charts
  (δ violet, θ indigo, α emerald, β amber, γ rose).
- **Motion**: Framer Motion for bar animations and state transitions, honors
  `prefers-reduced-motion`.

## What's covered vs the old dashboard

Feature parity for the most-used flows (roughly 80 % of daily usage):

- ✅ Live 4-channel raw EEG chart
- ✅ Band powers bars + 60 s history
- ✅ FFT spectrum with band regions
- ✅ Brain state classifier + 90 s calibration UI
- ✅ DSP pipeline configuration (8 presets, 4 stages)
- ✅ OSC streaming controls (host/port/rate/smoothing/scale/streams)
- ✅ Device selection + simulator toggle
- ✅ Session recording (start / stop)
- ✅ Connection / battery / packet-rate indicators
- ✅ Responsive sidebar + mobile menu

Still to port from the legacy `public/index.html` (all scaffolding is in
place — the WebSocket store already receives the data):

- ⏳ 3D Waterfall visualization
- ⏳ Phase-polar coherence view
- ⏳ PPG / heart-rate panel (data arrives on `motionData` + `battery`)
- ⏳ Accel / gyro 2-pane motion panel
- ⏳ Topomap / scalp map (Ultracortex 16-channel)
- ⏳ Quad view (4 selectable panels)
- ⏳ Presets save/load (localStorage)

## Development

```bash
npm run dev        # hot-reloading dev server on :3001
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```
