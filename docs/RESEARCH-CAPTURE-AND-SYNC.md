# Research, capture, and synchronization

This document describes the **research surface**, **how data is collected**, and **how clocks and markers stay aligned** across the browser, Node bridge, and optional Python relay. It complements [RESEARCH-EEG-AND-BASELINE-PATHS.md](./RESEARCH-EEG-AND-BASELINE-PATHS.md) (trace vs server band-power paths) and the in-app **Downstream analysis** card on `/research#research-downstream`.

## Goals

- **Exploratory lab UX**: live QC, metrics, stimulus alignment, and honest limits (not clinical ERP in-browser without hardware sync).
- **Reproducible exports**: CSV + JSON manifest + BIDS-style sidecars where applicable.
- **One coherent time story**: `wall_ms` for wall-clock alignment; `t_ms` for within-session offsets; optional stimulus audio clock.

---

## Research UI (`/research`)

Sticky section nav (see `web/lib/researchPageNav.ts`):

| Section | Purpose |
|--------|---------|
| **Overview** | Device profile, methods sampling, electrode / contact, credibility, offline ERP workflow summary |
| **Capture** | Session recorder, Event Lab, trigger timing, block protocol |
| **QC & analysis** | Connectivity / vigilance, rule QC, **Baseline & signal conditioning** (trace source, **band integration preset**, server DSP) |
| **Live streams** | Stream meters, band panels, PPG / fNIRS when present |
| **Metrics** | Derived research metrics |
| **Offline analysis** | Vetted external tools + CSV column cheat sheet (`ResearchDownstreamAnalysisCard`) |
| **Reference** | Capture priorities, decoded streams, Mind Monitor OSC inspector |
| **Debug JSON** | Collapsed snapshot for debugging |

Related routes:

- **`/research/stimulus`** — Stimulus-aligned lab: file or line-in, transport, markers, performance archive, clock relay.
- **`/research/concert`** — Read-only observer: bands, timeline, markers, last stimulus clock (for performance / second screen).
- **`/recordings`** — **Server disk recording** control panel (Node writes session folders under `data/session_recordings/` by default).

---

## Ingest paths

1. **Direct bridge** — `server-enhanced.js` + Swift LibMuse or Python Athena BLE; WebSocket `eeg`, `bandPowers`, `motionData`, `battery`, etc.
2. **Mind Monitor OSC** — UDP `:5000` into Node; EEG and `/muse/ppg` (and friends) forwarded to clients. `mindMonitorMode` toggles Mind Monitor–style client sim FFT options; **band edges** are controlled by **`bandEdgePreset`**, not only this toggle.
3. **Client simulator** — `clientSim` feeds the same store paths for UI testing.

Device heuristics: `web/lib/researchDeviceProfile.ts` (Muse 2 vs Athena vs Ganglion, etc.).

---

## Band integration preset (`bandEdgePreset`)

**Purpose:** Align δ–γ **Welch bins** on the server with the **browser biquad trace bank** and **FFT shading**, and reduce very-slow drift in the δ bucket on wearable EEG.

| Preset | δ low edge | Other bands |
|--------|------------|-------------|
| `neurovis` | 0.5 Hz | NeuroVis defaults |
| `research_dc` | 1 Hz (Mind Monitor δ floor) | θ–γ NeuroVis defaults |
| `mindmonitor` | Full Mind Monitor manual | α 7.5–13 Hz, γ 30–44 Hz, … |

- **Client:** `web/lib/bandFilters.ts`, `web/lib/bandEdgePreset.ts`, Zustand `bandEdgePreset`, `AppShell` applies `bandFilters.setEdgeProfile`.
- **Server:** `settings.bandEdgePreset` in `server-enhanced.js`; `calculateBandPowersFromEEG()` uses matching ranges.
- **Persistence:** `localStorage` + `POST /api/settings` + WebSocket `settings_updated` / `init`.

**FFT charts:** `FFTChart` shades bands from the same preset unless `bandShadingRanges` is overridden (e.g. Mind Monitor page).

See: **Research → Baseline & signal conditioning → Band integration preset**.

---

## Time, markers, and stimulus sync

| Concept | Where | Use |
|--------|--------|-----|
| **`wall_ms`** | EEG rows, rolling timeline, events | Merge streams, HTTP/OSC markers, absolute time |
| **`t_ms`** | Full-rate `*.eeg.csv`, `*.bands.csv`, annotations | Within-session indexing from recorder start |
| **`recording_anchor_wall_ms`** | Recorder / disk manifest | Anchor browser capture to wall time |
| **`stimulus_clock` / `audioPositionMs`** | Research events API, Python relay, Stimulus clock relay | Stimulus timeline for concert / analysis |
| **`lastStimulusClock`** | Store | Concert observer readout without flooding `researchEvents` |

**HTTP:** `POST /api/research-event` (optional secret) → bridge broadcasts `research_event` WebSocket messages.

**Stimulus page:** `web/lib/stimulusSession.ts`, `StimulusAlignedLab`, `StimulusClockRelayCard`, `web/lib/stimulusClockRelay.ts`.

---

## Capture modalities

### 1. In-browser session recorder

- **Code:** `web/lib/recorder.ts`, **Research →** capture panel.
- **Outputs:** `*.eeg.csv` (full rate + `wall_ms` + `artifact`), `*.bands.csv`, `*.manifest.json`, `annotations.csv`, optional `epochs_summary.json`, BIDS stubs.
- **Channel layout:** `web/lib/researchDeviceProfile.ts` (`getRecorderEegLayout`).

### 2. Server disk session recorder

- **Code:** `server-session-disk.js`; HTTP `POST /api/session_recording/start|stop`, `GET /api/session_recording/status`, `POST /api/session_recording/annotate`.
- **Why:** Long runs without keeping a browser tab open; same CSV/manifest family as browser recorder (see server implementation for segment rollover).
- **UI:** `/recordings`.
- **Output dir:** `data/session_recordings/` (gitignored).

### 3. Rolling research export (Event Lab)

- **Code:** `web/lib/researchExportBundle.ts`.
- **Outputs:** `eegstream.csv` (UI-rate timeline), `events.csv`, `channels.tsv`, `eeg.json`, `provenance.json`.
- **Schema:** Documented on **Research → Downstream analysis**.

### 4. Stimulus-aligned capture

- **Route:** `/research/stimulus`.
- **Manifest:** `manifest.stimulus`, `stimulus_events.json`, optional performance WebM; aligns EEG rows to stimulus clock when capture is started with stimulus alignment.

---

## Motion and PPG

- **WebSocket:** `motionData` with `sensor: accel | gyro | ppg | fnirs`.
- **Mind Monitor:** `/muse/ppg` also mirrored into `motion.ppg` from `mindMonitorOsc` when needed (`web/lib/store.ts`).
- **Research PPG panel:** driven from `motion.ppg` and rolling history (`useResearchPageModel`).

---

## Hydration / client prefs

- **`eegTraceSource`** and **`bandEdgePreset`** hydrate from `localStorage` after mount to avoid Next.js SSR mismatches (`AppShell` + store actions).

---

## Downstream analysis

- **In-app:** `/research#research-downstream` — tool links + CSV import mapping tables.
- **Offline:** MNE-Python, EEGLAB, BIDS workflows; see card for vetted links.

---

## Key files (index)

| Area | Paths |
|------|--------|
| Research page | `web/app/research/page.tsx`, `web/hooks/useResearchPageModel.ts` |
| Stimulus | `web/app/research/stimulus/`, `web/components/research/StimulusAlignedLab.tsx` |
| Concert observer | `web/app/research/concert/` |
| Store / ingest | `web/lib/store.ts`, `web/lib/useWebSocket.ts` |
| Recorder | `web/lib/recorder.ts` |
| Research types / timeline | `web/lib/researchTypes.ts`, `web/lib/stimulusSession.ts` |
| Bridge | `server-enhanced.js`, `server-session-disk.js` |
| Python relay | `neurovis-server.py` (e.g. `audioPositionMs` forwarding) |

---

## Revision

Update this doc when you add new export columns, API routes, or sync fields so **Downstream analysis** and **manifest** examples stay in sync.
