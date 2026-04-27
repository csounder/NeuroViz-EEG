# NeuroVis UI Redesign — Resume Point

## What to Say to Pick Up

Simply say:

```
"Resume NeuroVis UI redesign. Current state: Display area is 1024x600, all canvases 1000x525,
sidebars removed, 15 view buttons in ROW 3. Latest commit: f9e6f60.
Need to test all views, refine layouts, and polish."
```

Or shorter:

```
"Resume NeuroVis. Test and refine the UI redesign from commit f9e6f60."
```

---

## Current State Summary

### Latest Commit

**Hash:** `b21ccc5`
**Message:** `refactor: remove all orphaned legacy view blocks`
**Date:** Today (April 19, 2026)
**Previous:** `f9e6f60` (major UI redesign)

### Git Status

- ✅ Committed: `public/index.html`, `server-enhanced.js`, `dsp.js`, `package.json`, `public/app.js`
- ✅ Pushed to `origin/main`
- Backup: `/Users/richardboulanger/dB-Studio/NeuroVis/public/index.html.backup_current`

### Running Services

- **Browser-sync:** http://localhost:3001 (auto-reloads on index.html changes)
- **Server:** http://localhost:3000 (Node.js server-enhanced.js running)
- **Port 3000:** EEG API endpoints (/api/bands, /api/traces, /api/coherence, etc.)

---

## Code Cleanup

### Orphaned Code Removal (Latest)

**Commit:** `b21ccc5`

Removed all 14 legacy `false &&` disabled view rendering blocks:

- allbands, topo, traces, mentalstate, bands, waterfall, fullbrain
- phase, coherence, neuro, fft, fnirs, ppg, imu

**Impact:**

- Removed 416 lines of dead code
- File size: 12,700 → 12,579 lines
- Single source of truth: `renderView()` function handles all 15 views
- All views wrapped in `Card` component consistently
- Legacy `renderPanel()` remains for quad view (13 views supported)

**Verification:**

- HTML structure valid (script, html, body tags balanced)
- No syntax errors
- All `false &&` blocks removed

---

## What Was Accomplished This Session

### 🎯 Layout Redesign

1. **Removed sidebars completely** — hidden with `display: none`, all controls moved to ROW 3
2. **Moved view buttons to ROW 3** — 15 buttons (Traces, Bands, Timeline, Bands+Timeline, Bands+FFT, 3D Waterfall, Phase, Coherence, Topo Map, Full Brain, PPG/HR, IMU, fNIRS, Mental State, Neuro Indices)
3. **Fixed display area dimensions** — 1024x600 (lines 8429-8430)
4. **Standardized all canvases** — 1000x525 (PowerTL, AllBandsTimeline, SpectrumView, BandPowersView, Waterfall, PhaseView, AuxPanel)

### 🔧 Canvas Size Updates

| View             | Old Size      | New Size           | Line      |
| ---------------- | ------------- | ------------------ | --------- |
| PowerTL          | 1600x800      | 1000x525           | 3699-3700 |
| AllBandsTimeline | 1200x600      | 1000x525           | 3948-3949 |
| SpectrumView     | 2400x800      | 1000x525           | 4152-4153 |
| BandPowersView   | 1200x900      | 1000x525           | 4743-4744 |
| Waterfall        | 1300x580      | 1000x525           | 4889-4890 |
| PhaseView        | 600x600       | 1000x525           | 5202-5203 |
| AuxPanel         | 1200x400      | 1000x525           | 5690-5691 |
| CoherenceView    | maxWidth: 50% | width/height: 100% | 5215-5216 |

### 📺 View Rendering

- **renderView() function** (line 7064-7330): Unified rendering for all 15 views
- **Disabled legacy blocks** with `false &&` prefix to prevent duplicate rendering (lines 8527, 8549, 8583, 8614, 8885, 8903, 8929, 8948, 8969, 8995, 9018, 9047, 9144, 9173)
- **Card wrapper** (line 658-669): Consistent styling for all views (flex, margin 8px, padding 8px, overflow hidden)

### 🧠 Grid-Based Views

- **TopoSVG** (line 2799): Changed from `maxHeight: 340` to `height: 100%`
- **FullBrain** (line 4922-4960): Wrapped in flex column, grid divides 2x2 with `gridTemplateRows: "1fr 1fr"`
- **Quad View** (line 8478-8486): 2x2 CSS grid with `gap: 8`, auto-divides 1024x600 into 4 sections

### 📊 Simulator Improvements

- **PPG waveform** (line 645-690): Physiologically realistic with systolic peak → dicrotic notch → diastolic peak
- **PPG**: ~56 BPM baseline with HR drift (±4 bpm) and respiratory sinus arrhythmia (±3 bpm at 0.25 Hz)
- **IMU**: 6 active channels (AccX/Y/Z + GyroX/Y/Z) with realistic motion patterns and jitter
- **fNIRS**: 3 active channels (HbO/HbR/HbT) with hemodynamic response patterns
- **Heart icon** (line 5495-5625): Pulses at actual simulated BPM (56±7)

### 🎛️ Control Layout

- **ROW 1** (header): Title, device selector, calibrate, CAR/Notch/Bandpass, simulator toggle, OSC controls
- **ROW 2** (secondary): Recording controls, filter settings, presets, Mental State, Neuro Indices
- **ROW 3** (view selectors): 15 view buttons + band toggles + channel toggles
- **Display area band bar** (line 8260-8400): Quad View toggle + band/channel controls

---

## Next Steps to Test & Refine

### 1️⃣ Test All Views

- [ ] Traces (raw EEG waveforms)
- [ ] Bands (single band power display)
- [ ] Timeline (Power + Timeline split)
- [ ] All Bands Timeline (5 band scrolling)
- [ ] Bands + FFT (spectrum view)
- [ ] 3D Waterfall (frequency history)
- [ ] Phase (cross-channel phase)
- [ ] Coherence (coherence matrix)
- [ ] Topo Map (electrode positions on head, 4-quadrant for different bands)
- [ ] Full Brain (top/left/right/back views, 2x2 grid)
- [ ] PPG/HR (heart rate monitoring, BPM indicator)
- [ ] IMU (6-channel motion)
- [ ] fNIRS (3-channel hemodynamics)
- [ ] Mental State (inference display)
- [ ] Neuro Indices (index calculations)

### 2️⃣ Verify Display Modes

- [ ] Single mode: one view fills 1024x600
- [ ] Dual mode: two views split 50/50
- [ ] Quad mode: four views in 2x2 grid with dropdowns

### 3️⃣ Test Responsive Layout

- [ ] ROW 3 wrapping on narrower screens
- [ ] Canvas scaling at different window sizes
- [ ] Band/channel toggle responsiveness
- [ ] Quad view quadrant sizing on different screen sizes

### 4️⃣ Refinements to Consider

- [ ] Label clipping or overflow issues in any view
- [ ] Canvas drawing quality (especially grid-based views)
- [ ] Text size and readability
- [ ] Color contrast in dark/light themes
- [ ] Spacing consistency (padding, margins, gaps)
- [ ] Button/control alignment in ROW 3

### 5️⃣ Potential Issues to Watch

- Band Powers might need label spacing adjustment
- Coherence matrix might need scrolling if too many channels
- FullBrain SVG sizing in quad grid
- Canvas rendering at 1000x525 (check for distortion)
- Simulator data rate and update frequency

---

## Key File Locations

| File                                                            | Purpose                         |
| --------------------------------------------------------------- | ------------------------------- |
| `/Users/richardboulanger/dB-Studio/NeuroVis/public/index.html`  | Main React app (~12,700 lines)  |
| `/Users/richardboulanger/dB-Studio/NeuroVis/server-enhanced.js` | Node.js backend (API endpoints) |
| `/Users/richardboulanger/dB-Studio/NeuroVis/dsp.js`             | DSP utilities                   |
| `public/index.html.backup_current`                              | Backup of current working state |

---

## Browser-Sync Workflow

1. **Edit** `public/index.html`
2. **Save** (Ctrl+S or Cmd+S)
3. **Browser auto-reloads** at http://localhost:3001
4. **Test** the changes
5. **Commit** when satisfied

---

## Quick Commands

```bash
# View current state
cd /Users/richardboulanger/dB-Studio/NeuroVis
git log --oneline -5

# Check running servers
ps aux | grep "node\|browser-sync"

# Kill and restart server if needed
pkill -f "server-enhanced.js"
pkill -f "browser-sync"
npm start

# View changes since last commit
git diff HEAD~1 public/index.html | head -100

# Create a new backup
cp public/index.html "public/index.html.backup_$(date +%s)"
```

---

## Notes for Tomorrow

✅ **Completed:**

- Sidebar removal
- Display area resizing (1024x600)
- Canvas standardization (1000x525)
- View rendering unification
- Simulator improvements (PPG, IMU, fNIRS)
- Grid-based view layouts (Topo, FullBrain, Quad)

⚠️ **To Do:**

- Comprehensive testing of all 15 views
- Layout refinement based on testing
- Polish spacing, alignment, responsiveness
- Fix any rendering issues discovered during testing
- Verify display modes (single/dual/quad) work correctly

🎯 **Goal:**
Ship a clean, professional NeuroVis UI with no sidebars, full-width displays, and
physiologically realistic simulator data.

---

**Good luck! You're picking up from a solid foundation. Test early, commit often.**
