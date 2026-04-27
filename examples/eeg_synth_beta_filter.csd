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
; BETA-CONTROLLED FILTER - FOCUS DETECTOR
; =================================================================================
; Resonance swept by Beta (13-30 Hz) brainwave power
; Higher beta = more focused/alert = bright resonant sweeps
; OSC Path: /muse/bands/relative/beta (0-1 normalized, 10 Hz)
; =================================================================================

gihandle OSCinit 7400

gkBeta init 0       ; Beta band power (0-1)
gkAlpha init 0      ; Alpha for dynamic control
gkGamma init 0      ; Gamma for fine details

gaOutL init 0
gaOutR init 0

; =================================================================================
; INSTRUMENT 1: OSC LISTENERS (Band Powers)
; =================================================================================
instr 1
  ; Listen to relative band powers
  kk1 OSClisten gihandle, "/muse/bands/relative/beta", "f", gkBeta
  kk2 OSClisten gihandle, "/muse/bands/relative/alpha", "f", gkAlpha
  kk3 OSClisten gihandle, "/muse/bands/relative/gamma", "f", gkGamma
endin

; =================================================================================
; INSTRUMENT 2: BETA-CONTROLLED RESONANT FILTER
; =================================================================================
; EEG Control:
;   Beta (0-1)   -> Filter resonance/Q (focused = more resonant)
;   Alpha (0-1)  -> Filter sweep range (relaxed = narrower, alert = wider)
;   Gamma (0-1)  -> Overtone brightness (concentration = sharper)
; =================================================================================
instr 2
  iNote = p4
  iDur = p3
  
  ; Smooth the incoming band powers
  kBeta init 0
  kAlpha init 0
  kGamma init 0
  
  kBeta = gkBeta * 0.7 + kBeta * 0.3
  kAlpha = gkAlpha * 0.7 + kAlpha * 0.3
  kGamma = gkGamma * 0.7 + kGamma * 0.3
  
  ; Base frequency
  kFreq = cpsmidinn(iNote)
  
  ; =========== BETA-DRIVEN RESONANCE ===========
  ; Beta controls Q factor (resonance sharpness)
  ; Range: 0.7 (smooth) to 8.0 (sharp peaks)
  kQ = 0.7 + (kBeta * 7.3)
  
  ; =========== ALPHA-DRIVEN SWEEP ===========
  ; Alpha controls filter sweep range and speed
  ; Relaxed = narrow sweep, Alert = wide sweep
  kSweepRange = 1000 + (kAlpha * 4000)  ; 1000-5000 Hz range
  kSweepSpeed = 0.5 + (kAlpha * 1.5)     ; 0.5-2 Hz LFO
  
  ; =========== LFO FOR FILTER SWEEP ===========
  aSweepLFO = oscili:a(1, kSweepSpeed)  ; ±1 bipolar
  
  ; =========== BASE CUTOFF FREQUENCY ===========
  ; Center around 3000 Hz, sweep with alpha control
  kBaseFilter = 3000 + (aSweepLFO * kSweepRange)
  kCutoff = limit(kBaseFilter, 500, 12000)
  
  ; =========== RICH SAWTOOTH (Harsh Tone for Filtering) ===========
  ; Beta-focused tone: use sawtooth for rich harmonics
  aPhasor = phasor:a(kFreq)
  aSaw = aPhasor * 2 - 1  ; Sawtooth -1 to 1
  
  ; =========== GAMMA HARMONIC BOOST ===========
  ; Gamma adds sparkle via harmonic blend
  kGammaAmp = kGamma * 0.4  ; Up to 0.4 amplitude
  aHarmonic2 = oscili:a(kGammaAmp, kFreq * 2)  ; 2nd harmonic
  aHarmonic4 = oscili:a(kGammaAmp * 0.5, kFreq * 4)  ; 4th harmonic
  
  aMixed = aSaw + aHarmonic2 + aHarmonic4
  
  ; =========== RESONANT LOWPASS FILTER ===========
  aFiltered = moogladder(aMixed, kCutoff, kQ)
  
  ; =========== ENVELOPE ===========
  aEnv = linseg:a(0, 0.05, 1, iDur - 0.1, 0.6, 0.05, 0)
  
  ; =========== BETA AMPLITUDE CONTROL ===========
  ; Higher beta = more focused = louder
  kBetaAmp = 0.4 + (kBeta * 0.6)  ; 0.4 to 1.0
  aOut = aFiltered * aEnv * kBetaAmp
  
  ; =========== STEREO SPREAD ===========
  ; Gamma controls stereo width (more detail = wider)
  aL = aOut * (1 - kGamma * 0.25)
  aR = aOut * (1 + kGamma * 0.25)
  
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
  
  ; Wet/dry mix: 25% wet, 75% dry (bright resonant tone)
  aOutL = (aL * 0.25) + (gaOutL * 0.75)
  aOutR = (aR * 0.25) + (gaOutR * 0.75)
  
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

; Focus progression - sharp, bright tones
; E minor (focused, bright)
i 2 0 4 40   ; E2
i 2 0 4 47   ; B2
i 2 0 4 52   ; E3
i 2 0 4 59   ; B3

; A minor (bright, tense)
i 2 4 4 45   ; A2
i 2 4 4 52   ; E3
i 2 4 4 57   ; A3
i 2 4 4 64   ; E4

; D minor (sharp, cutting)
i 2 8 4 38   ; D2
i 2 8 4 45   ; A2
i 2 8 4 50   ; D3
i 2 8 4 57   ; A3

; G minor (edgy, focused)
i 2 12 4 43  ; G2
i 2 12 4 50  ; D3
i 2 12 4 55  ; G3
i 2 12 4 62  ; D4

; Repeat
i 2 16 4 40
i 2 16 4 47
i 2 16 4 52
i 2 16 4 59
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
