# NeuroVis + Muse Hardware - Quick Start

## 🚀 Start the Dashboard (30 seconds)

```bash
cd /Users/richardboulanger/dB-Studio/NeuroVis
npm install  # First time only
npm start
```

Then open: **http://localhost:3000**

## 📱 Connect Your Muse Device

1. **Power on your Muse** (Muse 2, S, or S Athena)
2. **MuseBridge auto-detects** - Watch terminal:
   ```
   📱 Devices found: 1
   ├─ MuseS-1234 (Muse S Athena (2025))...
   ```
3. **Dashboard updates automatically** - Device specs appear in header

## 📊 Try These Views

**Top navigation bar:**

- **Bands** - Show Delta/Theta/Alpha/Beta/Gamma selectors
- **Channels** - Show TP9/AF7/AF8/TP10 selectors
- **Viz** - Switch between display modes:
  - 📊 Raw EEG (live waveforms)
  - 🧠 Bands (power bars)
  - 🎛️ FFT (frequency spectrum)
  - 〰️ Waterfall (3D time-frequency)
  - 🔄 Phase Polar (coherence)
  - ⊞ Quad View (4 panes)
  - 💨 Motion (accel/gyro)
  - ❤️ PPG/HR (Muse S/Athena only)

## 🎲 Test Without Hardware

Use the **Simulator** (generates perfect synthetic data):

```javascript
// In browser console (F12):
fetch("http://localhost:3000/api/settings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ command: "toggle_simulator" }),
})
  .then((r) => r.json())
  .then(console.log);
```

Or toggle via WebSocket:

```javascript
ws.send(JSON.stringify({ command: "toggle_simulator" }));
```

Dashboard will show: **🎲 SIMULATOR** in header

## 🎛️ Adjust Settings

**Side Panel Controls:**

- **Simulator Freq** - Change synthetic EEG frequency (Hz)
- **Scaling Mode** - 0-1, 0-3 (Mind Monitor), Raw, Z-score
- **Smoothing** - 0 (raw) to 20 (heavy)
- **Notch Filter** - 50/60 Hz power line noise removal
- **Bandpass** - 1-45 Hz EEG range
- **OSC Streams** - Enable/disable output to Csound/Max

## 📡 Send Data to Csound/Max

**OSC output enabled by default:**

- **Host:** 127.0.0.1
- **Port:** 7400
- **Prefix:** /muse

**Available streams:**

- `/muse/eeg` - Raw 256 Hz EEG [ch1, ch2, ch3, ch4]
- `/muse/bands/absolute` - dB values
- `/muse/bands/relative` - Percentages
- `/muse/acc` - Accelerometer [x, y, z]
- `/muse/gyro` - Gyroscope [x, y, z]
- `/muse/ppg` - PPG/HR (S/Athena only)

**Enable in dashboard:**

- Check "Band Absolute" + "Band Relative" toggles
- Check motion/PPG as needed

## 🧠 Use Advanced Features

### Brain State Calibration

1. Click **"Brain State"** tab
2. Click **"Start Calibration"** button
3. Sit still for 90 seconds (eyes open, relaxed)
4. Classifier learns your baseline
5. Dashboard shows real-time z-scores + brain state

### DSP Presets

**Side panel → Presets:**

- **Relaxed** - Alpha-focused (meditators)
- **Focused** - Beta-focused (alertness)
- **Sleep** - Delta-focused (drowsiness detection)
- **Clean** - Heavy artifact rejection
- **Mind Monitor** - Muse app compatible

### Recording

- Enable **"Recording"** toggle
- EEG + band powers + motion saved to CSV
- Download from dashboard

## 🐛 Troubleshooting

| Issue                   | Fix                                                          |
| ----------------------- | ------------------------------------------------------------ |
| No devices found        | Power on Muse, check Bluetooth pairing in System Preferences |
| Black screen            | Check console (F12) for errors, restart server               |
| Data not flowing        | Toggle simulator OFF → ON, watch packet counts update        |
| OSC not reaching Csound | Verify port 7400 free (`lsof -i :7400`)                      |
| MuseBridge crash        | Server auto-relaunches, watch logs                           |

**Debug logs:**

```bash
# Terminal 1: Watch server logs
tail -f /tmp/neurovis.log

# Terminal 2: Check OSC (requires socat)
socat - UDP:127.0.0.1:7400
```

## 📋 What Works

✅ **Devices:** Muse 2, Muse S, Muse S Athena  
✅ **Displays:** All 12 visualization modes  
✅ **Data:** EEG, Band Powers, Motion, PPG, fNIRS (Athena)  
✅ **Output:** OSC to Csound/Max, CSV recording  
✅ **DSP:** 23 configurable filters + brain state classifier  
✅ **Simulator:** Perfect synthetic data for testing

## 🔌 Hardware Specs

| Device            | Channels            | Sampling | Battery | Range  |
| ----------------- | ------------------- | -------- | ------- | ------ |
| **Muse 2**        | 4 EEG               | 256 Hz   | 10h     | 10m BT |
| **Muse S**        | 4 EEG + PPG         | 256 Hz   | 12h     | 10m BT |
| **Muse S Athena** | 4 EEG + PPG + fNIRS | 256 Hz   | 14h     | 10m BT |

**Channel locations:**

- **TP9** - Left temporal
- **AF7** - Left frontal
- **AF8** - Right frontal
- **TP10** - Right temporal

Perfect for meditation, attention, drowsiness monitoring.

---

**Happy hacking!** 🧠✨
