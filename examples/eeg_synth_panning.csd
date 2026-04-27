<CsoundSynthesizer>
<CsOptions>
-odac -d
</CsOptions>

<CsInstruments>
0dbfs = 1
sr = 44100
kr = 100
ksmps = 441

; EEG PANNING SYNTH - Clean, working version
; EEG1->Width, EEG2->Pan, EEG3->Delay, EEG4->Doppler

gihandle OSCinit 7400
gkEEG1 init 0
gkEEG2 init 0
gkEEG3 init 0
gkEEG4 init 0

gaOutL init 0
gaOutR init 0

instr 1
  kk OSClisten gihandle, "/muse/eeg", "ffff", gkEEG1, gkEEG2, gkEEG3, gkEEG4
  if kk == 1 then
    printks "OSC: %.3f %.3f %.3f %.3f\n", 0.1, gkEEG1, gkEEG2, gkEEG3, gkEEG4
  endif
endin

instr 2
  iNote = p4
  iDur = p3
  
  kEEG1 = gkEEG1
  kEEG2 = gkEEG2
  kEEG3 = gkEEG3
  kEEG4 = gkEEG4
  
  kFreq = cpsmidinn(iNote)
  
  kDopplerSpeed = 0.1 + (kEEG4 * 4.9)
  aDoppler = oscili:a(0.1, kDopplerSpeed)
  kFreqShifted = kFreq * (1 + aDoppler * 0.1)
  
  aOsc1 = oscili:a(0.3, kFreqShifted)
  aOsc2 = oscili:a(0.3, kFreqShifted * 1.005)
  aOsc3 = oscili:a(0.2, kFreqShifted * 0.995)
  
  aMono = (aOsc1 + aOsc2 + aOsc3) * 0.7
  
  kEnv = linseg(0, 0.05, 1, iDur - 0.1, 0.8, 0.05, 0)
  aMono = aMono * kEnv
  
  kPan = kEEG2
  aL, aR pan2 aMono, kPan
  
  kWidth = kEEG1
  aMid = (aL + aR) * 0.5
  aSide = (aL - aR) * 0.5
  
  aL_out = aMid + (aSide * kWidth)
  aR_out = aMid - (aSide * kWidth)
  
  out(aL_out, aR_out)
endin

instr 98
  kFbk = 0.8
  aL, aR reverbsc gaOutL, gaOutR, kFbk, 15000
  aOutL = (aL * 0.25) + (gaOutL * 0.75)
  aOutR = (aR * 0.25) + (gaOutR * 0.75)
  out(aOutL, aOutR)
  gaOutL = 0
  gaOutR = 0
endin

</CsInstruments>

<CsScore>
i 1 0 3600
i 98 0 3600
i 2 0 3 60
i 2 3 3 64
i 2 6 3 67
i 2 9 3 65
i 2 12 3 69
i 2 15 3 72
</CsScore>

</CsoundSynthesizer>
