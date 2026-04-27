# NeuroVis Next Steps - Post-Meeting Summary

## Current Status

### ✅ What's Working

- Server generating simulator data (17,000+ packets confirmed)
- WebSocket messages flowing (eeg, bandPowers, motionData)
- All DOM errors fixed in app.js
- Muse 2 hardware detected and paired successfully
- `/api/bands` endpoint now returns real data when simulator is ON

### ❌ What's Broken

- **React UI still shows no waveforms/data** when simulator is ON
- Root cause identified: UI polls `/api/bands` but doesn't update visualization

## The Simulator Problem

I investigated NeurOSC's working simulator and found the key difference:

**NeurOSC (Working)**:

- Generates realistic raw EEG using sine waves at different brain wave frequencies
- Buffers samples in memory
- Computes band powers from buffered samples using FFT
- UI polls endpoint → gets real computed data

**NeuroVis (Broken)**:

- Generates random band power values directly
- No realistic frequency components
- UI receives data but doesn't render it

## Two Paths Forward

### Path 1: Quick Debug Fix (1 hour)

Find why React UI ignores the data it's receiving and make it display.

**Pros**: Fast, might work
**Cons**: Still unrealistic random data

### Path 2: Proper NeurOSC-Style Simulator (3-4 hours)

Port NeurOSC's realistic signal generation to NeuroVis.

**Pros**:

- Realistic brain waves with proper frequency bands
- Useful for testing/debugging
- Matches proven implementation

**Cons**: More work

I recommend **Path 2** - do it right once.

## UI Reorganization Requirements

You requested reordering display buttons to:

1. Power + Timeline
2. FFT + Bands
3. 3D Waterfall
4. **Traces/FFT/Bands Combined** (NEW from NeurOSC)
5. Neuro (?)
6. **Mental State** (NEW - Calm/Meditative/Focused)
7. Phase
8. Coherence
9. PPG/HR-Muse
10. IMU-Muse
11. fNIRS-Athena
12. Connect
13. Processing
14. Presets
15. OSC
16. OSC Monitoring
17. Recording

### Questions I Need Answered

1. **What is "Neuro" view?** Is this a specific visualization you have in mind?

2. **Combined Traces/FFT/Bands view**: Should this be:
   - A) Single panel with 3 stacked sub-panels
   - B) Switchable tabs
   - C) Side-by-side layout

3. **Mental State view**: NeurOSC shows:
   - Engagement Index (Beta / Alpha+Theta)
   - Meditation score
   - Focus score
   - State labels (Calm, Meditative, Focused, Drowsy)

   Do you want this exact same implementation?

4. **Dropdown menu**: You asked "should all these be in a dropdown menu on top?"
   - A) Replace buttons with dropdown
   - B) Keep buttons, add dropdown for overflow
   - C) Both - toolbar for common views + dropdown for all

5. **Quad View dropdowns**: You want all 17 views available in quad view panel selectors?
   - This is straightforward - just add all views to the dropdown options

## My Recommendations

### Priority Order

1. **Fix simulator first** (Path 2 - realistic signal)
   - Get data displaying properly
   - Test with hardware once working

2. **Add Mental State view**
   - Very useful for neurofeedback
   - Port from NeurOSC

3. **Reorder existing buttons**
   - Quick wins
   - Better organization

4. **Add Combined Traces/FFT/Bands**
   - New visualization
   - Popular in NeurOSC

5. **Update Quad View dropdowns**
   - Include all 17 views

### Estimated Time

- Simulator fix: 3-4 hours
- Mental State view: 2-3 hours
- Button reorder: 30 minutes
- Combined view: 2-3 hours
- Quad View update: 1 hour

**Total: ~10-12 hours of work**

## Quick Wins While You Decide

I can immediately do these without clarification:

1. ✅ **Reorder existing buttons** - I know the order you want
2. ✅ **Add all views to Quad View dropdowns** - straightforward
3. ❓ **Debug why UI doesn't render** - might find quick fix

## Files Ready for Review

- `/Users/richardboulanger/dB-Studio/NeuroVis/SIMULATOR-FIX-PLAN.md` - Detailed technical plan
- `/Users/richardboulanger/dB-Studio/NeuroVis/MEETING-SUMMARY.md` - This file

## When You Return

Please answer:

1. Simulator fix: Path 1 (quick) or Path 2 (proper)?
2. What is "Neuro" view #5?
3. How should Combined view (#4) be laid out?
4. Mental State - same as NeurOSC or different?
5. Button vs dropdown vs both?

I'll start with the quick wins (button reorder + quad view) while waiting for your answers.

---

**Current Server Status**: Running on PID 15660, simulator ON, waiting for UI fix.
