# Research mode: EEG paths, conditioning, and the Conditioning lab

NeuroVis splits **waveform traces in the browser** from **band power messages** and **OSC output**. This matches **Research → Baseline & signal conditioning** and **Conditioning lab**.

## 1. EEG traces (browser charts / band-pass trace bank)

Chosen with **EEG traces in the browser** (`localStorage`: `neurovis.eegTraceSource`).

| Mode | WebSocket field | Server `dsp.js`? | Client `dspPipeline`? |
|------|-----------------|------------------|-------------------------|
| **Server conditioned** | `eeg.processed` (fallback `raw`) | Yes — `/api/dsp/config` | No |
| **Device raw** | `eeg.raw` | No | No |
| **Browser dspPipeline** | `eeg.raw` then filtered in-tab | No | Yes (when master + CAR on) |

Band power WebSocket messages and `/api/bands` always follow the **server** pipeline (`applyBaseline`, `logTransform`, rolling window).

## 2. Server µV conditioning (`dsp.js`)

Typical open-toolkit steps (compare [MNE preprocessing](https://mne.tools/stable/documentation/cookbook.html), [Braindecode filters](https://braindecode.org/stable/auto_examples/model_building/plot_preprocessing_classes.html)):

- **Common average reference (CAR)** — spatial noise reduction  
- **Bandpass** — configurable high-/low-pass corners (presets: wide 1–45 Hz, narrow 4–40 Hz, 0.5–48 Hz)  
- **Notch** — 50 or 60 Hz mains  
- **3-point running median** (optional) — short impulse rejection after bandpass  
- **EMA smoothing** — time-domain µV smoothing before output  

Heavy methods (ICA, ASR, Maxwell) are **not** implemented in Node; use offline tools for those.

## 3. Relative band z-score (server)

- **Z-score relative band powers** + **Log₁₀** apply to **relative** values before broadcast/OSC.  
- **Rolling baseline window** sets history length (`BASELINE_BAND_RATE_HZ` in `server-enhanced.js`).  
- **Absolute** FFT/dB bands are **not** z-scored by this path.

## 4. Conditioning lab (graphs)

**Research → Conditioning lab** provides:

- **EEG µV**: overlay **raw** vs **server-processed** from the same packets; grid; auto or manual Y scale; **markers A / B** (click / Shift+click) with Δt, interval RMS, and interpolated voltages.  
- **Relative band**: instantaneous relative power vs **EMA** (display-only smoothing).  

Plots use **device pixel ratio** for sharp lines. Dashboard EEG over WebSocket is ~**10 Hz**; the doc text in the UI states this explicitly.

## 5. Mains notch

**50 Hz** vs **60 Hz** — notch biquad center frequency.

## Files

- Server: `dsp.js`, `server-enhanced.js`  
- Client DSP: `web/lib/dspPipeline.ts`  
- Store: `web/lib/store.ts` (`eegTraceSource`)  
- UI copy: `web/lib/eegTraceSourceInfo.ts`  
- Lab: `web/components/research/ResearchConditioningLab.tsx`
