<CsoundSynthesizer>
<CsOptions>
-odac -d -m0
</CsOptions>

<CsInstruments>

sr = 44100
ksmps = 100
nchnls = 2
0dbfs = 1.0

; ============================================================================
; Muse 2 EEG → OSC → Csound Real-Time Synthesis
; ============================================================================
; 
; This instrument receives raw EEG data from a Muse 2 headset via OSC
; sent from a Node.js server running the Muse EEG Dashboard.
;
; OSC MESSAGE FORMAT:
;   Path:   /muse/eeg
;   Format: "ffff" (4 floats)
;   Values: [ch1, ch2, ch3, ch4] (normalized 0-1 range)
;
; SETUP:
;   1. Start Node.js server:     node server-enhanced.js
;   2. Open web dashboard:       http://localhost:3000
;   3. Connect your Muse 2
;   4. Run this Csound file in CsoundQt
;   5. Put on MIDI device (e.g., Novation LaunchKey Mini)
;   6. Press keys to trigger notes
;   7. EEG data modulates pitch, timbre, and effects!
;
; ============================================================================

; Initialize reverb globals
garvbL init 0
garvbR init 0

; Initialize delay globals
gadelL init 0
gadelR init 0

; EEG channel globals (0-1 range, normalized by server)
gkEEG_Ch1 init 0  ; Channel 1 (AF7 - Left forehead)
gkEEG_Ch2 init 0  ; Channel 2 (AF8 - Right forehead)
gkEEG_Ch3 init 0  ; Channel 3 (TP9 - Left temple)
gkEEG_Ch4 init 0  ; Channel 4 (TP10 - Right temple)

; MIDI assignment
massign 1, 2

; Schedule continuous instruments
schedule 1, 0, -1  ; OSC Listener (receives EEG data)
schedule 3, 0, -1  ; Reverb effect
schedule 4, 0, -1  ; Delay effect

; ============================================================================
; Instrument 1: OSC Listener - Receives EEG data from Node.js
; ============================================================================
; This instrument runs continuously and listens for OSC messages.
; When a /muse/eeg message arrives, it updates the global EEG variables.
;
instr 1

  ; Initialize OSC listener on port 7400 (standard for Csound/Max/MSP)
  gihandle OSCinit 7400

  ; Listen for /muse/eeg messages with 4 float values
  ; Returns: 1 if message received, 0 otherwise
  kk OSClisten gihandle, "/muse/eeg", "ffff", gkEEG_Ch1, gkEEG_Ch2, gkEEG_Ch3, gkEEG_Ch4
  
  ; Optional: Debug output to see incoming EEG values
  ; Uncomment next 3 lines to see live values in console
  ; if kk == 1 then
  ;   printks "EEG: Ch1=%f Ch2=%f Ch3=%f Ch4=%f\n", 0.1, gkEEG_Ch1, gkEEG_Ch2, gkEEG_Ch3, gkEEG_Ch4
  ; endif

endin

; ============================================================================
; Instrument 2: MIDI-Triggered Synth (modulated by EEG)
; ============================================================================
; This instrument receives MIDI note data and uses EEG channels to modulate
; the synthesized sound.
;
; MIDI CC MAPPING (Novation LaunchKey Mini):
;   CC 21 → Speed of oscillation 1 (EEG Ch1 modulation)
;   CC 22 → Speed of oscillation 2 (EEG Ch2 modulation)
;   CC 23 → Speed of oscillation 3 (EEG Ch3 modulation)
;   CC 24 → Speed of oscillation 4 (EEG Ch4 modulation)
;
; EEG MODULATION:
;   gkEEG_Ch1 → Pitch transposition (higher EEG = higher pitch offset)
;   gkEEG_Ch2 → Amplitude modulation (higher EEG = louder)
;   gkEEG_Ch3 → Timbre (modulates additional oscillators)
;   gkEEG_Ch4 → Effects wet/dry mix
;
instr 2
 
  ; ========== MIDI CC CONTROL ==========
  ; Read 4 CC values from MIDI controller
  ; These control the speed of modulation for each EEG channel
  
  kspeed1 midic7 21, .01, 40      ; Speed for EEG Ch1 modulation
  kspeed2 midic7 22, .01, 50      ; Speed for EEG Ch2 modulation
  kspeed3 midic7 23, .01, 100     ; Speed for EEG Ch3 modulation
  kspeed4 midic7 24, .01, 10      ; Speed for EEG Ch4 modulation
  
  ; Create metronomes at each speed
  ktrig1 metro kspeed1
  ktrig2 metro kspeed2
  ktrig3 metro kspeed3
  ktrig4 metro kspeed4
  
  ; Sample-and-hold the EEG values at metronome rate
  ; This creates stepped modulation of the EEG signals
  kf1 samphold gkEEG_Ch1, ktrig1
  kf2 samphold gkEEG_Ch2, ktrig2
  kf3 samphold gkEEG_Ch3, ktrig3
  kf4 samphold gkEEG_Ch4, ktrig4
  
  ; ========== PITCH CALCULATION ==========
  ; Get MIDI note and convert to frequency
  icps cpsmidi
  
  ; Transpose pitch based on EEG Ch1 (range: -12 to +12 semitones)
  ktranspose1 = (kf1 * 24) - 12      ; Convert 0-1 to -12 to +12 semitones
  ktranspose2 = (kf2 * 24) - 12      ; EEG Ch2 also modulates
  ktranspose3 = (kf3 * 24) - 12      ; EEG Ch3 transposition
  
  ; ========== SYNTHESIS ==========
  ; Generate 4 oscillators, each modulated by different EEG channel
  aout1 = oscili(0.5, icps + cpspch((ktranspose1 + 0)))
  aout2 = oscili(0.5, icps + cpspch((ktranspose2 + 2)))
  aout3 = oscili(0.5, icps + cpspch((ktranspose3 + 4)))
  aout4 = oscili(0.5, icps + cpspch((kf4 * 24)))
  
  ; ========== AMPLITUDE MODULATION ==========
  ; EEG Ch2 controls overall amplitude (0-1)
  kamp = gkEEG_Ch2 * 0.5
  
  ; MIDI envelope
  aadsr madsr 1, 0.5, 0.8, .9
  
  ; ========== MIX & OUTPUT ==========
  ; Mix all 4 oscillators
  aout = ((aout1 + aout2 + aout3 + aout4) / 8) * aadsr * kamp
  
  ; Send to reverb bus (80% wet)
  garvbL += aout * 0.8
  garvbR += aout * 0.8
  
  ; Send to delay bus (80% wet)
  gadelL += aout * 0.8
  gadelR += aout * 0.8
  
  ; Direct output
  outs aout, aout
  
endin

; ============================================================================
; Instrument 3: Reverb Effect
; ============================================================================
; Uses Csound's built-in reverberator on the reverb bus
;
instr 3
  denorm garvbL
  denorm garvbR
  aout1, aout2 reverbsc garvbL, garvbR, 0.8, 8000
  outs aout1, aout2
  clear garvbL
  clear garvbR
endin

; ============================================================================
; Instrument 4: Delay Effect (Optional - not currently used)
; ============================================================================
; Available for adding delay to the output
; Uncomment to add 0.5 second delay with feedback
;
instr 4
  ; Placeholder for delay effect
  ; gadelL and gadelR are available for delay processing
  clear gadelL
  clear gadelR
endin

</CsInstruments>

<CsScore>

; Start all instruments
; These run continuously and never end (p3 = -1)

</CsScore>

</CsoundSynthesizer>
<bsbPanel>
 <label>Widgets</label>
 <objectName/>
 <x>0</x>
 <y>0</y>
 <width>0</width>
 <height>0</height>
 <visible>true</visible>
 <uuid/>
 <bgcolor mode="background">
  <r>240</r>
  <g>240</g>
  <b>240</b>
 </bgcolor>
</bsbPanel>
<bsbPresets>
</bsbPresets>
