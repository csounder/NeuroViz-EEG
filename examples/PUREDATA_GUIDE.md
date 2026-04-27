# Muse EEG Synthesis with Pure Data

Pure Data is a **free, open-source visual programming language** for audio and multimedia with excellent OSC support.

## Installation

### macOS

**Option 1: Homebrew (Recommended)**
```bash
brew install pure-data
```

**Option 2: Download**
1. Visit [puredata.info](http://puredata.info)
2. Download Pure Data for macOS
3. Run installer

Verify:
```bash
pd --version
```

## Quick Start

### 1. Open the Patch

```bash
open examples/eeg_synth.pd
```

### 2. Enable Audio

```
In Pd main window:
Audio ON button (checkbox) → Click to enable
```

### 3. Start Listening for OSC

The patch listens on **port 7400** for `/muse/eeg` messages.

Look for messages in the console showing incoming values.

## Signal Flow

```
Node.js (port 7400)
    ↓ OSC /muse/eeg
Pd netreceive (port 7400)
    ↓
oscparse
    ↓
route /muse/eeg
    ↓
[4 float atoms: ch1, ch2, ch3, ch4]
    ↓
[* 400 + 100] [* 0.2] [* 5000 + 500]
    ↓
osc~ → *~ → moogladder~ → dac~
```

## Building from Scratch

### Step 1: Create New Patch

```
File → New
```

### Step 2: Add Objects (Put dropdown → Object)

```
netreceive -u -b 7400    (listen on port 7400 for UDP)
oscparse                  (parse OSC messages)
route /muse/eeg          (extract /muse/eeg path)
```

### Step 3: Add Number Boxes (Put → Number)

Four number boxes to display:
- Ch1 (frequency input)
- Ch2 (amplitude input)
- Ch3 (filter cutoff input)
- Ch4 (reserved)

### Step 4: Add Synthesis Objects

```
* 400                     (scale ch1 by 400)
+ 100                     (add 100 offset to ch1 → 100-500 Hz)
* 0.2                     (scale ch2 to amplitude)
* 5000                    (scale ch3 by 5000)
+ 500                     (add 500 offset to ch3 → 500-5000 Hz)
osc~                      (oscillator)
moogladder~               (filter)
dac~                      (audio output)
```

### Step 5: Connect with Cords

Pull cables between objects:

```
netreceive → oscparse → route → [number boxes]
                                    ↓
                        [scaling operations]
                                    ↓
                    [osc~ ] → [*~] → [moogladder~] → [dac~]
                      ↑                                  ↑
                   [freq]                           [audio out]
```

## Complete Example Patch Structure

```
[netreceive -u -b 7400] (listen on 7400)
     |
[oscparse]              (parse OSC)
     |
[route /muse/eeg]       (extract path)
   |  |  |  |
   |  |  |  └→ [floatatom] (ch4)
   |  |  └→ [floatatom] (ch3) → [* 5000] → [+ 500]
   |  └→ [floatatom] (ch2) → [* 0.2]
   └→ [floatatom] (ch1) → [* 400] → [+ 100]
                                      |
                                   [osc~ ]
                                      |
                                   [*~] ← [amplitude from ch2]
                                      |
                                 [moogladder~] ← [cutoff from ch3]
                                      |
                                    [dac~]
```

## Running the Full System

### Terminal 1: Node.js Server
```bash
cd muse-eeg-server
node server-enhanced.js
```

### Terminal 2: Web Dashboard
```
Open http://localhost:3000
Toggle "Enable Test Mode"
```

### Pure Data
```
1. Open eeg_synth.pd
2. Click Audio ON in main Pd window
3. Look at floating point boxes to see EEG values
4. Listen to synthesized audio!
```

## Parameter Controls

| Control | Range | Effect |
|---------|-------|--------|
| Ch1 Input (freq) | 0-1 | Maps to 100-500 Hz |
| Ch2 Input (amp) | 0-1 | Maps to 0-0.2 amplitude |
| Ch3 Input (filter) | 0-1 | Maps to 500-5000 Hz cutoff |
| Ch4 Input | 0-1 | Reserved for future use |

## Advanced: GUI Controls

Add interactive controls to tweak synthesis:

```
; Add sliders (Put → hslider, vslider)
[hslider] (0-1 range)
   |
   └→ [* 400] → [+ 100] → [freq]

; Add meters to visualize
[meter~]  (shows audio level)
[fft~]    (shows frequency spectrum)
```

## Troubleshooting

### "No audio"
- Check: Is Audio ON button enabled in main Pd window?
- Check: Is dac~ connected to audio output?
- Check: Is your system audio not muted?

### "No incoming OSC messages"
- Verify Node.js server is running
- Check that simulator is enabled in web dashboard
- In Pd console, you should see `received "list"` messages
- Verify port 7400 is not blocked by firewall

### "Audio is very quiet"
- Increase multiplier: change `[*~ 0.2]` to `[*~ 0.5]`
- Check moogladder resonance: change `0.5` to `0.8`

## Pure Data Resources

- **Documentation**: [puredata.info/docs](http://puredata.info/docs)
- **Tutorial by Miller Puckette**: [msp.ucsd.edu](https://msp.ucsd.edu)
- **Externals**: [disis.music.vt.edu](https://disis.music.vt.edu)

## Pd Objects Reference

| Object | Function |
|--------|----------|
| `netreceive` | Listen for UDP/OSC on port |
| `oscparse` | Parse OSC binary format |
| `route` | Route messages by address |
| `floatatom` | Display/input floats |
| `osc~` | Audio-rate sine oscillator |
| `moogladder~` | Moog-style lowpass filter |
| `dac~` | Digital-to-Analog converter (audio out) |
| `*~` | Audio-rate multiplication (amplitude) |
| `+` | Addition (control rate) |

## Next Steps

- Add spectral display (spectrum analyzer)
- Create multiple independent synth voices
- Add envelope control (ADSR)
- Build effect chain (reverb, delay, distortion)
- Record OSC data to file for playback
- Create presets system
