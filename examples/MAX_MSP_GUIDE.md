# Muse EEG Synthesis with Max/MSP

Max/MSP provides **full real-time OSC support** and visual programming for live synthesis. This guide shows how to set up OSC-driven EEG synthesis in Max.

## Requirements

- **Max 8 or later** ([cycling74.com](https://cycling74.com/downloads))
- **o.io library** (for OSC) - Install via Package Manager
- **gen~** (for custom synthesis) - Included with Max

## Quick Setup

### 1. Install o.io Library

```
Max → Cmd+Shift+O → Search "o.io" → Install
```

### 2. Open the Patch

```bash
# Copy the example file
cp examples/EEG_Synth.maxpat ~/Documents/Max\ Patches/

# Open in Max
open ~/Documents/Max\ Patches/EEG_Synth.maxpat
```

### 3. Check Receiving OSC

Max will automatically listen on **port 7400** for `/muse/eeg` messages.

Open Max console (`Cmd+J`) to verify:
```
OSC: listening on port 7400
```

## Signal Flow

```
Node.js (port 7400)
    ↓
    OSC: /muse/eeg [ch1, ch2, ch3, ch4]
    ↓
Max udpreceive (port 7400)
    ↓
o.route (parse OSC messages)
    ↓
[Ch1 Frequency] [Ch2 Amplitude] [Ch3 Filter] [Ch4 Effect]
    ↓
oscil~ (synthesis)
    ↓
ezdac~ (audio output)
```

## Building a Custom Patch from Scratch

### Step 1: Receive OSC

```
Put down → udpreceive (set port to 7400)
          → o.display (to see incoming data)
```

### Step 2: Parse OSC into Components

```
o.route /muse/eeg
  ↓
[outlet] → [number] (ch1 - frequency)
[outlet] → [number] (ch2 - amplitude)
[outlet] → [number] (ch3 - filter)
[outlet] → [number] (ch4 - effect)
```

### Step 3: Map to Synthesis Parameters

```
Ch1 (0-1) → * 400 → + 100 → freq~ (100-500 Hz)
Ch2 (0-1) → * 0.2 → * (amplitude)
Ch3 (0-1) → * 5000 → + 500 → moogladder cutoff
Ch4 (0-1) → effects selection
```

### Step 4: Generate Audio

```
oscil~ (frequency, 100ms ramp)
  ↓
* (amplitude from ch2)
  ↓
moogladder~ (cutoff from ch3)
  ↓
ezdac~ (output)
```

## Example Patch Objects

### Receive OSC
```
[udpreceive 7400]
|
[o.display]  ← Shows incoming /muse/eeg messages
```

### Parse and Route
```
[udpreceive 7400]
|
[o.route /muse/eeg]
|    |    |    |
|    |    |    └→ [number]  (ch4)
|    |    └→ [number]  (ch3)
|    └→ [number]  (ch2)
└→ [number]  (ch1)
```

### Synthesis Example
```
[ch1: 0-1] → [* 400] → [+ 100] → [number~] → [oscil~ 100]
                                              |
[ch2: 0-1] → [* 0.2] → [number~] → [* ] ←−−┘
                         |           |
                         └−−−−−−−−−−−┘
                              |
[ch3: 0-1] → [* 5000] → [+ 500] → [moogladder~] 
                         |           |
                         └−−−−−−−−−−−┘
                              |
                           [ezdac~]
```

## Running the Full System

### Terminal 1: Node.js Server
```bash
cd muse-eeg-server
node server-enhanced.js
```

### Terminal 2: Browser Dashboard
```
Open http://localhost:3000
Toggle "Enable Test Mode"
```

### Max
```
1. Open EEG_Synth.maxpat
2. Click the ezdac~ power button to enable audio
3. Listen to the real-time synthesis!
```

## Parameter Mappings

| EEG Channel | Parameter | Range | Effect |
|------------|-----------|-------|--------|
| Ch1 | Oscillator Frequency | 100-500 Hz | Pitch/Tone Height |
| Ch2 | Amplitude | 0-0.2 | Volume |
| Ch3 | Filter Cutoff | 500-5000 Hz | Brightness/Warmth |
| Ch4 | Effect Select | 0-1 | Effect Amount |

## Advanced: Multiple Synths

Create multiple signal chains responding to different channels:

```
; Synth 1: Frequency modulation
Ch1 → Carrier Freq
Ch2 → Mod Depth
Ch3 → Mod Freq

; Synth 2: Additive
Ch1 → Harmonic Ratio
Ch2 → Harmonic Amplitude
Ch3 → Filter

; Mix both outputs
```

## Troubleshooting

### "No audio"
- Make sure ezdac~ is turned ON (power button)
- Check system audio output device
- Verify OSC is arriving: look at o.display output

### "No OSC messages"
- Verify Node.js server is running: check logs
- Confirm simulator is enabled in web dashboard
- Check Max console for port binding errors

### "Audio is silent even with messages"
- Increase amplitude multiplier in patch
- Check moogladder cutoff isn't too low
- Verify oscil~ frequency is in valid range

## Resources

- **Max/MSP Docs**: [cycling74.com/docs](https://cycling74.com/docs)
- **o.io Library**: [jamoma.org](https://jamoma.org)
- **OSC Spec**: [opensoundcontrol.org](http://opensoundcontrol.org)

## Next Steps

- Add visual feedback (spectrum analyzer, waveform display)
- Record OSC data for playback
- Add effects (reverb, delay, granulation)
- Create MIDI output alongside OSC
- Build preset system for different synthesis modes
