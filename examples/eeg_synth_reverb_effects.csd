<CsoundSynthesizer>
<CsOptions>
-odac -d
</CsOptions>

<CsInstruments>
0dbfs = 1
sr = 44100
kr = 100
ksmps = 441

; EEG REVERB & EFFECTS SYNTH - IMPROVED
; EEG1->Reverb send, EEG2->Reverb time, EEG3->Filter cutoff, EEG4->LFO
; GLOBAL REVERB: All outputs route through reverb processor

gihandle OSCinit 7400
gkEEG1 init 0
gkEEG2 init 0
gkEEG3 init 0
gkEEG4 init 0
gaOutL init 0
gaOutR init 0

instr 1
  kk OSClisten gihandle, "/muse/eeg", "ffff", gkEEG1, gkEEG2, gkEEG3, gkEEG4
  
  ; DEBUG: Print received OSC values (comment out line below to disable)
  if kk == 1 then
    printks "OSC: AF7=%.3f AF8=%.3f TP9=%.3f TP10=%.3f\n", 0.1, gkEEG1, gkEEG2, gkEEG3, gkEEG4
  endif
endin

instr 2
  iNote = p4
  
  kEEG1_smooth init 0
  kEEG2_smooth init 0
  kEEG3_smooth init 0
  kEEG4_smooth init 0
  
  kEEG1_smooth = gkEEG1 * 0.7 + kEEG1_smooth * 0.3
  kEEG2_smooth = gkEEG2 * 0.7 + kEEG2_smooth * 0.3
  kEEG3_smooth = gkEEG3 * 0.7 + kEEG3_smooth * 0.3
  kEEG4_smooth = gkEEG4 * 0.7 + kEEG4_smooth * 0.3
  
  kLFOSpeed = 0.1 + (kEEG4_smooth * 9.9)
  aLFO = oscili:a(0.5, kLFOSpeed)
  
  kFreq = cpsmidinn(iNote)
  aOsc1 = oscili:a(0.4, kFreq)
  aOsc2 = oscili:a(0.4, kFreq * 1.007)
  aOsc1 += oscili:a(0.15, kFreq * (1 + aLFO * 0.05))
  
  aMixed = (aOsc1 + aOsc2) * 0.5
  kEnv = linseg(0, 0.05, 1, p3 - 0.1, 0.8, 0.05, 0)
  
  kCutoff = 100 + (kEEG3_smooth * 7900)
  aFiltered = moogladder(aMixed * kEnv, kCutoff, 0.5)
  
  kReverbAmount = kEEG1_smooth
  gaOutL += aFiltered * kReverbAmount
  gaOutR += aFiltered * kReverbAmount
  
  aOut = aFiltered * (1 - kReverbAmount)
  out(aOut, aOut)
endin

instr 98
  ; GLOBAL REVERB PROCESSOR
  kFbk = 0.85
  
  aL, aR reverbsc gaOutL, gaOutR, kFbk, 15000
  
  kWetDry = gkEEG1
  aOutL = (aL * kWetDry) + (gaOutL * (1 - kWetDry))
  aOutR = (aR * kWetDry) + (gaOutR * (1 - kWetDry))
  
  out(aOutL * 0.6, aOutR * 0.6)
  
  gaOutL = 0
  gaOutR = 0
endin

</CsInstruments>

<CsScore>
i 1 0 3600
i 98 0 3600
i 2 0 2 60
i 2 2 2 62
i 2 4 2 64
i 2 6 2 65
i 2 8 2 67
i 2 10 2 69
i 2 12 2 71
i 2 14 2 72
i 2 16 3 64
i 2 19 3 67
i 2 22 3 71
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
