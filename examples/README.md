# EEG Synthesis Examples

This directory contains complete examples for receiving Muse EEG data via OSC and creating real-time synthesis.

## 📡 OSC Configuration

- **Server**: Node.js (muse-eeg-server)
- **Host**: 127.0.0.1 (localhost)
- **Port**: 7400
- **Message**: `/muse/eeg [ch1, ch2, ch3, ch4]`
- **Sample Rate**: 256 Hz (default Muse rate)
- **Data Range**: 0-1 (normalized)

## 🎛️ Available Examples

### 1. Csound 6 (Simple Time-Based)
**File**: `eeg_synth_simple.csd`
- ✓ Works with Csound 6.18
- ✓ No OSC input (runs standalone)
- ✓ Time-modulated frequency synthesis
- Setup: `csound examples/eeg_synth_simple.csd`

### 2. Csound 7 (Full OSC Support)
**File**: `eeg_synth_csound7.csd`
- ✓ Full OSC input support
- ✓ Receives `/muse/eeg` messages
- ✓ 3 synthesis engines (Oscillator, Additive, FM)
- Requires: Csound 7.x
- Setup: See `UPGRADE_CSOUND7.md`

### 3. Max/MSP (Visual Programming)
**File**: `EEG_Synth.maxpat`
- ✓ Full OSC support
- ✓ Visual patch editor
- ✓ Real-time interactive controls
- Requires: Max 8 or later + o.io library
- Setup: See `MAX_MSP_GUIDE.md`

### 4. Pure Data (Free Alternative)
**File**: `eeg_synth.pd`
- ✓ Free and open-source
- ✓ Full OSC support
- ✓ Lightweight (< 5MB)
- Setup: See `PUREDATA_GUIDE.md`

## 🚀 Quick Start

### Step 1: Start Node.js Server
```bash
cd ..
node server-enhanced.js
```

### Step 2: Choose Your Synthesis Tool

#### Option A: Pure Data (Free)
```bash
pd examples/eeg_synth.pd
# Click "Audio ON"
```

#### Option B: Max/MSP (Professional)
```bash
# Open in Max
File → Open → examples/EEG_Synth.maxpat
```

#### Option C: Csound 7 (Lightweight)
```bash
csound examples/eeg_synth_csound7.csd
```

### Step 3: Enable Simulator
```
Open: http://localhost:3000
Toggle: "Enable Test Mode"
```

You should now hear real-time synthesis driven by simulated EEG data! 🎵

## 📊 Parameter Mappings

All examples follow the same mapping scheme:

| Channel | Parameter | Range | Effect |
|---------|-----------|-------|--------|
| **Ch1** | Oscillator Frequency | 100-500 Hz | Pitch/Tone Height |
| **Ch2** | Amplitude/Volume | 0-0.2 | Loudness |
| **Ch3** | Filter Cutoff | 500-5000 Hz | Brightness |
| **Ch4** | Effect/Timbre | 0-1 | Waveform Selection |

## 🔧 Customization

### Change Synthesis Parameters

#### Csound
Edit the frequency range in `eeg_synth_csound7.csd`:
```csound
kfreq = 100 + (gkEEG1 * 400)  ; Change 100/400 to adjust range
```

#### Max/MSP
Change the multipliers in your patch:
```
[* 400]  ; Frequency scale
[+ 100]  ; Frequency offset
[* 0.2]  ; Amplitude scale
```

#### Pure Data
Edit the patch objects:
```
[* 400] (frequency scaling)
[+ 100] (frequency offset)
[* 0.2] (amplitude control)
```

### Add Custom Effects

#### Csound
Add effects to instrument:
```csound
aout = reverb(aout, 2.5)  ; Reverb
aout = delay(aout, 0.5)   ; Delay
```

#### Max/MSP
Add effect objects:
```
[freqshift~] (frequency shifter)
[filtergraph~] (custom filter)
```

#### Pure Data
Add Pd-extended libraries:
```
[freqshift~]  (via Pd-extended)
[zerocross~]  (custom objects)
```

## 📖 Full Guides

- **Csound 7 Upgrade**: See `UPGRADE_CSOUND7.md`
- **Max/MSP Setup**: See `MAX_MSP_GUIDE.md`
- **Pure Data Setup**: See `PUREDATA_GUIDE.md`

## 🐛 Troubleshooting

### "No audio"
1. Check Node.js server is running: `ps aux | grep node`
2. Verify simulator enabled in web dashboard
3. Check your system audio output is not muted
4. In your tool, verify audio is enabled (Csound: check console, Max: ezdac~ power, Pd: Audio ON)

### "No OSC messages"
1. Node.js logs should show: `🎵 OSC: ... packets sent to Csound`
2. Your tool should show incoming `/muse/eeg` messages
3. Verify port 7400 is not blocked by firewall

### "Audio is very quiet"
1. Increase amplitude multiplier (0.2 → 0.5)
2. Check filter cutoff isn't too low
3. Verify frequency is in valid range

## 🌐 Network Configuration

If running on different machines:

1. Edit Node.js server to bind all interfaces:
   ```bash
   # In server-enhanced.js
   127.0.0.1 → 0.0.0.0
   ```

2. In your synthesis tool, change target:
   ```
   127.0.0.1 → [your-server-ip]
   ```

3. Firewall: Allow UDP port 7400

## 🎯 Next Steps

- Add visual feedback (spectrum analyzer, waveform display)
- Create multiple independent synth voices
- Add envelope control (ADSR)
- Build effect chain (reverb, delay, granulation)
- Record OSC data for playback
- Create preset/patch system
- Integrate with Muse S device (connect real EEG)

## 📚 Resources

- **Csound**: https://csound.com
- **Max/MSP**: https://cycling74.com
- **Pure Data**: http://puredata.info
- **OSC Spec**: http://opensoundcontrol.org
- **Muse Device**: https://choosemuse.com

## 📝 License

These examples are provided as educational material for use with the Muse EEG Dashboard.

---

**Happy synthesizing!** 🧠🎵
