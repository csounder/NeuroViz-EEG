# NeuroVis Integration Progress Report

## ✅ Completed While You Were Away

### 1. Server Endpoints Added

**File**: `server-enhanced.js`

✅ **`/api/timeseries`** endpoint (lines 1570-1615)

- Returns raw EEG samples for Traces view
- 4-second window, downsampled to max 512 points
- Format matches NeurOSC style

✅ **`/api/fft`** endpoint (lines 1617-1680)

- Returns frequency spectrum data
- 0.5-40 Hz range
- Power in dB scale per channel
- _Note: Currently uses placeholder algorithm - should integrate with DSP pipeline FFT_

### 2. Display Options Reorganized

**File**: `public/index.html` (lines 4329-4353)

✅ **New order implemented** with numbered views 1-19:

1. Power + Timeline
2. FFT + Bands (combined)
3. 3D Waterfall
4. **Traces (NeurOSC)** ⭐ NEW
5. **FFT Spectrum** ⭐ NEW
6. **Band Powers** ⭐ NEW
7. **Mental State** ⭐ NEW
8. Neuro Indices
9. Phase
10. Coherence
11. PPG/HR-Muse
12. IMU-Muse
13. fNIRS-Athena
14. Sensor Connect
15. Processing
16. Presets
17. OSC Settings
18. OSC Monitor
19. Recording

All views now available in quad view dropdowns!

### 3. Documentation Created

✅ **`SIMULATOR-FIX-PLAN.md`** - Technical analysis of simulator issues
✅ **`MEETING-SUMMARY.md`** - Status summary and questions
✅ **`DISPLAY-INTEGRATION-PLAN.md`** - Detailed implementation plan
✅ **`PROGRESS-REPORT.md`** - This file

## ⏳ In Progress

### New View Components Need Implementation

The view IDs are registered in `displayOpts`, but the actual React components need to be created:

#### 4. Traces View (id: "traces")

**What it does**: Shows raw EEG waveforms (like NeurOSC timeseries)
**Data source**: `/api/timeseries` endpoint (✅ ready)
**Component**: Needs to be added around line 5370
**Implementation**:

```javascript
view === "traces" &&
  h(
    Card,
    { t: th, title: "EEG Traces (NeurOSC Style)" },
    h(
      "div",
      { style: { fontSize: 8, color: th.t3, marginBottom: 6 } },
      "4-channel raw EEG waveforms. 4-second window showing microVolt fluctuations across all electrodes."
    ),
    h(TracesView, {
      t: th,
      time: time,
      dev: dev,
      autoScale: autoScales.traces,
      yAxisRange: yAxisRanges.traces,
    }),
  ),
```

**Component definition needed** (around line 3000):

```javascript
function TracesView(p) {
  // Poll /api/timeseries endpoint
  // Render Chart.js line chart
  // 4 channels, different colors
  // X-axis: time (seconds)
  // Y-axis: amplitude (µV)
}
```

#### 5. FFT Spectrum View (id: "spectrum")

**What it does**: Shows frequency spectrum only (not combined with bands)
**Data source**: `/api/fft` endpoint (✅ ready)
**Component**: Needs to be added around line 5380
**Component definition needed**:

```javascript
function SpectrumView(p) {
  // Poll /api/fft endpoint
  // Render Chart.js line chart
  // X-axis: Frequency (Hz)
  // Y-axis: Power (dB)
  // Color-code frequency regions (delta/theta/alpha/beta/gamma)
}
```

#### 6. Band Powers View (id: "bands")

**What it does**: Shows band power bars only (not combined with FFT)
**Data source**: `/api/bands` endpoint (✅ already exists)
**Component**: Needs to be added around line 5390
**Component definition needed**:

```javascript
function BandPowersView(p) {
  // Poll /api/bands endpoint (already working)
  // Render Chart.js horizontal bar chart
  // Grouped bars: one group per channel
  // 5 bars per channel (delta/theta/alpha/beta/gamma)
  // Color-coded: delta=purple, theta=blue, alpha=green, beta=yellow, gamma=red
}
```

#### 7. Mental State View (id: "mentalstate")

**What it does**: Shows engagement, meditation, focus metrics (like NeurOSC)
**Data source**: `/api/bands` endpoint + calculations
**Component**: Needs to be added around line 5400

**Calculations needed** (from NeurOSC):

```javascript
function calculateMentalState(bandPowers) {
  // bandPowers = { delta, theta, alpha, beta, gamma } per channel

  // Engagement Index: Beta / (Alpha + Theta)
  const engagement = beta / (alpha + theta + 0.001);
  const engagementNorm = Math.max(0, Math.min(5, engagement));

  // Meditation Score: (Alpha + Theta) / totalPower
  const totalPower = delta + theta + alpha + beta + gamma;
  const meditation = (alpha + theta) / totalPower;

  // Focus Score: Beta / totalPower
  const focus = beta / totalPower;

  // State Classification
  let state = "Calm";
  if (delta > 0.4) state = "Drowsy";
  else if (alpha > 0.35 && beta < 0.25) state = "Meditative";
  else if (beta > 0.3) state = "Focused";

  return { engagement: engagementNorm, meditation, focus, state };
}
```

**Component definition needed**:

```javascript
function MentalStateView(p) {
  // Poll /api/bands endpoint
  // Calculate engagement/meditation/focus per channel
  // Average across channels
  // Display:
  //   - Large number for primary metric (engagement)
  //   - Color-coded bars (green=good, yellow=moderate, red=low)
  //   - State label with icon ("😌 Calm", "🧘 Meditative", "🎯 Focused", "😴 Drowsy")
  //   - Per-channel breakdown
}
```

### Other Stub Views

These IDs exist in displayOpts but don't have implementations yet:

- **Processing** (id: "processing") - DSP settings panel?
- **Presets** (id: "presets") - Save/load configurations
- **OSC Settings** (id: "osc") - Could link to existing sidebar settings
- **Recording** (id: "recording") - Could link to existing sidebar recording

## ❌ Not Started

### View Toolbar + Dropdown UI

**Location**: Needs to be added to main layout (around line 4600)

**Required HTML structure**:

```javascript
// Add before main panel rendering
h(
  "div",
  { className: "view-toolbar", style: { /*...*/ } },
  // First 10-12 most common views as buttons
  h("button", {
    className: "view-btn" + (view === "timeline" ? " active" : ""),
    onClick: () => setView("timeline")
  }, "Power+Timeline"),
  h("button", {
    className: "view-btn" + (view === "fft" ? " active" : ""),
    onClick: () => setView("fft")
  }, "FFT+Bands"),
  // ... more buttons ...

  // Dropdown for all views
  h("div", { className: "view-dropdown" },
    h("button", { className: "dropdown-toggle" }, "More ▾"),
    h("div", { className: "dropdown-menu" },
      // All 19 views as dropdown items
    )
  )
),
```

**Required CSS** (add to `<style>` section):

```css
.view-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.view-btn {
  padding: 8px 16px;
  border-radius: 999px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.view-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.view-btn.active {
  background: var(--accent);
  color: var(--bg-primary);
  box-shadow: 0 0 14px var(--accent-glow);
}

.view-dropdown {
  position: relative;
  margin-left: auto;
}

.dropdown-toggle {
  /* Same styles as view-btn */
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  min-width: 200px;
  max-height: 400px;
  overflow-y: auto;
  display: none; /* Toggle with JavaScript */
}

.dropdown-menu.open {
  display: block;
}

.dropdown-item {
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.dropdown-item:hover {
  background: var(--bg-hover);
}

.dropdown-item.active {
  background: var(--accent-glow);
  color: var(--accent);
}
```

## 🔧 Fixes Still Needed

### 1. Simulator Display Issue (CRITICAL)

**Status**: Data flowing via WebSocket but UI not rendering
**Root cause**: React UI polling `/api/bands` gets data but doesn't update visualization
**Next debug step**: Add console.log to React render cycle to see if data is triggering re-renders

### 2. FFT Endpoint Algorithm

**Status**: Placeholder algorithm in place
**TODO**: Integrate with existing DSP pipeline FFT calculations instead of generating synthetic spectrum

## 📋 Remaining Work Estimate

| Task                                | Time           | Status      |
| ----------------------------------- | -------------- | ----------- |
| Fix simulator display bug           | 1-2 hours      | 🔴 Critical |
| Implement TracesView component      | 1 hour         | ⏳          |
| Implement SpectrumView component    | 1 hour         | ⏳          |
| Implement BandPowersView component  | 30 min         | ⏳          |
| Implement MentalStateView component | 1 hour         | ⏳          |
| Add view toolbar UI                 | 1 hour         | ⏳          |
| Add dropdown menu                   | 30 min         | ⏳          |
| Implement Processing/Presets/etc    | 2 hours        | ⏳          |
| Test all views                      | 1 hour         | ⏳          |
| **Total**                           | **9-10 hours** |             |

## 🎯 Recommended Next Steps

1. **Fix simulator first** - Critical blocker for testing
2. **Implement Traces view** - Easiest new view, good for testing
3. **Implement Mental State view** - High value feature
4. **Add toolbar UI** - Better navigation
5. **Implement remaining views** - Fill in the gaps
6. **Polish and test** - Make sure everything works

## 📝 Notes

- All server endpoints are ready (/api/timeseries, /api/fft, /api/bands)
- Display options array is reorganized with all 19 views
- Quad view dropdowns will show all options automatically
- NeurOSC mental state calculations are documented and ready to port
- View rendering pattern is consistent - easy to add new views

## 🚀 When You Return

Please confirm:

1. Should I prioritize fixing the simulator or implementing new views?
2. Are the view names/order correct (1-19 as listed)?
3. What should "Processing" view show? (DSP settings panel?)
4. What should "Presets" view show? (Save/load UI?)

Ready to continue when you are!

---

**Current Server Status**: Running on PID 15660, simulator ON, new endpoints active
**Files Modified**: `server-enhanced.js`, `public/index.html`
**Tests Needed**: Simulator display, new endpoints, new view components
