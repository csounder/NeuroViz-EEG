<CsoundSynthesizer>
<CsOptions>
-odac -d
</CsOptions>

<CsInstruments>
0dbfs = 1
sr = 44100
kr = 100
ksmps = 441

; =================================================================================
; DELTA GRAIN CONTROL - FATIGUE DETECTOR
; =================================================================================
; Grain density modulated by Delta (1-4 Hz) brainwave power
; Higher delta = more fatigued/sleepy = slower, sparser grains
; OSC Path: /muse/bands/relative/delta (0-1 normalized, 10 Hz)
; =================================================================================

gihandle OSCinit 7400

gkDelta init 0      ; Delta band power (0-1)
gkTheta init 0      ; Theta for modulation
gkAlpha init 0      ; Alpha for tone control

gaOutL init 0
gaOutR init 0

; Grain envelope table (raised cosine)
giGrainEnv ftgen 1, 0, 4096, 20, 9, 1

; =================================================================================
; INSTRUMENT 1: OSC LISTENERS (Band Powers)
; =================================================================================
instr 1
  ; Listen to relative band powers
  kk1 OSClisten gihandle, "/muse/bands/relative/delta", "f", gkDelta
  kk2 OSClisten gihandle, "/muse/bands/relative/theta", "f", gkTheta
  kk3 OSClisten gihandle, "/muse/bands/relative/alpha", "f", gkAlpha
endin

; =================================================================================
; INSTRUMENT 2: DELTA-CONTROLLED GRANULAR SYNTHESIS (Fatigue)
; =================================================================================
; EEG Control:
;   Delta (0-1)  -> Grain density (high delta = slower, sparser)
;   Theta (0-1)  -> Grain size/duration (high theta = longer grains)
;   Alpha (0-1)  -> Base frequency (relaxed = lower pitch)
; =================================================================================
instr 2
  iNote = p4
  iDur = p3
  
  ; Smooth the incoming band powers
  kDelta init 0
  kTheta init 0
  kAlpha init 0
  
  kDelta = gkDelta * 0.7 + kDelta * 0.3
  kTheta = gkTheta * 0.7 + kTheta * 0.3
  kAlpha = gkAlpha * 0.7 + kAlpha * 0.3
  
  ; Base frequency (Alpha shifts pitch downward when high)
  kFreq = cpsmidinn(iNote - (kAlpha * 12))  ; Down to -12 semitones
  
  ; =========== DELTA-CONTROLLED GRAIN DENSITY ===========
  ; Higher delta = more fatigued = slower grain generation
  ; Range: 20 grains/sec (alert) to 2 grains/sec (very tired)
  kGrainRate = 20 - (kDelta * 18)  ; 20 to 2 grains/sec
  kGrainPeriod = 1000 / kGrainRate  ; Period in ms
  
  ; =========== THETA-CONTROLLED GRAIN SIZE ===========
  ; Higher theta = more dreamy = longer grain envelopes
  ; Range: 20ms (sharp) to 200ms (smooth)
  kGrainDuration = 20 + (kTheta * 180)  ; 20-200 ms
  
  ; =========== METRO TRIGGER ===========
  ; Trigger new grains at kGrainRate
  kTrigger metro kGrainRate
  
  ; =========== GRAIN GENERATION ===========
  ; Simple sine grain with envelope
  if kTrigger == 1 then
    ; Randomize grain frequency slightly
    kGrainFreq = kFreq * (0.95 + (rnd(0.1)))
    
    ; Generate grain with envelope
    aGrainSine = oscili:a(0.3, kGrainFreq, giGrainEnv)
    
     ; Grain envelope (simple raised cosine, scaled by duration)
     aEnv = linseg:a(0, 0.005, 1, 0.030, 0.1, 0.005, 0)
  else
    aGrainSine = 0
    aEnv = 0
  endif
  
  ; =========== ACCUMULATE GRAINS ===========
  aGrain = aGrainSine * aEnv
  
  ; =========== SPATIAL MODULATION ===========
  ; Alpha controls stereo spread (lower freq = wider)
  aL = aGrain * (1 - kAlpha * 0.3)
  aR = aGrain * (1 + kAlpha * 0.3)
  
  ; =========== OVERALL AMPLITUDE ===========
  ; Higher delta (fatigue) = quieter
  kDeltaAmp = 1 - (kDelta * 0.5)  ; 1.0 to 0.5
  
  aOutL = clip(aL * 0.6 * kDeltaAmp, -0.95, 0.95)
  aOutR = clip(aR * 0.6 * kDeltaAmp, -0.95, 0.95)
  
  gaOutL += aOutL
  gaOutR += aOutR
endin

; =================================================================================
; INSTRUMENT 98: GLOBAL REVERB PROCESSOR
; =================================================================================
instr 98
  kFbk = 0.85
  
  aL, aR reverbsc gaOutL, gaOutR, kFbk, 15000
  
  ; Wet/dry mix: 40% wet, 60% dry (spacious grains)
  aOutL = (aL * 0.4) + (gaOutL * 0.6)
  aOutR = (aR * 0.4) + (gaOutR * 0.6)
  
  ; Limit output
  aOutL = clip(aOutL, -0.95, 0.95)
  aOutR = clip(aOutR, -0.95, 0.95)
  
  out(aOutL, aOutR)
  
  ; Clear accumulators
  gaOutL = 0
  gaOutR = 0
endin

</CsInstruments>

<CsScore>
; Start OSC listeners and reverb
i 1 0 3600
i 98 0 3600

; Fatigue-friendly progression - low, sparse tones
; Whole notes for relaxation
; C2 center
i 2 0 8 36   ; C2
i 2 0 8 41   ; F2
i 2 0 8 48   ; C3

; G1 (very low, grounding)
i 2 8 8 31   ; G1
i 2 8 8 36   ; C2
i 2 8 8 43   ; G2

; F2 (warm, low)
i 2 16 8 29  ; F1
i 2 16 8 34  ; Bb1
i 2 16 8 41  ; F2

; Bb low (heavy, grounded)
i 2 24 8 34  ; Bb1
i 2 24 8 39  ; D2
i 2 24 8 46  ; Bb2

; Repeat
i 2 32 8 36
i 2 32 8 41
i 2 32 8 48
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
