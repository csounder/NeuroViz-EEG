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
; THETA WAVES - MEDITATION MORPHING OSCILLATOR
; =================================================================================
; Waveform morphs with Theta (4-8 Hz) brainwave power
; Higher theta = more dreamy/meditative = smoother, richer tone
; OSC Path: /muse/bands/relative/theta (0-1 normalized, 10 Hz)
; =================================================================================

gihandle OSCinit 7400

gkTheta init 0      ; Theta band power (0-1)
gkDelta init 0      ; Delta for depth
gkAlpha init 0      ; Alpha for stability

gaOutL init 0
gaOutR init 0

; =================================================================================
; INSTRUMENT 1: OSC LISTENERS (Band Powers)
; =================================================================================
instr 1
  ; Listen to relative band powers
  kk1 OSClisten gihandle, "/muse/bands/relative/theta", "f", gkTheta
  kk2 OSClisten gihandle, "/muse/bands/relative/delta", "f", gkDelta
  kk3 OSClisten gihandle, "/muse/bands/relative/alpha", "f", gkAlpha
endin

; =================================================================================
; INSTRUMENT 2: THETA-MORPHING OSCILLATOR (Meditation)
; =================================================================================
; EEG Control:
;   Theta (0-1)  -> Waveform morph (sine to square to saw)
;   Delta (0-1)  -> Filter depth (more delta = darker)
;   Alpha (0-1)  -> Vibrato modulation (relaxed = faster LFO)
; =================================================================================
instr 2
  iNote = p4
  iDur = p3
  
  ; Smooth the incoming band powers
  kTheta init 0
  kDelta init 0
  kAlpha init 0
  
  kTheta = gkTheta * 0.7 + kTheta * 0.3
  kDelta = gkDelta * 0.7 + kDelta * 0.3
  kAlpha = gkAlpha * 0.7 + kAlpha * 0.3
  
  ; Base frequency
  kFreq = cpsmidinn(iNote)
  
  ; =========== VIBRATO MODULATION (Alpha-Controlled) ===========
  ; Higher alpha (relaxed) = faster vibrato
  kVibratoSpeed = 4 + (kAlpha * 3)  ; 4-7 Hz vibrato
  aVibrato = oscili:a(0.08, kVibratoSpeed)  ; ±0.08 vibrato depth
  
  kFreqMod = kFreq * (1 + aVibrato)
  
  ; =========== WAVEFORM MORPHING (Theta-Controlled) ===========
  ; Theta = 0: Pure sine (meditative calm)
  ; Theta = 0.5: Square/triangle (floating)
  ; Theta = 1: Sawtooth (full presence)
  
  ; Generate base waveforms
  aPhasor = phasor:a(kFreqMod)
  
  ; Sine wave (meditative)
  aSine = oscili:a(1, kFreqMod)
  
  ; Triangle wave (balanced)
  aTriangle = 2 * abs:a(aPhasor - 0.5) * 2 - 1  ; -1 to 1
  
  ; Sawtooth wave (energetic)
  aSaw = aPhasor * 2 - 1  ; -1 to 1
  
  ; =========== MORPHING LOGIC ===========
  ; Map theta (0-1) to morph positions
  if kTheta <= 0.5 then
    ; Morph sine to triangle
    kMorphPos = kTheta * 2  ; 0-1 within first half
    aMorphed = aSine * (1 - kMorphPos) + aTriangle * kMorphPos
  else
    ; Morph triangle to sawtooth
    kMorphPos = (kTheta - 0.5) * 2  ; 0-1 within second half
    aMorphed = aTriangle * (1 - kMorphPos) + aSaw * kMorphPos
  endif
  
  ; =========== DELTA-CONTROLLED FILTER ===========
  ; Higher delta = deeper filter cutoff (darker, more introspective)
  kCutoff = 4000 - (kDelta * 3000)  ; 4000 Hz (alert) to 1000 Hz (deep)
  kQ = 0.8
  
  aFiltered = moogladder(aMorphed, kCutoff, kQ)
  
  ; =========== HARMONIC SHIMMER (Theta Adds Brightness) ===========
  ; Higher theta = add more harmonic content
  kShimmerAmp = kTheta * 0.3  ; 0 to 0.3
  aHarmonic3 = oscili:a(kShimmerAmp, kFreqMod * 3)
  aHarmonic5 = oscili:a(kShimmerAmp * 0.5, kFreqMod * 5)
  
  aMixed = aFiltered + aHarmonic3 + aHarmonic5
  
  ; =========== ENVELOPE ===========
  aEnv = linseg:a(0, 0.2, 1, iDur - 0.4, 0.8, 0.2, 0)
  
  ; =========== AMPLITUDE MODULATION ===========
  ; Theta intensity
  kThetaAmp = 0.5 + (kTheta * 0.5)  ; 0.5 to 1.0
  aOut = aMixed * aEnv * kThetaAmp
  
  ; =========== STEREO IMAGING ===========
  ; Delta controls stereo width (deeper = wider space)
  aL = aOut * (1 - kDelta * 0.25)
  aR = aOut * (1 + kDelta * 0.25)
  
  ; =========== OUTPUT ===========
  aOutL = clip(aL * 0.6, -0.95, 0.95)
  aOutR = clip(aR * 0.6, -0.95, 0.95)
  
  gaOutL += aOutL
  gaOutR += aOutR
endin

; =================================================================================
; INSTRUMENT 98: GLOBAL REVERB PROCESSOR
; =================================================================================
instr 98
  kFbk = 0.85
  
  aL, aR reverbsc gaOutL, gaOutR, kFbk, 15000
  
  ; Wet/dry mix: 45% wet, 55% dry (spacious meditation)
  aOutL = (aL * 0.45) + (gaOutL * 0.55)
  aOutR = (aR * 0.45) + (gaOutR * 0.55)
  
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

; Meditative progression - ethereal, floating tones
; Long whole notes for deep meditation
; A3 (440 Hz, pure)
i 2 0 8 57   ; A3
i 2 0 8 61   ; C#4
i 2 0 8 66   ; F#4

; D4 (meditative, peaceful)
i 2 8 8 50   ; D3
i 2 8 8 54   ; F#3
i 2 8 8 59   ; B3

; E4 (contemplative)
i 2 16 8 52  ; E3
i 2 16 8 56  ; G#3
i 2 16 8 61  ; C#4

; B3 (open, expansive)
i 2 24 8 47  ; B2
i 2 24 8 51  ; D#3
i 2 24 8 56  ; G#3

; Repeat
i 2 32 8 57
i 2 32 8 61
i 2 32 8 66
</CsScore>

</CsoundSynthesizer>
