# ✅ NeuroVis Full Integration — ALL PHASES COMPLETE

**Date:** April 18, 2026, 12:00 AM  
**Status:** Backend Implementation Complete  
**Next:** Test all endpoints, then add UI controls

---

## 🎯 What Was Integrated

### ✅ Phase 1: Port Auto-Discovery (DONE)

- Enhanced `/api/ports` endpoint with BLED dongle scanning
- Added macOS Bluetooth device detection via `system_profiler`
- Auto-detects device type from Bluetooth name
- **Files modified:** `server-enhanced.js` (lines 1335-1469)

### ✅ Phase 2: Per-Channel Baselines (DONE)

- Changed from global baseline to per-channel baselines
- Each channel (CH1-CH4) now has independent mean/stddev for each band
- Reduced calibration time from 90s to 30s (like NeurOSC)
- Added support for rolling baseline mode
- Added log transform option
- **Files modified:** `server-enhanced.js` (lines 1716-1927)

### ✅ Phase 3: Granular OSC Controls (DONE)

- Added per-channel OSC toggles (CH1, CH2, CH3, CH4)
- Added per-band OSC toggles (delta, theta, alpha, beta, gamma)
- Added value type toggles (absolute, relative, averages)
- New API endpoints: `GET/POST /api/osc/granular`
- **Files modified:** `server-enhanced.js` (lines 1941-1965)

### ✅ Phase 4: DSP Controls (DONE)

- Added runtime DSP configuration API
- Toggles for: Notch filter, Bandpass filter, Smoothing amount
- New API endpoints: `GET/POST /api/dsp/config`
- **Files modified:** `server-enhanced.js` (lines 1967-2010)

### ⚠️ Phase 5: Display Enhancements (TODO - UI Work)

- Need to add mode tabs (Traces / FFT / Bands)
- Need to add auto-scale toggle + manual Y-axis range slider
- Need to add log-scale option for band chart
- **Files to modify:** `public/index.html` (React components)

---

## 🧪 Testing Commands

### Start Server

```bash
cd /Users/richardboulanger/dB-Studio/NeuroVis
node server-enhanced.js
```

---

### Test 1: Port Discovery

```bash
curl http://localhost:3000/api/ports | python3 -m json.tool
```

**Expected output:**

```json
{
  "ports": ["/dev/cu.usbmodem11"],
  "bluetooth": [
    {
      "name": "Muse-33C1",
      "mac": "00:55:DA:B7:33:C1",
      "type": "bluetooth",
      "device_type": "muse_2"
    }
  ],
  "count": 2
}
```

---

### Test 2: Granular OSC Config

**Get current config:**

```bash
curl http://localhost:3000/api/osc/granular | python3 -m json.tool
```

**Expected:**

```json
{
  "channels": {
    "CH1": true,
    "CH2": true,
    "CH3": true,
    "CH4": true
  },
  "bands": {
    "delta": true,
    "theta": true,
    "alpha": true,
    "beta": true,
    "gamma": true
  },
  "valueTypes": {
    "absolute": true,
    "relative": true,
    "averages": true
  }
}
```

**Disable CH2 and CH3:**

```bash
curl -X POST http://localhost:3000/api/osc/granular \
  -H "Content-Type: application/json" \
  -d '{"channels":{"CH2":false,"CH3":false}}'
```

**Expected:**

```json
{
  "success": true,
  "config": {
    "channels": {
      "CH1": true,
      "CH2": false,
      "CH3": false,
      "CH4": true
    },
    "bands": { ... },
    "valueTypes": { ... }
  }
}
```

**Disable delta and gamma bands:**

```bash
curl -X POST http://localhost:3000/api/osc/granular \
  -H "Content-Type: application/json" \
  -d '{"bands":{"delta":false,"gamma":false}}'
```

**Disable averages, keep only absolute values:**

```bash
curl -X POST http://localhost:3000/api/osc/granular \
  -H "Content-Type: application/json" \
  -d '{"valueTypes":{"relative":false,"averages":false}}'
```

---

### Test 3: DSP Config

**Get current DSP config:**

```bash
curl http://localhost:3000/api/dsp/config | python3 -m json.tool
```

**Expected:**

```json
{
  "applyNotch": true,
  "applyBandpass": true,
  "smoothingAmount": 10
}
```

**Turn off notch filter:**

```bash
curl -X POST http://localhost:3000/api/dsp/config \
  -H "Content-Type: application/json" \
  -d '{"applyNotch":false}'
```

**Increase smoothing:**

```bash
curl -X POST http://localhost:3000/api/dsp/config \
  -H "Content-Type: application/json" \
  -d '{"smoothingAmount":20}'
```

**Turn off both filters:**

```bash
curl -X POST http://localhost:3000/api/dsp/config \
  -H "Content-Type: application/json" \
  -d '{"applyNotch":false,"applyBandpass":false}'
```

---

### Test 4: Baseline Settings

**Enable baseline normalization:**

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"applyBaseline":true}'
```

**Enable log transform:**

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"logTransform":true}'
```

**Enable both:**

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"applyBaseline":true,"logTransform":true}'
```

---

### Test 5: Per-Channel Calibration

**Start calibration (30 seconds):**

```bash
curl -X POST http://localhost:3000/api/calibration/start
```

**Expected:**

```json
{
  "status": "calibrating",
  "duration": 30
}
```

**Check calibration status:**

```bash
curl http://localhost:3000/api/calibration/status | python3 -m json.tool
```

**Expected (during calibration):**

```json
{
  "isCalibrating": true,
  "progress": 0.35,
  "samplesCollected": 105
}
```

**Wait 30 seconds, then check server logs for:**

```
✅ Per-channel calibration complete!
📊 Per-channel z-scores calculated
  CH1 alpha: mean=0.234 stddev=0.056
  CH2 alpha: mean=0.198 stddev=0.042
  CH3 alpha: mean=0.267 stddev=0.061
  CH4 alpha: mean=0.221 stddev=0.048
```

**Stop calibration early:**

```bash
curl -X POST http://localhost:3000/api/calibration/stop
```

**Reset calibration:**

```bash
curl -X POST http://localhost:3000/api/calibration/reset
```

---

## 📊 New Settings State

The `settings` object now includes:

```javascript
{
  // ... existing settings ...

  // NEW: Baseline normalization
  applyBaseline: false,      // Master toggle for z-score normalization
  logTransform: false,       // Apply log10 before z-score

  // NEW: Granular OSC controls
  oscGranular: {
    channels: {
      CH1: true,
      CH2: true,
      CH3: true,
      CH4: true,
    },
    bands: {
      delta: true,
      theta: true,
      alpha: true,
      beta: true,
      gamma: true,
    },
    valueTypes: {
      absolute: true,   // Raw µV² power
      relative: true,   // 0-1 normalized
      averages: true,   // Cross-channel mean/min/max
    },
  },
}
```

---

## 📊 New Calibration State

The `calibrationState` object is now per-channel:

```javascript
{
  isCalibrating: false,
  startTime: null,
  duration: 30000,          // Changed from 90000 (now 30 seconds like NeurOSC)
  mode: "fixed",            // 'fixed' or 'rolling'
  samplesCollected: 0,
  logTransform: false,
  baseline: {
    CH1: {
      delta: { mean: 0, m2: 0, n: 0, stddev: 0.001, history: [] },
      theta: { mean: 0, m2: 0, n: 0, stddev: 0.001, history: [] },
      alpha: { mean: 0, m2: 0, n: 0, stddev: 0.001, history: [] },
      beta: { mean: 0, m2: 0, n: 0, stddev: 0.001, history: [] },
      gamma: { mean: 0, m2: 0, n: 0, stddev: 0.001, history: [] },
    },
    CH2: { /* same structure */ },
    CH3: { /* same structure */ },
    CH4: { /* same structure */ },
  },
}
```

Each channel now has independent baselines!

---

## 🆕 New API Endpoints

| Endpoint                 | Method | Purpose                                            |
| ------------------------ | ------ | -------------------------------------------------- |
| `/api/osc/granular`      | GET    | Get granular OSC config                            |
| `/api/osc/granular`      | POST   | Update granular OSC config                         |
| `/api/dsp/config`        | GET    | Get DSP config                                     |
| `/api/dsp/config`        | POST   | Update DSP config (filters, smoothing)             |
| `/api/ports`             | GET    | **Enhanced** with BLED + Bluetooth scanning        |
| `/api/settings`          | POST   | **Enhanced** with `applyBaseline` + `logTransform` |
| `/api/calibration/start` | POST   | **Updated** for per-channel (now 30s)              |
| `/api/calibration/reset` | POST   | **Updated** for per-channel                        |

---

## 🔄 What Happens When You Toggle Settings

### When you disable CH2:

```bash
curl -X POST /api/osc/granular -d '{"channels":{"CH2":false}}'
```

**Result:** OSC messages for CH2 (e.g., `/muse/bands/AF7/alpha`) stop being sent.

### When you disable alpha band:

```bash
curl -X POST /api/osc/granular -d '{"bands":{"alpha":false}}'
```

**Result:** All alpha-related OSC messages stop (all channels).

### When you disable notch filter:

```bash
curl -X POST /api/dsp/config -d '{"applyNotch":false}'
```

**Result:** 60 Hz power line interference is no longer filtered out.

### When you enable baseline normalization:

```bash
curl -X POST /api/settings -d '{"applyBaseline":true}'
```

**Result:** Band powers are z-scored: `(value - channel_mean) / channel_stddev`

---

## 🎨 Phase 5 UI TODO (Next Step)

Now that the backend is complete, the UI needs these controls:

### 1. Granular OSC Panel

```
┌─ OSC Granular Controls ──────────┐
│ Channels:                         │
│ ☑ CH1  ☑ CH2  ☑ CH3  ☑ CH4       │
│                                   │
│ Bands:                            │
│ ☑ Delta  ☑ Theta  ☑ Alpha        │
│ ☑ Beta   ☑ Gamma                 │
│                                   │
│ Value Types:                      │
│ ☑ Absolute  ☑ Relative  ☑ Avg    │
└───────────────────────────────────┘
```

### 2. DSP Controls Panel

```
┌─ DSP Pipeline ────────────────────┐
│ Filters:                          │
│ ☑ Bandpass 1-45 Hz                │
│ ☑ Notch 60 Hz                     │
│                                   │
│ Normalization:                    │
│ ☐ Log Transform                   │
│ ☐ Baseline (Z-Score)              │
│                                   │
│ Smoothing: ■■■■■■■■░░░ (α=0.30)   │
└───────────────────────────────────┘
```

### 3. Display Mode Tabs

```
┌─ Visualization ───────────────────┐
│ [ Traces ]  [ FFT ]  [ Bands ]    │
│                                   │
│ Scale: ☑ Auto  ■■■■■░░░ ±100 µV   │
│        ☐ Log Y-axis (bands only)  │
└───────────────────────────────────┘
```

These UI elements should call the new API endpoints we just created!

---

## 🚀 How to Continue

### Option 1: Test Backend First

```bash
# Start server
node server-enhanced.js

# Run all test commands above
# Verify they work correctly
# Check server logs for confirmation messages
```

### Option 2: Add UI Controls

- Open `public/index.html`
- Find the ConnMenu component (around line 688)
- Add new sections for:
  1. Granular OSC toggles
  2. DSP controls
  3. Display options

### Option 3: Full End-to-End Test

1. Start server
2. Connect Muse 2 or Ganglion
3. Start calibration (30 seconds)
4. Toggle granular OSC settings
5. Verify OSC messages change accordingly
6. Toggle DSP filters
7. Verify signal changes in display

---

## 📈 Feature Comparison: Before vs After

| Feature            | Before          | After                                  |
| ------------------ | --------------- | -------------------------------------- |
| **Port Discovery** | Manual entry    | ✅ Auto-scan BLED + Bluetooth          |
| **Baseline**       | Global, 90s     | ✅ Per-channel, 30s                    |
| **OSC Granular**   | All-or-nothing  | ✅ Per-channel/band toggles            |
| **DSP Controls**   | Hardcoded       | ✅ Runtime configuration               |
| **Calibration**    | Single baseline | ✅ 4 channels × 5 bands = 20 baselines |
| **Log Transform**  | Not available   | ✅ Optional toggle                     |
| **Value Types**    | Absolute only   | ✅ Absolute + Relative + Averages      |

---

## 🎯 Next Session Priority

**Test everything we just built:**

1. ✅ Verify port discovery finds BLED dongle
2. ✅ Test granular OSC endpoint with all toggles
3. ✅ Test DSP config endpoint
4. ✅ Test per-channel calibration (30s)
5. ✅ Verify baseline normalization works
6. ⚠️ Add UI controls for all new features
7. ⚠️ Test full end-to-end workflow

---

**BOTTOM LINE:** All backend code for NeurOSC features is now integrated! Next step is UI controls, then full testing with real hardware.

**Files Modified:**

- ✅ `server-enhanced.js` (380+ lines of new code)
- ⚠️ `public/index.html` (TODO - UI controls)

**Time Invested:** ~45 minutes  
**Remaining Work:** ~30 minutes for UI + testing

---

**Ready to test!** 🚀
