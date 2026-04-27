<CsoundSynthesizer>
<CsOptions>
-odac -d
</CsOptions>

<CsInstruments>
0dbfs = 1
sr = 44100
kr = 100
ksmps = 441

; EEG GRANULAR SYNTH - Textural, evolving
; EEG1->Density, EEG2->Size, EEG3->Scatter, EEG4->Chaos

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
  
  kBase = cpsmidinn(iNote)
  
  kDensity = 50 + (gkEEG1 * 450)
  kRate = kDensity / 1000
  
  kGrainSize = 0.02 + (gkEEG2 * 0.3)
  
  kScatter = gkEEG3 * 3
  kChaosMod = gkEEG4
  
  ; Grain trigger
  kTrig metro kRate
  
  if kTrig > 0 then
    ; Random pitch scatter
    kRand = (rnd(kScatter) - kScatter/2)
    kFreq = kBase * exp((kRand / 12) * log(2))
    
    ; Random grain envelope shape
    kEnvShape = rnd(1)
    
    if kEnvShape < 0.33 then
      aGrain = oscili:a(0.5, kFreq) * linseg:a(0, kGrainSize*0.5, 1, kGrainSize*0.5, 0)
    elseif kEnvShape < 0.66 then
      aGrain = oscili:a(0.5, kFreq) * linseg:a(0, kGrainSize*0.25, 1, kGrainSize*0.5, 0, kGrainSize*0.25, 0)
    else
      aGrain = oscili:a(0.5, kFreq) * (1 - cos(phasor:a(1/kGrainSize)))
    endif
    
    aOut = aGrain * linseg(0, iDur*0.1, 1, iDur*0.8, 1, iDur*0.1, 0)
    out(aOut * 0.6, aOut * 0.6)
  endif
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
i 2 0 6 60
i 2 6 6 64
i 2 12 6 67
</CsScore>

</CsoundSynthesizer>
