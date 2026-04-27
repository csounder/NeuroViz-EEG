# Csound EEG Synthesis Examples Guide

Complete reference for all EEG-controlled Csound synthesis examples. Each file demonstrates different synthesis and modulation techniques using live EEG data from the Muse headband.

---

## Overview

All examples share the same **OSC configuration**:

- **OSC Port**: 7400 (UDP)
- **OSC Path**: `/muse/eeg`
- **OSC Format**: `"ffff"` (4 floats)
- **EEG Channels**: AF7, AF8, TP9, TP10 (normalized 0-1)
- **Sample Rate**: 44100 Hz
- **Control Rate**: 100 Hz
- **0dBFS**: 1.0 (normalized audio output)

---

## File Index

### 1. **eeg_synth_reverb_effects.csd** ⭐ Recommended for Reverb

**Focus**: Reverb, delay, and effect processing with EEG modulation

**What it does:**

- Dual-oscillator synth with LFO modulation
- Moog ladder filter with EEG-controlled cutoff
- Real-time reverb controlled by EEG
- Separate reverb processor (Instrument 3)

**EEG Channel Mapping:**

- **EEG1 (AF7)** → Reverb send amount (0-100% wet)
- **EEG2 (AF8)** → Reverb decay time (0.5-3.0 seconds)
- **EEG3 (TP9)** → Filter cutoff frequency (100-8000 Hz)
- **EEG4 (TP10)** → LFO speed (0.1-10 Hz)

**Instruments:**

1. **Instr 1**: OSC listener (receives EEG data)
2. **Instr 2**: Dual-osc synth with envelope (plays MIDI notes)
3. **Instr 3**: Reverb processor (runs continuously)

**Key Techniques:**

- Exponential moving average smoothing on EEG values
- Moog ladder filter resonance
- Schroeder reverberator (allpass feedback)
- Envelope-controlled amplitude

**Best For:**

- Understanding reverb processing
- Learning filter modulation
- Adding spatial depth to synthesis

---

### 2. **eeg_synth_filters.csd** ⭐ Recommended for Filters

**Focus**: Advanced filter types with EEG control over cutoff, resonance, and filter type selection

**What it does:**

- Three-oscillator unison synth (slightly detuned)
- Vibrato modulation via EEG4
- Dynamic filter type switching (lowpass/bandpass/highpass)
- Real-time cutoff and resonance control

**EEG Channel Mapping:**

- **EEG1 (AF7)** → Filter cutoff (100-10000 Hz, exponential scale)
- **EEG2 (AF8)** → Filter resonance (0.5-4.0)
- **EEG3 (TP9)** → Filter type selector:
  - 0.0-0.33: Low-pass Moog ladder
  - 0.33-0.66: Band-pass (cascaded HP/LP)
  - 0.66-1.0: High-pass
- **EEG4 (TP10)** → Vibrato speed (0.1-15 Hz)

**Instruments:**

1. **Instr 1**: OSC listener
2. **Instr 2**: Filter modulation synth

**Key Techniques:**

- Unison oscillators for richness
- Exponential cutoff scaling (perceptually linear)
- Dynamic filter type switching based on EEG
- Moog ladder filter implementation
- Vibrato as oscillator modulation

**Best For:**

- Learning filter control techniques
- Understanding resonance and Q
- Exploring timbral morphing
- Demonstrating subtractive synthesis

---

### 3. **eeg_synth_panning.csd** ⭐ Recommended for Spatialization

**Focus**: Stereo imaging, panning, and spatial effects controlled by EEG

**What it does:**

- Unison synth (3 oscillators, slight detuning)
- Doppler effect via pitch modulation
- Real-time stereo panning
- Dynamic stereo width control
- Ping-pong delay between L/R channels

**EEG Channel Mapping:**

- **EEG1 (AF7)** → Stereo width (0 = mono, 1 = full stereo separation)
- **EEG2 (AF8)** → Panning position (0 = left, 0.5 = center, 1 = right)
- **EEG3 (TP9)** → Ping-pong delay time (0-500ms)
- **EEG4 (TP10)** → Doppler speed (0.1-5 Hz)

**Instruments:**

1. **Instr 1**: OSC listener
2. **Instr 2**: Spatial synth with delays

**Key Techniques:**

- Mid/side stereo processing
- Pan2 opcode for positioning
- Doppler effect (pitch modulation)
- Delay-line-based ping-pong effect
- Stereo width control via side signal

**Best For:**

- Learning stereo imaging
- Understanding mid/side processing
- Creating spatial movement
- Doppler effect experimentation

---

### 4. **eeg_synth_fm_modulation.csd** ⭐ Recommended for FM Synthesis

**Focus**: FM (Frequency Modulation) synthesis with complex timbral control via EEG

**What it does:**

- Multi-carrier FM synthesis (2 FM pairs)
- Real-time modulation index control
- FM ratio morphing
- Self-modulation feedback
- LFO on modulation index for dynamic timbre

**EEG Channel Mapping:**

- **EEG1 (AF7)** → Modulation index (0-20, controls brightness/complexity)
- **EEG2 (AF8)** → FM ratio (0.5-4.0, harmonic spacing)
- **EEG3 (TP9)** → Feedback amount (0-1, self-modulation intensity)
- **EEG4 (TP10)** → LFO on modulation index (0-1, dynamic timbre evolution)

**Instruments:**

1. **Instr 1**: OSC listener
2. **Instr 2**: FM synth with dual carriers

**Key Techniques:**

- Multiple FM pairs (carrier + modulator)
- Feedback self-modulation
- LFO modulation of modulation index
- Exponential amplitude envelope
- Harmonic ratio control

**Best For:**

- Understanding FM synthesis fundamentals
- Complex timbre design
- Bell/metallic sounds
- Bright to dark timbral morphing

---

### 5. **eeg_synth_granular.csd** ⭐ Recommended for Granular Synthesis

**Focus**: Granular synthesis with EEG control over grain density and parameters

**What it does:**

- Granular synth with dynamic grain generation
- Multiple overlapping grain voices
- Grain density control via EEG
- Pitch scatter and frequency randomization
- Smooth grain envelopes

**EEG Channel Mapping:**

- **EEG1 (AF7)** → Grain density (10-1000 grains/second)
- **EEG2 (AF8)** → Grain size (10-500ms, affects grain duration)
- **EEG3 (TP9)** → Pitch scatter (0-2 semitones deviation)
- **EEG4 (TP10)** → (Can be extended for grain envelope shape)

**Instruments:**

1. **Instr 1**: OSC listener
2. **Instr 2**: Granular synth

**Key Techniques:**

- Multi-voice grain overlapping
- Frequency randomization (pitch scatter)
- Grain envelope shaping (smooth fade in/out)
- Density-based texture control
- Unison with slight detuning for richness

**Best For:**

- Textural, ambient sound design
- Understanding granular synthesis
- Creating evolving soundscapes
- Metallic/crystalline effects

---

## Comparison Table

| Feature          | Reverb     | Filters    | Panning     | FM        | Granular    |
| ---------------- | ---------- | ---------- | ----------- | --------- | ----------- |
| Filter Control   | ✅ Moog LP | ✅ 3 types | ✗           | ✗         | ✗           |
| Reverb/Delay     | ✅ Reverb  | ✗          | ✅ Delay    | ✗         | ✗           |
| Stereo Effects   | ✗          | ✗          | ✅ Full     | ✗         | ✗           |
| FM Synthesis     | ✗          | ✗          | ✗           | ✅ Multi  | ✗           |
| Granular         | ✗          | ✗          | ✗           | ✗         | ✅          |
| Complexity       | Medium     | Medium     | Medium-High | High      | Medium-High |
| CPU Usage        | Low-Med    | Low        | Medium      | Medium    | High        |
| Timbre Evolution | Moderate   | High       | Moderate    | Very High | High        |

---

## Quick Start (Any Example)

### Step 1: Start Node.js Server

```bash
cd /Users/richardboulanger/dB-Studio/Dr.C/opencode/packages/muse-eeg-server
npm start
```

You should see: `🎵 Server listening on http://localhost:3000`

### Step 2: Enable Simulator (No Headset Required)

Open browser: `http://localhost:3000`

- Toggle **Simulator** ON in the left sidebar
- You'll see fake EEG data streaming

### Step 3: Open CSD File in Csound

1. Open **CsoundQt** or **Csound IDE**
2. File → Open → Select example (e.g., `eeg_synth_reverb_effects.csd`)
3. Verify settings match:
   - **Orc Header**: `-odac -d`
   - **OSC Port**: 7400
   - **0dBFS**: 1
4. Press **Render** (play button) or `Cmd+Enter`

### Step 4: Hear Real-Time Synthesis

As EEG data arrives (from simulator or real Muse):

- Notes play as per Score
- EEG channels modulate synthesis parameters in real-time
- Audio outputs to your speakers

### Step 5: Modify Score

Change MIDI notes and durations in the `<CsScore>` section. Example:

```csound
i 2 0 2 60   ; Instrument 2, start at 0s, duration 2s, note C4
i 2 2 2 64   ; E4
i 2 4 2 67   ; G4
```

---

## Parameter Customization

### Change EEG Mapping

Edit the k-rate variable calculations. For example, in **eeg_synth_reverb_effects.csd**:

**Default (cutoff 100-8000 Hz):**

```csound
kCutoff = 100 + (kEEG3_smooth * 7900)
```

**Custom (cutoff 50-15000 Hz):**

```csound
kCutoff = 50 + (kEEG3_smooth * 14950)
```

### Change Filter Type

In **eeg_synth_filters.csd**, modify the thresholds:

```csound
if kEEG3 < 0.5 then
  ; Lowpass
else
  ; Highpass
endif
```

### Change MIDI Notes

Edit the score (bottom of `.csd` file):

```csound
i 2 0 2 69  ; A4 instead of C4
i 2 2 2 71  ; B4
```

### Add More Voices/Oscillators

Duplicate oscillator lines:

```csound
aOsc4 = oscili:a(0.2, kFreqShifted * 0.990)
aMixed = (aOsc1 + aOsc2 + aOsc3 + aOsc4) / 4
```

---

## Troubleshooting

### Issue: No OSC Data Reception

**Check:**

1. Server running? (`npm start` returns `🎵 Server listening...`)
2. Simulator enabled? (Toggle in web UI)
3. Port correct? (Should be 7400)
4. CSD listening on correct port? (Line with `OSCinit 7400`)

**Fix:** Restart server and reload CSD

### Issue: Audio Too Quiet

**Check:**

1. Volume slider (bottom of Csound window)
2. System volume
3. Output amplitude scaling (look for `* 0.7` in output line)

**Fix:** Change output line from `out(aOut, aOut)` to `out(aOut*2, aOut*2)` (caution: may clip)

### Issue: Notes Sound Wrong / Distorted

**Check:**

1. Envelope shape (check ADSR values)
2. Oscillator amplitude (should be < 0.5 each for 3+ oscs)
3. Filter cutoff (may be set too high initially)

**Fix:** Reduce oscillator amplitudes or increase filter resonance value

### Issue: Crashes or Hangs

**Possible causes:**

- Infinite loop in k-rate code
- Division by zero (use `if kValue == 0 then kValue = 0.001`)
- Uninitialized variables

**Fix:** Check console output for error messages, simplify code

---

## Learning Path

**Beginner:**

1. Start with **eeg_synth_filters.csd** (easiest to understand)
2. Modify just the score (MIDI notes)
3. Understand EEG→parameter mapping

**Intermediate:**

1. Try **eeg_synth_reverb_effects.csd**
2. Experiment with filter cutoff/resonance ranges
3. Learn about envelope shaping

**Advanced:**

1. Explore **eeg_synth_fm_modulation.csd** (complex synthesis)
2. Try **eeg_synth_panning.csd** (stereo processing)
3. Combine techniques from multiple files

**Expert:**

1. Modify **eeg_synth_granular.csd** (texture design)
2. Create your own synth combining techniques
3. Add UDOs (User-Defined Opcodes)

---

## Additional Resources

- **Csound Manual**: https://csound.com/docs/manual/
- **FM Synthesis**: https://en.wikipedia.org/wiki/Frequency_modulation_synthesis
- **Granular Synthesis**: https://www.audio-accessibility.com/granular.html
- **Muse EEG Bands**: See `MUSE2_TO_CSOUNDQT.md`

---

## Next Steps

### Create Your Own Synth

Combine elements from multiple examples:

```
1. Start with oscillator bank from eeg_synth_filters.csd
2. Add reverb from eeg_synth_reverb_effects.csd
3. Add panning from eeg_synth_panning.csd
4. Use FM modulation from eeg_synth_fm_modulation.csd
```

### Save Custom Versions

```bash
cp eeg_synth_filters.csd eeg_synth_my_custom.csd
```

### Add MIDI Keyboard Control

Extend the score to read MIDI events (requires additional code)

### Record Output

Add `-o output.wav` to CsOptions to save audio file

---

## Support

For issues:

1. Check the troubleshooting section above
2. Review Csound error messages in console
3. Verify OSC connection (check Node.js server logs)
4. Simplify code to isolate the problem

---

**Created**: April 2026  
**Csound Version**: 6.18+  
**Updated for**: Muse 2/S Headband
