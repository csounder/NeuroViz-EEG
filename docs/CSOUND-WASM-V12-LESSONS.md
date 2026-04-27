# Csound WASM V12 Lessons Learned

Date: April 25, 2026

This note captures the current working browser Csound strategy for NeuroVis V12 and the debugging path that got it working.

## Current Working Recipe

- Use `@csound/browser` pinned to Csound 6 stable: `6.18.7`.
- Load Csound only in the browser with a dynamic import.
- Let Csound create its own WebAudio context with `Csound()`.
- Compile a small browser-safe orchestra with `compileOrc()`.
- Start WebAudio with `csound.start()` from a user gesture.
- Keep performance alive with both a long score hold and a silent keepalive instrument:
  - `f 0 86400`
  - `i 999 0 86400`
- Send browser/EEG values through Csound control channels with `setControlChannel()`.
- Trigger notes and USB MIDI performance with `inputMessage()` score events.

## Why The Full Desktop V12 CSD Is Not The Browser Path Yet

The desktop V12 CSD is still the main musical reference, but the full file is too fragile for direct browser performance right now. The browser implementation therefore uses a lightweight V12-inspired orchestra.

Problems seen with the full or direct path:

- Full CSD compilation was heavy enough to freeze the browser.
- Desktop OSC opcodes (`OSCinit`, `OSClisten`) are not appropriate inside the browser page.
- Desktop keyboard sensing (`sensekey`) is replaced by React keyboard handlers.
- Csound MIDI auto assignment (`massign`) conflicted with browser MIDI handling.
- Some Csound 7 beta browser API behavior did not match the runtime methods available in the package.

## Important Fixes

- Do not call `csound.perform()` for this Csound 6 browser path. `start()` begins WebAudio performance.
- Do not assume `cleanup()` exists. Check for the method before calling it.
- Do not use `csound.midiMessage()` in this build. It caused `null function` worklet crashes.
- Do not use `massign 0, 5` in the browser orchestra. Browser MIDI is converted to score events instead.
- Do not send k-rate variables to `outs`. Use audio-rate signals for audio output, even for silence.
- Do not call `AudioContext.setSinkId("default")`. Treat the system default device as a no-op.
- Keep the Csound renderer mounted on the active performance page. Moving from `/v12` to `/concert` unmounts the V12 page, which stops its Csound/MIDI component.

## Current Performance Design

There are now two places to use V12 browser audio:

- `/v12`: the full V12 workstation with EEG stream displays, shortcuts, controls, Csound, USB MIDI, and diagnostics.
- `/concert`: the stage page with concert visuals and an embedded V12 Csound/MIDI panel, so MIDI can keep playing while concert visuals are on screen.

The browser Csound instrument now includes:

- A selectable EEG orchestra library that moves from simple demonstration mappings to more intelligent musical models.
- Sensor-family solo/mute controls for Raw EEG, Bands, Accelerometer, Gyro, Heart/PPG, and fNIRS.
- Richer chord voicings from each MIDI note.
- EEG-driven brightness and stereo width.
- Low bass support inside each chord voice.
- Warm filtering, delay-like stereo spread, and global Csound reverb for concert size.
- Six performance presets: Mellow Pad, Glass Choir, Dark Hybrid, Huge Stage, Meditative, and Frenetic.
- A Panic / Reset Audio button that stops the browser Csound engine and clears held-note state.

Current orchestra models:

- `01 Raw EEG Pitch Lab`: clear teaching model where raw Muse channels gently bend pitch.
- `02 Band Power Organ`: delta through gamma become a slow five-register harmonic organ.
- `03 Sensor Quartet`: raw EEG, band power, accelerometer, and gyro each play a musical role.
- `04 Heart / Motion Temple`: PPG and movement shape pulsing resonance and spacious drones.
- `05 V12 Concert Pad`: the current MIDI-playable V12-inspired sonification.
- `06 Beyond V12 Generative`: more autonomous musical texture with EEG-shaped harmony and color.

## Test Checklist

1. Start the backend: `npm start`
2. Start the web app: `cd web && npm run dev`
3. Open `http://localhost:3001/v12` or `http://localhost:3001/concert`.
4. Press `Start Audio`.
5. Press `Audition Csound Engine`.
6. Press `Audition V12 MIDI Chord`.
7. Press `Enable USB MIDI`.
8. Select the MIDI keyboard.
9. Play notes from the USB keyboard.
10. On `/concert`, change scenes with `1-9, 0` and confirm MIDI still plays.

## Backup Notes

The repository currently has many untracked and modified files, including work that predates this pass. Before pushing to GitHub, review the working tree and decide whether to commit everything as a large checkpoint or split it into smaller commits.

Recommended checkpoint message:

```text
Add browser V12 Csound and concert performance mode
```

