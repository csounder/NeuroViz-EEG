# Csound 6 OSC Reception with OSClisten

## Correct Syntax

Use **`OSClisten`** (not `OSCraw`/`OSCparam`):

```csound
; Initialize OSC listener on port 7400
gihandle OSCinit 7400

; In an instrument (k-rate):
kk OSClisten gihandle, "/muse/eeg", "ffff", gkEEG1, gkEEG2, gkEEG3, gkEEG4
```

**Parameters:**
- `gihandle` = OSC handle (from `OSCinit`)
- `"/muse/eeg"` = OSC message path
- `"ffff"` = format string (4 floats)
- `gkEEG1, gkEEG2, gkEEG3, gkEEG4` = output variables

## How It Works

`OSClisten` is **non-blocking** - it returns immediately with:
- `kk == 1` → Message received, variables updated
- `kk == 0` → No message available yet

This is perfect for continuous monitoring at k-rate.

## Complete Example

```csound
<CsoundSynthesizer>
<CsOptions>
-odac -d -m0
</CsOptions>

<CsInstruments>
sr = 44100
ksmps = 64
nchnls = 2
0dbfs = 1

; Global EEG values
gkEEG1 init 0
gkEEG2 init 0
gkEEG3 init 0
gkEEG4 init 0

; Initialize OSC listener on port 7400
gihandle OSCinit 7400

; Instrument 1: OSC Listener
instr 1
  kk OSClisten gihandle, "/muse/eeg", "ffff", gkEEG1, gkEEG2, gkEEG3, gkEEG4
endin

; Instrument 2: Synthesis
instr 2
  kfreq = 100 + (gkEEG1 * 400)
  kamp = gkEEG2 * 0.2
  kcutoff = 500 + (gkEEG3 * 4500)
  
  aout = oscili(kamp, kfreq, 1)
  aout = moogladder(aout, kcutoff, 0.5)
  
  out aout, aout
endin

</CsInstruments>

<CsScore>
f 1 0 4096 10 1

; Start listener
i 1 0 3600

; Start synthesis
i 2 0 3600
</CsScore>
</CsoundSynthesizer>
```

## Setup Steps

1. **Start Node.js server:**
   ```bash
   node server-enhanced.js
   ```

2. **In CsoundQt, open/create file with above code**

3. **Click RUN**

4. **Open dashboard at http://localhost:3000**

5. **Connect your Muse 2**

6. **Listen!** 🎵

## Debugging

If no audio, add debug output:

```csound
instr 1
  kk OSClisten gihandle, "/muse/eeg", "ffff", gkEEG1, gkEEG2, gkEEG3, gkEEG4
  if kk == 1 then
    printks "OSC: Ch1=%f Ch2=%f\n", 0.1, gkEEG1, gkEEG2
  endif
endin
```

Check CsoundQt console for output.

## Resources

- Csound Manual: [OSClisten](https://csound.com/docs/manual/OSClisten.html)
- Your working example: `MuseV1NeuroVis.csd`

---

**That's it!** Much simpler than `OSCraw`/`OSCparam`. 🎵
