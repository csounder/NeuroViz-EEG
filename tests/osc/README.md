# NeuroVis OSC Test Suite

**Complete OSC Integration Tests for All Major Platforms**

This directory contains ready-to-use test files for receiving and visualizing NeuroVis EEG data in:

- Csound
- Max/MSP
- Pure Data (Pd)
- SuperCollider
- Unity
- Unreal Engine
- TouchDesigner

---

## Quick Start

### 1. Configure NeuroVis

1. Open http://localhost:3000 (NeuroVis dashboard)
2. Enable **Simulator Mode** (or connect real Muse hardware)
3. Navigate to **OSC** tab
4. Configure OSC settings:
   - **Port**: `7400`
   - **IP**: `127.0.0.1` (localhost)
   - **Rate**: `20 Hz` (or as desired)
5. Enable **Granular OSC** controls:
   - Channels: CH1, CH2, CH3, CH4 (all ON)
   - Bands: Delta, Theta, Alpha, Beta, Gamma (all ON)
   - Values: Absolute, Relative, Averages (all ON)
6. Click **Start OSC**

You should see console logs confirming OSC messages are being sent.

### 2. Choose Your Platform

Pick ONE of the platforms below and follow its specific instructions.

---

## Platform-Specific Instructions

### 🎵 Csound

**File**: `test-csound.csd`

**Requirements**:

- Csound 6.18+ (Csound 7+ recommended)
- No additional plugins needed

**To Run**:

```bash
csound test-csound.csd
```

**What It Does**:

- Receives OSC on port 7400
- Prints EEG values to console every 0.5 seconds
- Plays additive synthesis controlled by all 5 EEG bands
- Each band controls one partial (110 Hz × harmonic number)

**Audio Output**:

- Delta → 110 Hz (1st harmonic)
- Theta → 220 Hz (2nd harmonic)
- Alpha → 330 Hz (3rd harmonic)
- Beta → 440 Hz (4th harmonic)
- Gamma → 550 Hz (5th harmonic)

**To Switch Instruments**:
Edit the `<CsScore>` section and uncomment different instruments:

- `Alpha_Tone`: CH1 alpha controls frequency (200-800 Hz)
- `Beta_Modulation`: CH2 beta controls FM depth
- `AllBands_Additive`: All bands as additive partials (DEFAULT)

---

### 🔵 Max/MSP

**File**: `test-max.maxpat`

**Requirements**:

- Max/MSP 8.0+
- No additional externals needed (uses built-in `udpreceive`)

**To Run**:

1. Double-click `test-max.maxpat` to open in Max
2. Enable audio (click speaker icon in bottom-left)
3. Watch number boxes update with live EEG data
4. Hear CH1 alpha control sine tone frequency (200-800 Hz)

**What It Does**:

- Receives OSC on port 7400
- Displays CH1 alpha, CH2 beta, and alpha average
- Sonifies alpha power as pitch (higher alpha = higher pitch)

**To Customize**:

- Edit `scale 0. 1. 200. 800.` to change frequency range
- Add more `route` objects for additional OSC addresses
- Connect EEG data to other Max objects (samplers, effects, etc.)

---

### 🟢 Pure Data (Pd)

**File**: `test-pd.pd`

**Requirements**:

- Pure Data (Pd) 0.51+
- `mrpeach` library (for `oscparse`) - usually included in Pd-extended

**To Run**:

1. Open `test-pd.pd` in Pure Data
2. Click "Compute Audio" (or Pd menu → Media → Audio ON)
3. Watch number boxes update
4. Hear tone controlled by alpha waves

**What It Does**:

- Receives OSC via `netreceive -u -b 7400`
- Parses OSC with `oscparse`
- Routes messages to floatatom displays
- Generates sine tone at 200-800 Hz based on alpha

**Troubleshooting**:

- If `oscparse` not found, install `mrpeach` externals
- Or use Pd-extended which includes it by default

---

### 🟣 SuperCollider

**File**: `test-supercollider.scd`

**Requirements**:

- SuperCollider 3.11+
- No quarks needed (uses built-in OSCdef)

**To Run**:

1. Open SuperCollider IDE
2. Boot the server: `Cmd+B` (Mac) or `Ctrl+B` (Linux/Win)
3. Open `test-supercollider.scd`
4. Run entire file: `Cmd+A` then `Cmd+Enter`
5. Watch Post window for EEG values
6. Hear alpha-controlled tone

**What It Does**:

- Sets up OSCdef listeners on port 7400
- Stores EEG values in global Dictionary (`~eegData`)
- Runs alpha-controlled sine synth (default)
- Includes 2 additional synth options (commented out)

**To Stop**:

```supercollider
~cleanup.value;
```

**Synth Options** (uncomment in code):

1. `~alphaTone`: CH1 alpha → frequency (200-800 Hz) **[DEFAULT]**
2. `~multiBand`: All 5 bands → additive synthesis
3. `~betaFM`: CH2 beta → FM modulation depth

---

### 🎮 Unity

**File**: `test-unity.cs`

**Requirements**:

- Unity 2020.3+ (any version)
- extOSC plugin (free): https://assetstore.unity.com/packages/tools/input-management/extosc-open-sound-control-94169

**To Run**:

1. Install extOSC from Asset Store
2. Create new GameObject in scene
3. Attach `NeuroVisOSCReceiver` script (paste from `test-unity.cs`)
4. In Inspector, verify OSC Port = 7400
5. Press Play
6. Start NeuroVis OSC
7. See cube transform based on EEG

**What It Does**:

- Receives all granular OSC messages
- Stores values in public float variables (visible in Inspector)
- Controls a cube:
  - **Y position**: Alpha average (relaxation/focus)
  - **X rotation**: Beta average (active thinking)
  - **Scale**: Theta average (meditation depth)
  - **Color**: Gamma average (cyan → magenta)
- Smooth interpolation for stable visuals

**Customization**:

- Assign your own `targetCube` in Inspector
- Adjust `PositionMultiplier` and `ScaleMultiplier`
- Toggle `debugLogging` for console output

---

### 🎮 Unreal Engine

**File**: `test-unreal.cpp`

**Requirements**:

- Unreal Engine 4.27+ or UE5+
- OSC Plugin (free, built-in since UE 4.26)

**To Run**:

#### Option A: C++ (advanced)

1. Enable OSC plugin: Edit → Plugins → Search "OSC" → Enable → Restart
2. Create new C++ Actor class
3. Paste code from `test-unreal.cpp`
4. Compile project
5. Place actor in level
6. Play

#### Option B: Blueprint (recommended)

1. Enable OSC plugin
2. Create new Blueprint Actor
3. Add **OSC Server** component (port 7400)
4. Add **Static Mesh** component (sphere)
5. Follow Blueprint instructions at bottom of `test-unreal.cpp`
6. Place in level and Play

**What It Does**:

- Receives OSC on port 7400
- Stores EEG in UPROPERTY variables (visible in Details panel)
- Controls sphere:
  - **Z position**: Alpha average
  - **Yaw rotation**: Beta average (spinning)
  - **Scale**: Theta average
  - **Color**: Gamma average (blue → magenta)

---

### 🌈 TouchDesigner

**File**: `test-touchdesigner.txt`

**Requirements**:

- TouchDesigner 2022+ (free for non-commercial)
- No plugins needed

**To Run**:

1. Open TouchDesigner
2. Follow step-by-step instructions in `test-touchdesigner.txt`
3. Create network: OSC In DAT → Select DAT → DAT to CHOP → Null CHOP
4. Use `absout.chan()` expressions to drive visuals
5. Start NeuroVis OSC
6. Watch sphere move/scale/color based on EEG

**What It Does**:

- Receives OSC into DAT table
- Converts to CHOP channels for animation
- Sphere transform:
  - **Y translate**: Alpha average
  - **Scale**: 1 + alpha average
  - **Color**: Gamma (cyan → magenta gradient)
- Text overlay shows all 5 band averages

**Network Nodes**:

- `oscin1`: OSC In DAT (port 7400)
- `select_eeg`: Filters OSC messages
- `datto1`: Converts DAT → CHOP
- `null_eeg`: Clean channel reference point
- `geo1`: 3D sphere geometry
- `render1`: Camera render output

---

## OSC Message Reference

### Granular OSC Format

NeuroVis sends **granular OSC messages** with the following structure:

```
/eeg/<CHANNEL>/<BAND>/<TYPE>  <float>
```

#### Channels

- `CH1`, `CH2`, `CH3`, `CH4`

#### Bands

- `delta` (0.5-4 Hz)
- `theta` (4-8 Hz)
- `alpha` (8-13 Hz)
- `beta` (13-30 Hz)
- `gamma` (30-60 Hz)

#### Types

- `absolute` - Raw band power (0.0 to 1.0)
- `relative` - Band power relative to total power (0.0 to 1.0)

### Average Messages

```
/eeg/<BAND>/averages  <float>
```

Average power for each band across all 4 channels.

### Example Messages

```
/eeg/CH1/alpha/absolute  0.723
/eeg/CH2/beta/absolute   0.456
/eeg/alpha/averages      0.612
```

### Total Message Count

When all granular options are enabled:

- 4 channels × 5 bands × 2 types = **40 per-channel messages**
- 5 bands × 1 average = **5 average messages**
- **Total: 45 OSC messages** per update cycle

At 20 Hz update rate = **900 OSC messages/second**

---

## Testing with Hardware

### Muse 2/S

1. Ensure Muse is charged and paired via Bluetooth
2. In NeuroVis:
   - Disable Simulator Mode
   - Scan for ports (looks for BLED dongle or Bluetooth Muse)
   - Connect to Muse
3. Wait for signal quality indicators to turn green
4. Start streaming
5. Enable OSC
6. Test with any platform above

### OpenBCI Ganglion/Cyton

1. Connect OpenBCI via USB dongle
2. In NeuroVis:
   - Select correct serial port
   - Set board type (Ganglion or Cyton)
   - Connect
3. Check signal quality
4. Start streaming
5. Enable OSC
6. Test with platform

---

## Testing with Simulator

For testing without hardware:

1. In NeuroVis, toggle **Simulator Mode** ON
2. Simulated EEG data will be generated:
   - Smooth band power fluctuations
   - Realistic value ranges (0.0-1.0)
   - All 4 channels active
3. Enable OSC as normal
4. Test with any platform

**Simulator generates**:

- Delta: 0.2-0.4 (slow drift)
- Theta: 0.3-0.5 (medium drift)
- Alpha: 0.4-0.8 (prominent, smooth)
- Beta: 0.2-0.6 (variable)
- Gamma: 0.1-0.3 (low, rapid)

---

## Common OSC Routes

All test files use these common OSC addresses. You can mix and match based on your needs:

### Focus on One Channel

```
/eeg/CH1/alpha/absolute  → Relaxation/focus (eyes closed)
/eeg/CH1/beta/absolute   → Active thinking
/eeg/CH1/theta/absolute  → Deep meditation
```

### Focus on Averages (simpler)

```
/eeg/alpha/averages  → Overall alpha across all channels
/eeg/beta/averages   → Overall beta
```

### Multi-Channel Spatial Mapping

```
/eeg/CH1/alpha/absolute  → Left front
/eeg/CH2/alpha/absolute  → Left back
/eeg/CH3/alpha/absolute  → Right front
/eeg/CH4/alpha/absolute  → Right back
```

---

## Troubleshooting

### Not Receiving OSC Messages

**Check 1: NeuroVis OSC Status**

- Is "Start OSC" button enabled?
- Check browser console for "OSC sent" messages
- Verify port is 7400

**Check 2: Firewall**

- macOS: System Preferences → Security & Privacy → Firewall → Allow incoming
- Windows: Windows Defender → Allow app through firewall
- Linux: `sudo ufw allow 7400/udp`

**Check 3: Localhost vs Network**

- If on same computer: Use `127.0.0.1`
- If on different computer: Use actual IP address
- Both computers must be on same network

**Check 4: Port Already in Use**

- Close other apps using port 7400
- Or change to different port (7401, 8000, etc.) in BOTH NeuroVis and receiver

### Values Stuck at Zero

**Check 1: Streaming**

- Is NeuroVis actively streaming data?
- Check "Start" button is enabled
- Verify simulator mode or hardware connection

**Check 2: OSC Route Filters**

- In NeuroVis OSC tab, verify granular controls are enabled:
  - Channels: At least one checked
  - Bands: At least one checked
  - Values: At least one checked

**Check 3: Calibration**

- If using baseline normalization, run calibration first
- Otherwise values may be normalized to zero

### Values Jumping Wildly

**Solution 1: Enable Smoothing**

- In NeuroVis DSP controls:
  - Increase "Smoothing" slider (10-30 ms)
  - Enable "Bandpass Filter" for cleaner signals

**Solution 2: Platform-Side Filtering**

- **Csound**: Add `port kSmooth, kValue, 0.1` for exponential smoothing
- **Max**: Add `slide~ 100` after number box
- **Pd**: Add `line~` with ramp time
- **SuperCollider**: Use `.lag(0.1)` on control values
- **Unity**: Increase lerp speed in `Vector3.Lerp(..., deltaTime * 2f)` → higher multiplier
- **TouchDesigner**: Add Filter CHOP with width 20-50

---

## Advanced: Custom OSC Routing

All platforms support custom OSC address routing. Here's how to receive ANY address:

### Csound

```csound
kValue init 0
kAnswer OSClisten giHandle, "/your/custom/address", "f", kValue
```

### Max/MSP

```
[udpreceive 7400]
  ↓
[route /your/custom/address]
  ↓
[unpack f]
```

### Pure Data

```
[netreceive -u -b 7400]
  ↓
[oscparse]
  ↓
[route /your/custom/address]
```

### SuperCollider

```supercollider
OSCdef(\myHandler, { |msg| msg[1].postln; }, '/your/custom/address');
```

### Unity

```csharp
oscReceiver.Bind("/your/custom/address", OnCustomMessage);
```

### TouchDesigner

```
OSC In DAT → Select rows matching pattern → DAT to CHOP
```

---

## Next Steps

1. **Test each platform**: Run through all 7 test files to verify OSC is working
2. **Combine platforms**: Use multiple simultaneously (e.g., Csound audio + Unity visuals)
3. **Network setup**: Send OSC to different computers on LAN
4. **Record data**: Log OSC for offline analysis or playback
5. **Build creative projects**: Use EEG to control music, visuals, games, installations

---

## Resources

- **NeuroVis Documentation**: `/Users/richardboulanger/dB-Studio/NeuroVis/README.md`
- **Csound FLOSS Manual**: https://flossmanuals.net/csound/
- **Max/MSP OSC**: https://docs.cycling74.com/max8/vignettes/osc_topic
- **Pd OSC**: http://write.flossmanuals.net/pure-data/osc/
- **SuperCollider OSC**: https://doc.sccode.org/Guides/OSC_communication.html
- **Unity extOSC**: https://github.com/Iam1337/extOSC
- **Unreal OSC**: https://docs.unrealengine.com/5.0/en-US/osc-open-sound-control-in-unreal-engine/
- **TouchDesigner OSC**: https://derivative.ca/UserGuide/OSC_In_DAT

---

## Support

If you encounter issues:

1. Check the server logs: `/tmp/neurovis-final.log`
2. Check browser console for errors
3. Verify OSC is actually being sent (enable debug logging in NeuroVis)
4. Test with simple OSC monitor first (e.g., `osculator` on macOS)

---

**Created**: 2026-04-18  
**Last Updated**: 2026-04-18  
**Server Version**: NeuroVis v1.0  
**OSC Protocol Version**: Granular OSC v1.0
