<CsoundSynthesizer>
<CsOptions>
-odac -d
</CsOptions>

<CsInstruments>
0dbfs = 1
sr = 44100
kr = 100
ksmps = 441

; EEG SPATIAL PANNING SYNTH - IMPROVED
; EEG1->Width, EEG2->Panning, EEG3->Delay, EEG4->Doppler
; GLOBAL REVERB: All outputs route through reverb processor

gihandle OSCinit 7400
gkEEG1 init 0
gkEEG2 init 0
gkEEG3 init 0
gkEEG4 init 0
gaOutL init 0
gaOutR init 0

giDelayL ftgen 0, 0, 88200, 2, 0
giDelayR ftgen 0, 0, 88200, 2, 0

instr 1
  kk OSClisten gihandle, "/muse/eeg", "ffff", gkEEG1, gkEEG2, gkEEG3, gkEEG4
  
  ; DEBUG: Print received OSC values (comment out line below to disable)
  if kk == 1 then
    printks "OSC: AF7=%.3f AF8=%.3f TP9=%.3f TP10=%.3f\n", 0.1, gkEEG1, gkEEG2, gkEEG3, gkEEG4
  endif
endin

instr 2
  iNote = p4
  iDur = p3
  
  kEEG1 init 0
  kEEG2 init 0
  kEEG3 init 0
  kEEG4 init 0
  
  kEEG1 = gkEEG1 * 0.5 + kEEG1 * 0.5
  kEEG2 = gkEEG2 * 0.5 + kEEG2 * 0.5
  kEEG3 = gkEEG3 * 0.5 + kEEG3 * 0.5
  kEEG4 = gkEEG4 * 0.5 + kEEG4 * 0.5
  
  kFreq = cpsmidinn(iNote)
  
  kDopplerSpeed = 0.1 + (kEEG4 * 4.9)
  aDoppler = oscili:a(0.1, kDopplerSpeed)
  kFreqShifted = kFreq * (1 + aDoppler * 0.1)
  
  aOsc1 = oscili:a(0.2, kFreqShifted)
  aOsc2 = oscili:a(0.2, kFreqShifted * 1.005)
  aOsc3 = oscili:a(0.2, kFreqShifted * 0.995)
  
  aMono = (aOsc1 + aOsc2 + aOsc3) / 3
  
  kEnv = linseg(0, 0.1, 1, iDur - 0.2, 0.7, 0.1, 0)
  aMono = aMono * kEnv
  
  kPan = kEEG2
  aL_Pan, aR_Pan pan2 aMono, kPan
  
  kWidth = kEEG1
  
  aMid = (aL_Pan + aR_Pan) * 0.5
  aSide = (aL_Pan - aR_Pan) * 0.5
  
  aL = aMid + (aSide * kWidth)
  aR = aMid - (aSide * kWidth)
  
  aL_Delayed = delayr:a(0.5)
  aR_Delayed = delayr:a(0.5)
  
  aL_WithDelay = aL + (aR_Delayed * 0.3)
  aR_WithDelay = aR + (aL_Delayed * 0.3)
  
  delayw(aL)
  delayw(aR)
  
  aOutL = clip(aL_WithDelay, -0.95, 0.95)
  aOutR = clip(aR_WithDelay, -0.95, 0.95)
  
  gaOutL += aOutL
  gaOutR += aOutR
endin

instr 98
  ; GLOBAL REVERB PROCESSOR
  kFbk = 0.85
  
  aL, aR reverbsc gaOutL, gaOutR, kFbk, 15000
  
  aOutL = (aL * 0.3) + (gaOutL * 0.7)
  aOutR = (aR * 0.3) + (gaOutR * 0.7)
  
  aOutL = clip(aOutL, -0.95, 0.95)
  aOutR = clip(aOutR, -0.95, 0.95)
  
  out(aOutL, aOutR)
  
  gaOutL = 0
  gaOutR = 0
endin

</CsInstruments>

<CsScore>
i 1 0 3600
i 98 0 3600
i 2 0 2 48
i 2 2 2 52
i 2 4 2 55
i 2 6 2 60
i 2 8 2 64
i 2 10 2 67
i 2 12 2 72
i 2 14 2 76
i 2 16 2 79
i 2 18 3 55
i 2 18 3 67
i 2 18 3 79
i 2 21 2 60
i 2 23 2 64
i 2 25 2 67
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
