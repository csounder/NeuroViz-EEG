# Muse 2 → OSC → CsoundQt Live Setup

Complete guide for streaming real Muse 2 EEG data to Csound running in CsoundQt.

## 🔌 Prerequisites

### Hardware
- **Muse 2 headset** (paired with your Mac)
- Ensure it's fully charged and nearby

### Software
- **Node.js server** (already set up)
- **CsoundQt** (IDE with Csound 6+)
  - Download: [csound.com/download](https://csound.com/download)
  - Or: `brew install csound-qt`

## 📋 Step-by-Step Setup

### Step 1: Start the Node.js Server

```bash
cd muse-eeg-server
node server-enhanced.js
```

You should see:
```
✓ OSC client ready → 127.0.0.1:7400
✓ Web UI: http://localhost:3000
✓ WebSocket: ws://localhost:8080
✓ DSP Pipeline: ACTIVE
✓ Simulator Mode: OFF

Waiting for Muse devices or simulator mode...
```

### Step 2: Open the Web Dashboard

Open browser to **http://localhost:3000**

You should see:
- Left sidebar with **📱 Device** section
- A device list (may show "No devices found" initially)

### Step 3: Put on Muse 2 Headset

- Position the headset on your head
- Ensure all 4 electrodes touch your forehead
- Wait 3-5 seconds for connection

### Step 4: Look for Your Muse 2 Device

In the web dashboard, the device list should update:
```
📱 Devices found: 1
  MuseS-XXXX  or  Muse2-XXXX
```

The "📱 Device" indicator at the top right should turn **GREEN** when found.

### Step 5: Connect to the Device

Click the device name in the list:
```
[MuseS-FDE6] ← Click here
```

You should see:
- **"🔗 Connecting..."** message
- In terminal: `[STATUS] 🔗 Connecting to MuseS-XXXX...`
- After 5-10 seconds: real-time EEG data flowing in the dashboard!

### Step 6: Verify EEG Data

Check the **Raw EEG** tab:
- You should see 4 waveforms changing in real-time
- Look at the **Statistics** tab for min/max/mean values
- Switch to **Band Powers** to see frequency analysis

### Step 7: Check OSC Server Logs

In your terminal, you should see:
```
🎵 OSC: 256 packets sent to Csound
🎵 OSC: 512 packets sent to Csound
🎵 OSC: 768 packets sent to Csound
...
```

This confirms data is being sent to **localhost:7400**

### Step 8: Open CsoundQt

Launch CsoundQt:
```bash
csoundqt
```

Or if installed via Homebrew:
```bash
open /usr/local/opt/csound-qt/CsoundQt.app
```

### Step 9: Create or Open a Csound File

In CsoundQt, create a new file or open one.

### Step 10: Paste Csound Instrument

Copy this Csound code into CsoundQt's **Orchestra** tab:

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

; Global EEG values (0-1 range)
gkEEG1 init 0  ; Frequency
gkEEG2 init 0  ; Amplitude
gkEEG3 init 0  ; Filter
gkEEG4 init 0  ; Effect

; OSC Initialization (listen on port 7400)
giOscHandle OSCinit 7400

; ============================================================================
; Instrument 0: OSC Receiver (k-rate continuous polling)
; ============================================================================
instr 0
  kAddr[] fillarray "/muse/eeg"
  kReceived OSCraw giOscHandle, kAddr[0], "ffff"
  
  if kReceived == 1 then
    gkEEG1 = OSCparam:f(0)
    gkEEG2 = OSCparam:f(1)
    gkEEG3 = OSCparam:f(2)
    gkEEG4 = OSCparam:f(3)
  endif
endin

; ============================================================================
; Instrument 1: EEG-Modulated Synthesis
; ============================================================================
instr 1
  ; Map EEG channels to synthesis parameters
  kfreq = 100 + (gkEEG1 * 400)      ; 100-500 Hz
  kamp = gkEEG2 * 0.2                ; 0-0.2 amplitude
  kcutoff = 500 + (gkEEG3 * 4500)   ; 500-5000 Hz
  
  ; Synthesis
  aout = oscili(kamp, kfreq, 1)
  
  ; Filter
  aout = moogladder(aout, kcutoff, 0.5)
  
  ; Output
  out aout, aout
endin

</CsInstruments>

<CsScore>
; Function table: sine wave
f 1 0 4096 10 1

; Start OSC receiver (instrument 0)
i 0 0 3600

; Start synthesis (instrument 1)
i 1 0 3600
</CsScore>
</CsoundSynthesizer>
```

### Step 11: Run in CsoundQt

1. In CsoundQt, click **RUN** button (or press `Ctrl+Return`)
2. You should see console output:
   ```
   Csound version 6.18 or 7.x
   audio buffered in 1024 sample-frame blocks
   ```

3. **Important:** Make sure your system audio output is NOT MUTED

### Step 12: Listen for Audio

Put on headphones or turn up speakers.

**You should hear a tone that changes based on your brain activity!**

- **Frequency**: Changes with frontal lobe activity (EEG1)
- **Amplitude**: Changes with overall signal strength (EEG2)
- **Brightness**: Changes with filter cutoff (EEG3)

## 🔧 Troubleshooting

### "No devices found"
- **Check**: Bluetooth is on and Muse 2 is paired
- **Check**: Muse 2 is charged and nearby (< 10 meters)
- **Check**: Device isn't already connected to another app
- **Try**: Turn Muse 2 off/on, click refresh in dashboard

### "Connecting... but no data"
- **Check**: Headset electrodes are touching your skin
- **Check**: Try moving the headset slightly to adjust contact
- **Check**: Muse battery level isn't too low
- **Wait**: Sometimes takes 10-20 seconds to establish

### "Csound shows no OSC messages"
- **Check**: Server logs show `🎵 OSC: ... packets sent`
- **Check**: Port 7400 is not blocked (firewall)
- **Check**: Both terminal windows running (Node.js + CsoundQt)

### "No audio in Csound"
- **Check**: CsoundQt **RUN** button is active (press again)
- **Check**: System audio NOT muted
- **Check**: Audio device selected correctly in CsoundQt
- **Check**: Csound shows `dac` (digital-to-analog converter) active

### "Audio is very quiet"
- Increase amplitude: change `kamp = gkEEG2 * 0.2` to `0.5`
- Increase oscillator volume: change `oscili(kamp, ...)` to `oscili(kamp * 2, ...)`

## 🎛️ Customizing the Instrument

### Change Frequency Range
```csound
kfreq = 50 + (gkEEG1 * 250)   ; 50-300 Hz
kfreq = 200 + (gkEEG1 * 800)  ; 200-1000 Hz
```

### Add More Synthesis
```csound
; FM Synthesis
amod = oscili(100, 5, 1)          ; Modulator
aout = oscili(kamp, kfreq + amod, 1)

; Additive (multiple oscillators)
aout = oscili(kamp/2, kfreq, 1) + oscili(kamp/4, kfreq*2, 1)
```

### Add Effects
```csound
; Reverb
aout = reverb(aout, 2.5)

; Delay
adelay = aout
aout = adelay + delay(aout, 0.5)

; Distortion
aout = tanh(aout * 5) / 5
```

## 📊 Understanding EEG Channels

Each channel represents electrode position:

| Channel | Location | Activity |
|---------|----------|----------|
| **Ch1** (AF7) | Left forehead | Left hemisphere |
| **Ch2** (AF8) | Right forehead | Right hemisphere |
| **Ch3** (TP9) | Left temple | Temporal lobe |
| **Ch4** (TP10) | Right temple | Temporal lobe |

**Typical Values:**
- Eyes closed, relaxed: Low amplitude (0.1-0.3)
- Eyes open, focused: Moderate (0.3-0.6)
- Eye movement, muscle tension: High (0.7-1.0)

## ⏱️ Full Workflow Timing

| Step | Time |
|------|------|
| Start Node.js | 5 sec |
| Open dashboard | 2 sec |
| Find Muse device | 3-5 sec |
| Connect to Muse | 10-20 sec |
| Open CsoundQt | 5 sec |
| Paste code | 1 sec |
| Run Csound | 2 sec |
| **Total** | **~1 minute** |

## 🎯 Next Steps

Once working:

1. **Create more instruments** in Csound (add to score)
2. **Explore different synthesis techniques** (FM, granular, additive)
3. **Add real-time effects** (reverb, delay, distortion)
4. **Visualize the data** (spectrum display in CsoundQt)
5. **Build a performance piece** with multiple sections
6. **Record the audio** output for playback

## 📚 Resources

- **CsoundQt Manual**: [csound.com/docs](https://csound.com/docs)
- **Muse Device Info**: [choosemuse.com](https://choosemuse.com)
- **OSC Format**: [opensoundcontrol.org](http://opensoundcontrol.org)
- **Csound Tutorial**: [floss.ccm.ucm.es/manual](http://floss.ccm.ucm.es/manual/)

## ✅ Quick Checklist

Before starting:
- [ ] Muse 2 paired with Mac
- [ ] Muse 2 fully charged
- [ ] Node.js server running (`node server-enhanced.js`)
- [ ] Web dashboard open (http://localhost:3000)
- [ ] CsoundQt installed
- [ ] Headphones or speakers ready
- [ ] System audio NOT muted

---

**You're all set!** 🧠🎵

Questions? Check server logs with: `tail -f /tmp/server.log`
