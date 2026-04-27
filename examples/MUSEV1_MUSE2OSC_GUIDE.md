# MuseV1_Muse2OSC.csd - Complete Guide

Fully documented Csound 6 instrument that receives real-time Muse 2 EEG data via OSC and creates MIDI-triggered synthesis with EEG modulation.

## 🎯 Overview

This instrument:
1. **Listens for OSC messages** from the Node.js server on port 7400
2. **Receives 4 EEG channels** (normalized 0-1)
3. **Receives MIDI notes** from your controller
4. **Modulates synthesis** with EEG data in real-time
5. **Adds reverb & delay** effects

## 📊 Data Flow

```
Muse 2 Headset (256 Hz EEG)
    ↓ Bluetooth
Node.js Server (DSP Pipeline)
    ↓ OSC /muse/eeg [ch1, ch2, ch3, ch4]
    ↓ UDP Port 7400
Csound (Instrument 1 - OSC Listener)
    ↓ Updates: gkEEG_Ch1, gkEEG_Ch2, gkEEG_Ch3, gkEEG_Ch4
    ↓
Csound (Instrument 2 - MIDI Synth)
    ↓ Receives MIDI notes + CC values
    ↓ Uses EEG to modulate pitch, amplitude, timbre
    ↓
Audio Output 🔊
```

## 🚀 Quick Start

### Step 1: Start Node.js Server

```bash
cd muse-eeg-server
node server-enhanced.js
```

You should see:
```
✓ OSC client ready → 127.0.0.1:7400
✓ WebSocket: ws://localhost:8080
Waiting for Muse devices or simulator mode...
```

### Step 2: Open This File in CsoundQt

File → Open → `MuseV1_Muse2OSC.csd`

### Step 3: Click RUN

In CsoundQt, click the **RUN** button (green play icon).

Console should show:
```
Csound version 6.18
audio buffered in 1024 sample-frame blocks
dac0 (MacBook Pro Speakers)
```

### Step 4: Open Web Dashboard

Open browser: **http://localhost:3000**

### Step 5: Put on Muse 2 & Connect

1. Position Muse 2 on your forehead
2. Wait for device discovery (5-10 seconds)
3. Click device name to connect
4. Watch the "Raw EEG" tab - you should see waveforms!

### Step 6: Connect MIDI Device

Plug in your MIDI controller (e.g., Novation LaunchKey Mini).

### Step 7: Play Notes!

Press keys on your MIDI device. You should hear:
- **Base pitch from MIDI note**
- **Pitch transposed by EEG Ch1** (changes with your brain activity)
- **Amplitude modulated by EEG Ch2** (volume changes)
- **Timbre affected by EEG Ch3**
- **Effects modulation from EEG Ch4**

---

## 📱 EEG Channel Meanings

Each channel represents an electrode position:

| Channel | Location | Brain Region | Typical Activity |
|---------|----------|--------------|------------------|
| **Ch1** (AF7) | Left forehead | Left prefrontal | Attention, planning |
| **Ch2** (AF8) | Right forehead | Right prefrontal | Creative thinking |
| **Ch3** (TP9) | Left temple | Left temporal | Memory, emotion |
| **Ch4** (TP10) | Right temple | Right temporal | Auditory processing |

**Values:**
- **0.0-0.3** = Relaxed, low amplitude
- **0.3-0.6** = Focused, normal activity
- **0.6-1.0** = Alert, high activity / eye movement

---

## 🎛️ MIDI CC Mapping

Connect a MIDI controller and use these CC values to adjust modulation speeds:

| CC # | Description | Range | Effect |
|------|-------------|-------|--------|
| **21** | EEG Ch1 modulation speed | 0.01-40 Hz | How fast EEG Ch1 changes pitch |
| **22** | EEG Ch2 modulation speed | 0.01-50 Hz | How fast EEG Ch2 changes amplitude |
| **23** | EEG Ch3 modulation speed | 0.01-100 Hz | How fast EEG Ch3 changes timbre |
| **24** | EEG Ch4 modulation speed | 0.01-10 Hz | How fast EEG Ch4 changes effects |

### Example: Novation LaunchKey Mini

```
CC 21 → Fader 1
CC 22 → Fader 2
CC 23 → Fader 3
CC 24 → Fader 4
```

Move faders while playing notes to hear the modulation speed change.

---

## 🔧 How the Synthesis Works

### Phase 1: MIDI Input
```csound
icps cpsmidi        ; Get MIDI note frequency
```

### Phase 2: Sample & Hold EEG
```csound
kf1 samphold gkEEG_Ch1, ktrig1   ; Sample EEG at metronome rate
```

This creates **stepped modulation** - the EEG value changes only when the metronome triggers.

### Phase 3: Transpose Pitch
```csound
ktranspose1 = (kf1 * 24) - 12    ; Convert 0-1 to -12 to +12 semitones
aout1 = oscili(0.5, icps + cpspch((ktranspose1 + 0)))
```

- When `kf1 = 0` → Pitch is -12 semitones (1 octave lower)
- When `kf1 = 0.5` → Pitch is same as MIDI note
- When `kf1 = 1` → Pitch is +12 semitones (1 octave higher)

### Phase 4: Amplitude Modulation
```csound
kamp = gkEEG_Ch2 * 0.5            ; EEG Ch2 controls volume
aout = aout * aadsr * kamp        ; Apply MIDI envelope + EEG amplitude
```

### Phase 5: Effects
```csound
garvbL += aout * 0.8              ; Send to reverb (80% wet)
```

---

## 🎨 Customization Examples

### Change Pitch Range

Default: -12 to +12 semitones

To change to -24 to +24 semitones:
```csound
ktranspose1 = (kf1 * 48) - 24      ; Was (kf1 * 24) - 12
```

### Change Maximum Amplitude

Default: 0-0.5

To make louder (0-1):
```csound
kamp = gkEEG_Ch2 * 1.0             ; Was * 0.5
```

### Add More Oscillators

Default: 4 oscillators

To add a 5th:
```csound
aout5 = oscili(0.5, icps + cpspch((kf3 * 24)))
aout = ((aout1 + aout2 + aout3 + aout4 + aout5) / 10) * aadsr * kamp
```

### Change Reverb Amount

Default: 80% wet

To make drier (60%):
```csound
garvbL += aout * 0.6              ; Was * 0.8
```

---

## 🐛 Troubleshooting

### "No audio"
1. Click **RUN** button in CsoundQt
2. System audio NOT muted?
3. MIDI device connected?
4. Press keys on MIDI device

### "No EEG values coming in"
1. Server logs show `🎵 OSC: ... packets sent`?
2. Web dashboard shows live EEG waveforms?
3. Check OSC path is `/muse/eeg` (line ~106)
4. Verify port 7400 not blocked by firewall

### "Csound shows no messages"
Add debug output (uncomment lines 103-105):
```csound
if kk == 1 then
  printks "EEG: Ch1=%f Ch2=%f Ch3=%f Ch4=%f\n", 0.1, gkEEG_Ch1, gkEEG_Ch2, gkEEG_Ch3, gkEEG_Ch4
endif
```

Check CsoundQt console for output.

---

## 📚 Key Code Sections

### OSC Listener (Instrument 1)
Runs continuously. Waits for `/muse/eeg` messages and updates global variables.

### MIDI Synth (Instrument 2)
Triggered by MIDI notes. Uses EEG globals to modulate pitch, amplitude, timbre.

### Reverb (Instrument 3)
Processes audio from the reverb bus (garvbL, garvbR).

### Global Variables
- `gkEEG_Ch1` to `gkEEG_Ch4`: EEG values (0-1)
- `garvbL`, `garvbR`: Reverb bus
- `gadelL`, `gadelR`: Delay bus (not used yet)

---

## 🎓 Learning Resources

- **Csound Manual**: https://csound.com/docs
- **OSClisten Opcode**: https://csound.com/docs/manual/OSClisten.html
- **MIDI Control**: https://csound.com/docs/manual/midic7.html
- **Sample & Hold**: https://csound.com/docs/manual/samphold.html

---

## ⚡ Performance Tips

1. **Reduce reverb** if CPU usage is high
2. **Lower CC values** for slower modulation (less CPU)
3. **Close other apps** while running
4. **Use headphones** for lowest latency

---

## 🎵 Musical Ideas

### Meditative Performance
- Close your eyes
- Play slow, sustained notes
- Watch pitch shift with your brain activity
- Try to control the pitch by changing your mental state

### Interactive Jam
- Play complementary MIDI patterns
- Adjust CC faders to match your EEG activity
- Create a feedback loop between music and brainwaves

### Research
- Record MIDI + EEG data
- Analyze correlation between brain activity and music
- Document your creative process

---

## 📋 Quick Reference

| What | Where |
|------|-------|
| **OSC Path** | Line ~106: `/muse/eeg` |
| **OSC Port** | Line ~103: `7400` |
| **MIDI CC 21** | Line ~139: Speed 1 |
| **MIDI CC 22** | Line ~140: Speed 2 |
| **MIDI CC 23** | Line ~141: Speed 3 |
| **MIDI CC 24** | Line ~142: Speed 4 |
| **Pitch Range** | Line ~150: `-12 to +12` semitones |
| **Max Amplitude** | Line ~159: `0.5` (0-1 scale) |
| **Reverb Amount** | Line ~167: `0.8` (80% wet) |

---

**Enjoy creating with your mind!** 🧠🎵

