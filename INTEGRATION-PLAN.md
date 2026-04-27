# NeurOSC → NeuroVis Integration Plan

## Overview

Integrating proven features from the working NeurOSC (Python/FastAPI) system into NeuroVis (Node.js/Express).

---

## Key Features to Integrate

### 1. ✅ Port Auto-Discovery with Bluetooth Scanning

**From NeurOSC:** `main.py` lines 197-258

- Scans `/dev/tty.usbmodem*`, `/dev/cu.usbmodem*` (BLED112 dongles)
- Uses `system_profiler SPBluetoothDataType` to find paired Bluetooth devices
- Auto-detects device type from name (Ganglion, Muse 2, Muse 3, Muse Athena)
- Returns MAC addresses with device name and inferred type

**Status:** ✅ Implemented in NeuroVis

- Need to add this API endpoint to server-enhanced.js

---

### 2. ✅ Baseline Normalization / Calibration (Z-Score)

**From NeurOSC:** `openbci_service.py` lines 46-52, 146-172

```python
# Feature toggles
self.log_transform = False          # off by default
self.baseline_normalize = False     # off by default - needs 30s to stabilize
self.baseline_window_sec = 30.0
self._baseline_history: Dict[str, Dict[str, deque]] = {}
self._baseline_max_samples = int(self.baseline_window_sec / 0.1)

def normalize_band_power(self, ch_name: str, band_name: str, raw_power: float) -> float:
    """Log10 → z-score against rolling baseline."""
    value = raw_power

    if self.log_transform:
        value = np.log10(max(value, 1e-10))

    if not self.baseline_normalize:
        return float(value)

    # Store in rolling baseline history
    if ch_name not in self._baseline_history:
        self._baseline_history[ch_name] = {}
    if band_name not in self._baseline_history[ch_name]:
        self._baseline_history[ch_name][band_name] = deque(maxlen=self._baseline_max_samples)

    history = self._baseline_history[ch_name][band_name]
    history.append(value)

    # Need at least 10 samples before normalizing
    if len(history) < 10:
        return float(value)

    # Z-score: (value - mean) / std
    mean = np.mean(history)
    std = np.std(history)
    if std < 1e-10:
        return 0.0
    return float((value - mean) / std)
```

**What it does:**

1. **Rolling baseline window:** Stores last 30 seconds of band power values per channel/band
2. **Optional log transform:** Converts raw power to log10 scale first
3. **Z-score normalization:** `(value - baseline_mean) / baseline_std`
4. **Stabilization:** Waits for 10 samples (~1 second) before normalizing
5. **Per-channel, per-band:** Each channel/band pair has its own baseline

**Use cases:**

- **Initial calibration:** User sits still, eyes closed for 30 seconds → establishes baseline
- **Adaptive tracking:** Baseline updates continuously (rolling window)
- **Outlier detection:** Z-score > 2 indicates significant deviation from norm

**Status:** ⚠️ Partially exists in NeuroVis

- NeuroVis has zscore in `settings.scalingMode` but not per-channel rolling baseline
- Need to add baseline history tracking and proper z-score implementation

---

### 3. ✅ DSP Pipeline with Granular Controls

**From NeurOSC:** `openbci_service.py` lines 17-110

**Filters (all toggleable):**

- ✅ **CAR (Common Average Reference):** Spatial noise reduction
- ✅ **Bandpass 1-45 Hz:** Removes DC drift and high-frequency noise
- ✅ **Notch 60 Hz:** Power line interference
- ✅ **Artifact detection:** Amplitude spikes, movement, flatline

**Normalization (for OSC output):**

- ✅ **Log transform:** `log10(power)` before normalization
- ✅ **Baseline normalize:** Z-score against rolling 30s baseline

**Smoothing:**

- ✅ **Exponential moving average:** Adjustable alpha (0.05-1.0)
- ✅ **Per-channel smoothers:** Independent smoothing per channel

**Key difference from NeuroVis:**

- NeurOSC uses **stateless filters** (sosfiltfilt) on overlapping windows
- NeuroVis uses **stateful filters** → may cause edge artifacts

---

### 4. ✅ Granular OSC Control

**From NeurOSC:** `osc_sender.py` + UI

**Per-channel toggles:**

- ☑️ CH1, ☑️ CH2, ☑️ CH3, ☑️ CH4 (or TP9, AF7, AF8, TP10 for Muse)

**Per-band toggles:**

- ☑️ Delta, ☑️ Theta, ☑️ Alpha, ☑️ Beta, ☑️ Gamma

**Value type toggles:**

- ☑️ **Absolute:** Raw µV² band power
- ☑️ **Relative:** 0-1 normalized against fixed ranges
- ☑️ **Averages:** Mean, min, max across enabled channels

**OSC Address Formats:**

```
/neuro/bands/CH1/alpha          → absolute power
/neuro/bands/CH1/alpha-relative → 0-1 normalized
/neuro/bands/alpha              → average across enabled channels
/neuro/bands/alpha/max          → max across channels
/neuro/bands/alpha/min          → min across channels
/neuro/elements/alpha_absolute  → [CH1, CH2, CH3, CH4] array
/neuro/elements/alpha_relative  → [0-1, 0-1, 0-1, 0-1] array
```

**Custom prefix:**

- Default: `/neuro`
- User can change to `/muse`, `/eeg`, `/brain`, etc.

**Status:** ⚠️ NeuroVis has basic OSC but no granular channel/band toggles

---

### 5. ✅ Display Features

**From NeurOSC:** UI with 3 visualization modes

**Mode tabs:**

1. **Traces:** Raw 4-channel EEG waveforms (timeseries)
2. **FFT:** Power spectral density (0.5-45 Hz)
3. **Bands:** Bar chart of delta/theta/alpha/beta/gamma per channel

**Chart features:**

- ✅ Auto-scale toggle
- ✅ Manual Y-axis scale slider
- ✅ Log-scale Y-axis for band chart (prevents alpha dominance)
- ✅ Real-time status indicators (connected, streaming, OSC live)
- ✅ Signal quality badges

**Status:** ✅ NeuroVis already has good display

- Could add log-scale Y-axis option for band chart

---

### 6. ✅ Device Auto-Detection

**From NeurOSC:** `main.py` lines 1123-1130

```javascript
// When user selects a Bluetooth device from dropdown,
// auto-set the device type based on the name
document.getElementById("port-select").addEventListener("change", function () {
  const opt = this.options[this.selectedIndex];
  if (opt && opt.dataset.deviceType) {
    document.getElementById("device-type").value = opt.dataset.deviceType;
    updateChannelButtons(opt.dataset.deviceType);
  }
});
```

**Logic:**

- User scans for ports
- Bluetooth devices appear with name and MAC
- Selecting "Muse-33C1" auto-sets device type to "muse_2"
- Selecting "MuseS-FDE6" auto-sets to "muse_athena"
- Selecting "Ganglion-1234" auto-sets to "ganglion"
- Channel names update automatically (CH1-4 vs TP9/AF7/AF8/TP10)

**Status:** ⚠️ NeuroVis has device specs but no auto-detection from port scan

---

## Implementation Priority

### Phase 1: Critical Features (30 minutes)

1. ✅ Port auto-discovery API endpoint
2. ✅ Bluetooth scanning for macOS
3. ✅ Auto-device-type detection

### Phase 2: Calibration (45 minutes)

1. ✅ Baseline history tracking (per-channel, per-band)
2. ✅ Z-score normalization function
3. ✅ UI controls for baseline/log transform
4. ✅ Reset baseline button

### Phase 3: Granular OSC (30 minutes)

1. ✅ Per-channel OSC toggles
2. ✅ Per-band OSC toggles
3. ✅ Absolute/Relative/Averages toggles
4. ✅ Custom OSC prefix
5. ✅ OSC address preview

### Phase 4: Polish (20 minutes)

1. ✅ Log-scale band chart option
2. ✅ Improved status indicators
3. ✅ Better error messages

**Total estimated time: ~2 hours**

---

## Files to Modify

1. **server-enhanced.js**
   - Add `/api/ports` endpoint with Bluetooth scan
   - Add baseline history tracking
   - Add z-score normalization
   - Add granular OSC config API

2. **public/index.html**
   - Add port refresh button
   - Add device auto-detection
   - Add baseline/log transform toggles
   - Add per-channel/band OSC toggles
   - Add OSC address preview

3. **dsp.js** (if needed)
   - Add baseline history buffer
   - Add z-score function

---

## Testing Checklist

- [ ] Port scan finds BLED dongle at `/dev/cu.usbmodem*`
- [ ] Bluetooth scan finds paired Muse devices with MAC
- [ ] Selecting Bluetooth device auto-sets device type
- [ ] Baseline normalization stabilizes after 30 seconds
- [ ] Z-score values are centered around 0
- [ ] Per-channel OSC toggles correctly filter output
- [ ] Per-band OSC toggles correctly filter output
- [ ] OSC address preview shows all enabled addresses
- [ ] Log transform affects band power values
- [ ] Reset baseline button clears history

---

## References

- NeurOSC repo: `/Users/richardboulanger/dB-Studio/NeurOSC/`
- NeuroVis repo: `/Users/richardboulanger/dB-Studio/NeuroVis/`
- BLED dongle port: `/dev/cu.usbmodem11` (example)
- Muse 2 MAC: detected via system_profiler on macOS
