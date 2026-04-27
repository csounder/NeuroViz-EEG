# NeuroVis → Csound Brain-Computer Music Interface

**Complete integration guide for streaming Muse EEG brain data to Csound via OSC**

Author: Richard Boulanger (The Csound Book)  
Date: April 17, 2026  
Status: **IN PROGRESS** (simulator working, hardware debugging)

---

## 🎯 Goal

Stream ALL data types from Muse EEG headsets (Muse S Athena, Muse 2) through NeuroVis to Csound via OSC for real-time brain-modulated synthesis.

**Key Requirements:**

- ✅ Csound is PRIMARY/DEFAULT OSC target (port 7400)
- ✅ Stream ALL Muse data types (EEG, band powers, IMU, PPG, fNIRS, artifacts, battery)
- ✅ OSC format: `/muse/elements/{band}_absolute` with single float per band
- ✅ Simulator mode for testing without hardware
- ⚠️ Stable long-duration streaming (60+ seconds without timeout) - IN PROGRESS

---

## 📊 System Architecture

```
┌─────────────────┐
│  Muse Headset   │ (Bluetooth Low Energy)
│  S Athena / 2   │
└────────┬────────┘
         │ BLE
         ▼
┌─────────────────┐
│  MuseBridge     │ (Swift CLI, LibMuse SDK 8.0.5)
│  Swift App      │ Registers for ALL packet types
└────────┬────────┘ Outputs JSON to stdout
         │ stdout
         ▼
┌─────────────────┐
│  NeuroVis       │ (Node.js server)
│  server.js      │ Parses JSON, broadcasts WebSocket
└────────┬────────┘ Sends OSC to port 7400 @ 10 Hz
         │ OSC
         ▼
┌─────────────────┐
│  CsoundQt       │ (Csound 7+ recommended)
│  .csd file      │ OSClisten on /muse/elements/*
└─────────────────┘
```

---

## 🚀 Quick Start

### 1. Start NeuroVis Server

```bash
# Kill any existing processes
pkill -9 -f "MuseBridge" && pkill -9 -f "node.*server"

# Start server in background
cd /Users/richardboulanger/dB-Studio/NeuroVis
nohup node server-enhanced.js > /tmp/muse_configurable.log 2>&1 &

# Monitor logs
tail -f /tmp/muse_configurable.log | grep -E "bandPowers|OSC|📊|📡"
```

### 2. Enable Simulator Mode (for testing without hardware)

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"simulatorMode":true}'
```

Or via browser: http://localhost:3000 → Settings → Enable Simulator

### 3. Open Csound Instrument

```csound
<CsoundSynthesizer>
<CsOptions>
-odac -+rtaudio=CoreAudio -b512 -B2048 -d
</CsOptions>
<CsInstruments>

sr = 48000
ksmps = 32
nchnls = 2
0dbfs = 1

; OSC receiver handle on port 7400
gihandle OSCinit 7400

; Global k-rate variables for band powers
gkAlpha init 0
gkBeta init 0
gkTheta init 0
gkDelta init 0
gkGamma init 0

instr 1
  ; Listen for OSC band power messages (10 Hz updates)
  kk OSClisten gihandle, "/muse/elements/alpha_absolute", "f", gkAlpha
  kk OSClisten gihandle, "/muse/elements/beta_absolute", "f", gkBeta
  kk OSClisten gihandle, "/muse/elements/theta_absolute", "f", gkTheta
  kk OSClisten gihandle, "/muse/elements/delta_absolute", "f", gkDelta
  kk OSClisten gihandle, "/muse/elements/gamma_absolute", "f", gkGamma

  ; Map alpha (0.0-1.0) to frequency (200-800 Hz)
  kFreq = 200 + (gkAlpha * 600)

  ; Simple sine oscillator
  aOut = oscili(0.3, kFreq)

  out aOut, aOut
endin

</CsInstruments>
<CsScore>
i1 0 3600  ; Run for 1 hour
</CsScore>
</CsoundSynthesizer>
```

Save as `MuseOSCTest.csd` and run in CsoundQt.

### 4. Connect Hardware (optional)

- Power on Muse headset
- Open http://localhost:3000
- Click "Scan Devices"
- Select your Muse from dropdown
- Click "Connect" (LED turns solid blue)
- Watch band power visualizations update in real-time

---

## 📡 OSC Message Format

NeuroVis sends OSC to **port 7400** at **10 Hz** (100ms intervals):

| OSC Address                     | Type | Range   | Description          |
| ------------------------------- | ---- | ------- | -------------------- |
| `/muse/elements/delta_absolute` | f    | 0.0-1.0 | Delta band (1-4 Hz)  |
| `/muse/elements/theta_absolute` | f    | 0.0-1.0 | Theta band (4-8 Hz)  |
| `/muse/elements/alpha_absolute` | f    | 0.0-1.0 | Alpha band (8-13 Hz) |
| `/muse/elements/beta_absolute`  | f    | 0.0-1.0 | Beta band (13-30 Hz) |
| `/muse/elements/gamma_absolute` | f    | 0.0-1.0 | Gamma band (30+ Hz)  |

**Important:** Each message contains a **single float** (not 4 floats). Use `OSClisten gihandle, "/path", "f", kVar` in Csound.

---

## 🔧 Critical Bug Fixes Applied

### 1. Simulator Wouldn't Start from `/api/settings`

**Problem:** POST to `/api/settings` set `simulatorMode=true` but didn't initialize the `setInterval` loop.

**Solution:** Added full simulator initialization in POST handler (lines 1448-1495 of `server-enhanced.js`):

```javascript
if (body.simulatorMode !== undefined) {
  cfg.simulatorMode = body.simulatorMode;
  if (cfg.simulatorMode) {
    if (!simTimer) {
      simTimer = setInterval(() => {
        // Generate synthetic band powers...
      }, 100);
    }
  } else {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
  }
}
```

### 2. MuseBridge Only Sent EEG, Not Band Powers

**Problem:** Original MuseBridge only registered for `IXNMuseDataPacketType.eeg` and filtered out all other packet types in `receive()`.

**Solution:** Registered for ALL 8 packet types and added switch/case routing (lines 72-84, 165-183 of `main.swift`):

```swift
muse?.register(self, type: IXNMuseDataPacketType.eeg)
muse?.register(self, type: IXNMuseDataPacketType.bandPowers)
muse?.register(self, type: IXNMuseDataPacketType.accelerometer)
muse?.register(self, type: IXNMuseDataPacketType.gyro)
muse?.register(self, type: IXNMuseDataPacketType.ppg)
muse?.register(self, type: IXNMuseDataPacketType.battery)
muse?.register(self, type: IXNMuseDataPacketType.artifacts)
muse?.register(self, type: IXNMuseDataPacketType.drlRef) // fNIRS on Muse S Athena
```

### 3. OSC Format Mismatch

**Problem:** Csound expected single float (`"f"`), server sent 4 floats (`"ffff"`).

**Solution:** Changed OSC messages to send one float per band (lines 765-820 of `server-enhanced.js`):

```javascript
const relBands = calculateRelativeBandPowers(latestBandPowers);
oscClient.send("/muse/elements/delta_absolute", relBands.delta);
oscClient.send("/muse/elements/theta_absolute", relBands.theta);
oscClient.send("/muse/elements/alpha_absolute", relBands.alpha);
oscClient.send("/muse/elements/beta_absolute", relBands.beta);
oscClient.send("/muse/elements/gamma_absolute", relBands.gamma);
```

### 4. Cached Band Power Values

**Problem:** Server was broadcasting old frozen values (α=0.230, β=0.136, θ=0.269) instead of live Muse data because `handleBandPowersPacket()` wasn't being called.

**Solution:** Debugging in progress (see **Known Issues** below).

### 5. Multiple Zombie MuseBridge Processes

**Problem:** Each server restart spawned new MuseBridge without killing old ones (50+ instances found).

**Solution:** Always kill before restart:

```bash
pkill -9 -f "MuseBridge"
```

---

## 🛠️ Modified Files

### NeuroVis Server

**`/Users/richardboulanger/dB-Studio/NeuroVis/server-enhanced.js`**

Key sections:

- **Lines 538-566:** `handleBandPowersPacket()` - processes incoming band power data (currently not being called - debugging)
- **Lines 765-820:** `sendBandPowersOSC()` - sends OSC to port 7400 at 10 Hz
- **Lines 1448-1495:** `/api/settings` POST handler - added simulator initialization
- **Lines 396-397:** Packet routing - checks `packet.type === "bandPowers"`

**`/Users/richardboulanger/dB-Studio/NeuroVis/public/index.html`**

Key changes:

- **Lines 3187-3193:** OSC targets - Csound moved to TOP and set as default (`enabled: true`)
- **Lines 3480, 3866:** IMU labels clarified to "IMU (accel+gyro)" and "IMU (motion)"
- **Line 3867-3874:** Removed "Quad View" from bottom view tabs (now only in header)
- **Line 3922:** Replaced lightning bolt ⚡ with brain icon 🧠
- **Line 3929:** Increased title font size (12 → 14pt)
- **Line 995:** Increased device chooser font size (10 → 12pt)
- **Line 4035:** "QUAD VIEW" button in header (previously "Quad")

**`/Users/richardboulanger/dB-Studio/NeuroVis/public/app.js`**

- Added graceful fallback for React-only UI
- WebSocket handlers for device list updates

### MuseBridge Swift App

**`/Users/richardboulanger/Desktop/MuseBridgeApp/MuseBridge/main.swift`**

Key sections:

- **Lines 72-84:** Registration for all 8 packet types
- **Lines 165-183:** `receive()` switch/case routing
- **Lines 185-213:** `handleEEGData()` - 256 Hz, 4 channels
- **Lines 215-253:** `handleBandPowers()` - calculates relative band powers
- **Lines 255-283:** `handleAccelerometer()` - 52 Hz, 3-axis
- **Lines 285-313:** `handleGyroscope()` - 52 Hz, 3-axis
- **Lines 315-343:** `handlePPG()` - 64 Hz, heart rate
- **Lines 345-358:** `handleBattery()` - battery status
- **Lines 360-373:** `handleArtifacts()` - blink, jaw clench, headband fit
- **Lines 375-388:** `handleNIRS()` - fNIRS for Muse S Athena (10 Hz)
- **Lines 88-108:** `startKeepalive()` timer (may not be needed for LibMuse)

**Compiled binary:** `/Users/richardboulanger/dB-Studio/NeuroVis/MuseBridge` (5.7MB universal, MD5: 09c17ad72b135067fee664e077c6924c)

---

## ⚠️ Known Issues (IN PROGRESS)

### Hardware Band Powers Not Reaching Server

**Symptoms:**

- ✅ Device detected and connects (solid blue LED)
- ✅ EEG packets arrive at server
- ✅ Browser receives band powers via WebSocket
- ❌ Server's `handleBandPowersPacket()` never executes (no debug logs)
- ❌ OSC still sends cached values (α=0.230 frozen)

**Root Cause Hypothesis:**

1. Old MuseBridge binary still running (wrong version cached)
2. MuseBridge stdout not being parsed correctly by server
3. JSON output format mismatch between MuseBridge and server parser

**Next Debug Steps:**

1. Verify MuseBridge binary version:

   ```bash
   ps aux | grep MuseBridge  # Check which process is running
   lsof -p <PID> | grep MuseBridge  # Verify binary path
   ```

2. Test MuseBridge output directly:

   ```bash
   ./MuseBridge  # Run standalone and watch stdout for bandPowers JSON
   ```

3. Check server's MuseBridge stdout parser:
   - Verify all JSON lines are being parsed
   - Check if `packet.type === "bandPowers"` condition is reached

---

## 📚 Data Types Captured

### Muse S Athena (All Features)

| Data Type     | Rate   | Channels/Axes        | Description                           |
| ------------- | ------ | -------------------- | ------------------------------------- |
| EEG           | 256 Hz | 4 (TP9/AF7/AF8/TP10) | Raw brain waves                       |
| Band Powers   | 10 Hz  | 5 bands              | Delta/Theta/Alpha/Beta/Gamma          |
| Accelerometer | 52 Hz  | 3-axis (X/Y/Z)       | Head motion acceleration              |
| Gyroscope     | 52 Hz  | 3-axis (X/Y/Z)       | Head rotation rate                    |
| PPG           | 64 Hz  | 3 channels           | Photoplethysmography (heart rate)     |
| fNIRS         | 10 Hz  | 2 channels           | Functional near-infrared spectroscopy |
| Artifacts     | Varies | 3 types              | Blink, jaw clench, headband fit       |
| Battery       | 1 Hz   | 1 value              | Battery percentage                    |

### Muse 2 (Subset)

Same as Muse S Athena except:

- ❌ No PPG (heart rate)
- ❌ No fNIRS

---

## 🔄 Rebuild MuseBridge

If you modify `main.swift`:

```bash
cd /Users/richardboulanger/Desktop/MuseBridgeApp/MuseBridge

# Clean and rebuild
xcodebuild -project MuseBridge.xcodeproj -configuration Release clean build

# Copy new binary to NeuroVis
cp build/Release/MuseBridge /Users/richardboulanger/dB-Studio/NeuroVis/MuseBridge

# Verify it's a universal binary
lipo -info /Users/richardboulanger/dB-Studio/NeuroVis/MuseBridge
# Should show: Architectures in the fat file: MuseBridge are: x86_64 arm64
```

---

## 🧪 Test Instruments

### Minimal Test (Working)

**`/Users/richardboulanger/Desktop/MuseOSCTest.csd`**

Simple sine tone with alpha-modulated frequency. Confirms OSC pipeline is functional.

### Advanced Instrument (User's Main Instrument)

**`/Users/richardboulanger/Desktop/MuseV1NeuroVis.csd`**

MIDI keyboard + OSC brain modulation. More complex synthesis with multiple brain parameters controlling timbre, rhythm, and spatial effects.

---

## 🗂️ Directory Structure

```
/Users/richardboulanger/dB-Studio/NeuroVis/
├── server-enhanced.js          # Main server (OSC + MuseBridge integration)
├── public/
│   ├── index.html              # React UI (Csound-first OSC targets)
│   └── app.js                  # WebSocket handlers
├── MuseBridge                  # Swift binary (deployed from Desktop build)
└── /tmp/muse_configurable.log  # Server logs

/Users/richardboulanger/Desktop/MuseBridgeApp/MuseBridge/
├── main.swift                  # MuseBridge source (all data types)
├── build/Release/MuseBridge    # Compiled binary (5.7MB universal)
└── MuseBridge.xcodeproj/       # Xcode project

/Users/richardboulanger/Desktop/
├── MuseOSCTest.csd             # Minimal test instrument (working)
└── MuseV1NeuroVis.csd          # User's main instrument

/Users/richardboulanger/dB-Studio/Brain/Muse - SDK - RDK/
└── Muse SDK/Muse SDK 8.0.5/libmuse_macos_8.0.5/
    ├── Muse.framework/         # LibMuse SDK (linked during build)
    ├── examples/MuseStatsMac/  # Reference code
    └── doc/                    # API documentation
```

---

## 📝 Useful Commands

### Server Management

```bash
# Start server
cd /Users/richardboulanger/dB-Studio/NeuroVis
nohup node server-enhanced.js > /tmp/muse_configurable.log 2>&1 &

# Monitor logs (all)
tail -f /tmp/muse_configurable.log

# Monitor logs (filtered)
tail -f /tmp/muse_configurable.log | grep -E "bandPowers|OSC|📊|📡"

# Stop server
pkill -9 -f "node.*server"
```

### MuseBridge Management

```bash
# Kill all MuseBridge processes
pkill -9 -f "MuseBridge"

# Check running MuseBridge processes
ps aux | grep MuseBridge

# Run MuseBridge standalone (for debugging)
cd /Users/richardboulanger/dB-Studio/NeuroVis
./MuseBridge
```

### Simulator Control

```bash
# Enable simulator
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"simulatorMode":true}'

# Disable simulator
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"simulatorMode":false}'

# Check current settings
curl http://localhost:3000/api/settings
```

### OSC Debugging

```bash
# Install oscdump (if not already installed)
brew install liblo

# Monitor OSC traffic on port 7400
oscdump 7400
```

---

## 🎓 Background: Why This Matters

This integration brings together:

- **Muse EEG headsets** - consumer-grade brain sensing (4-channel EEG, IMU, PPG, fNIRS)
- **Csound** - professional synthesis language (The Csound Book, MIT Press)
- **Real-time OSC** - low-latency brain → sound mapping

**Use cases:**

- Brain-computer music performance (alpha/beta control synthesis parameters)
- Neurofeedback composition (theta/delta modulate harmony)
- Meditation soundscapes (artifact detection triggers ambient textures)
- Research in music cognition and brain-computer interfaces

---

## 🚀 Future Enhancements

### Current Priority

- [ ] **Fix hardware band power streaming** (current blocker - see Known Issues)
- [ ] **Add calibration page/system** (user has working version to integrate after OSC testing)

### Device Testing

- [ ] Test with Muse 2 headset
- [ ] Test with OpenBCI Ganglion

### Advanced Features

- [ ] Add PPG → tempo mapping (heart rate controls BPM)
- [ ] Add IMU → spatial audio (head tracking for 3D panning)
- [ ] Add artifact detection → generative triggers (blink = new note)
- [ ] Create preset library of brain-modulated Csound instruments
- [ ] Document advanced OSC routing (Max/MSP, TouchDesigner, Unity)

---

## 📞 Support

**Created by:** Richard Boulanger  
**Contact:** (via GitHub issues once pushed)  
**Csound Version:** 6.18 (Csound 7+ recommended)  
**NeuroVis Version:** Custom fork with Csound-first OSC integration  
**MuseBridge Version:** Custom build with LibMuse SDK 8.0.5

---

## 📄 License

(To be determined - pending GitHub push)

---

**Last Updated:** April 17, 2026  
**Status:** Simulator fully working ✅ | Hardware debugging in progress ⚠️
