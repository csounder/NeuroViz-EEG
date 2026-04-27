# Upgrading to Csound 7

Csound 7 has **full OSC input support** and proper UDO syntax. This guide shows how to upgrade and use the improved OSC synth.

## macOS Installation

### Option 1: Homebrew (Recommended)

```bash
# Install Csound 7
brew install csound

# Verify installation
csound --version
```

### Option 2: Download from csound.com

1. Visit [csound.com/download](https://csound.com/download)
2. Download Csound 7 for macOS
3. Run installer
4. Verify: `csound --version` (should show version 7.x)

## Csound 7 Improvements for OSC

### Key Changes:
- ✅ **udp_recv** opcode for receiving OSC
- ✅ **Proper UDO type strings**: `opcode Name, a, ak` (not old-style)
- ✅ **Type-safe variable naming**: `aOut = oscili(...)` (not `kOut`)
- ✅ **Better error messages**
- ✅ **Plugin support** (opcodes via plugins)

### Running Csound 7 with OSC

```bash
cd /path/to/muse-eeg-server

# Run the Csound 7 OSC synth (receives on port 7400)
csound examples/eeg_synth_csound7.csd
```

The synth will:
1. Listen for `/muse/eeg` messages on **port 7400**
2. Extract 4 EEG channels from each message
3. Use **channel 1** to modulate **frequency** (100-500 Hz)
4. Use **channel 2** to modulate **amplitude** (0-0.2)
5. Use **channel 3** to modulate **filter cutoff** (500-5000 Hz)
6. Output stereo audio in real-time

## Testing the Connection

### Terminal 1: Start Node.js Server
```bash
cd muse-eeg-server
node server-enhanced.js
```

### Terminal 2: Run Csound 7 Synth
```bash
cd muse-eeg-server
csound examples/eeg_synth_csound7.csd
```

### Terminal 3: Enable Simulator
```bash
# Open http://localhost:3000
# Toggle "Enable Test Mode" in left sidebar
```

You should now **hear audio that responds to simulated EEG data in real-time!**

## Csound 7 Example Breakdown

```csound
; Receive OSC messages on port 7400
iOscHandle OSCinit 7400

; In an instrument, listen for /muse/eeg messages
kk OSCraw iOscHandle, "/muse/eeg", "ffff"

; Extract the 4 float values
if kk == 1 then
  gkEEG1 = OSCparam:f(0)  ; Channel 1
  gkEEG2 = OSCparam:f(1)  ; Channel 2
  gkEEG3 = OSCparam:f(2)  ; Channel 3
  gkEEG4 = OSCparam:f(3)  ; Channel 4
endif
```

This is **much simpler and more reliable** than Csound 6!

## Troubleshooting

### "Port already in use"
- Make sure no other Csound is running: `pkill csound`
- The Node.js server sends to 7400, Csound listens on 7400 ✓

### "No audio output"
- Check that Csound is running and listening on port 7400
- Verify simulator is enabled in the dashboard
- Check audio device in Csound startup: `csound -o system:playback_ examples/eeg_synth_csound7.csd`

### "OSC messages not arriving"
- Verify Node.js server is sending: check logs for `🎵 OSC: ... packets sent to Csound`
- Verify Csound listening: look for `OSC: listening on port 7400`
- Check firewall isn't blocking localhost UDP 7400

## Next Steps

- Create custom UDOs (User Defined Opcodes) for more complex synthesis
- Add MIDI input alongside EEG
- Route audio through effects (reverb, delay, filters)
- Record OSC data for playback
