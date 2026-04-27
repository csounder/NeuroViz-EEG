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
; ALPHA-CONTROLLED PAD - RELAXATION DETECTOR
; =================================================================================
; Volume modulated by Alpha (7.5-13 Hz) brainwave power
; Higher alpha = deeper relaxation state
; OSC Path: /muse/bands/relative/alpha (0-1 normalized, 10 Hz)
; =================================================================================

gihandle OSCinit 7400

gkAlpha init 0      ; Alpha band power (0-1)
gkBeta init 0       ; Beta for comparison
gkTheta init 0      ; Theta for texture

gaOutL init 0
gaOutR init 0

; Delay tables for effects
giDelayL ftgen 1, 0, 88200, 2, 0
giDelayR ftgen 2, 0, 88200, 2, 0

; =================================================================================
; INSTRUMENT 1: OSC LISTENERS (Band Powers)
; =================================================================================
instr 1
  ; Listen to relative band powers
  kk1 OSClisten gihandle, "/muse/bands/relative/alpha", "f", gkAlpha
  kk2 OSClisten gihandle, "/muse/bands/relative/beta", "f", gkBeta
  kk3 OSClisten gihandle, "/muse/bands/relative/theta", "f", gkTheta
endin

; =================================================================================
; INSTRUMENT 2: ALPHA-CONTROLLED PAD (Relaxation Synth)
; =================================================================================
; EEG Control:
;   Alpha (0-1)  -> Pad volume & expression (relaxed = louder)
;   Beta (0-1)   -> Filter brightness (focused = brighter)
;   Theta (0-1)  -> Pad texture/harmonics (dreamy)
; =================================================================================
instr 2
  iNote = p4
  iDur = p3
  
  ; Smooth the incoming band powers
  kAlpha init 0
  kBeta init 0
  kTheta init 0
  
  kAlpha = gkAlpha * 0.7 + kAlpha * 0.3
  kBeta = gkBeta * 0.7 + kBeta * 0.3
  kTheta = gkTheta * 0.7 + kTheta * 0.3
  
  ; Base frequency
  kFreq = cpsmidinn(iNote)
  
  ; =========== RELAXATION EXPRESSION ===========
  ; Alpha controls pad volume (higher alpha = more relaxed = louder)
  ; Range: 0.1 (focused) to 1.0 (deeply relaxed)
  kAlphaAmp = 0.1 + (kAlpha * 0.9)
  
  ; =========== FILTER BRIGHTNESS ===========
  ; Beta controls filter cutoff (higher beta = more awake = brighter)
  ; Range: 2000 Hz (relaxed) to 8000 Hz (alert)
  kCutoff = 2000 + (kBeta * 6000)
  kQ = 0.707
  
  ; =========== HARMONIC TEXTURE ===========
  ; Theta adds dreamy harmonics (higher theta = more dreamy)
  kHarmonicAmp = kTheta * 0.5  ; Up to 0.5 amplitude
  
  ; =========== VOICE STACK (Rich Pad) ===========
  ; 6 detuned voices for lush pad
  aVoice1 = oscili:a(0.15, kFreq)
  aVoice2 = oscili:a(0.15, kFreq * 1.002)
  aVoice3 = oscili:a(0.15, kFreq * 0.998)
  aVoice4 = oscili:a(0.15, kFreq * 1.005)
  aVoice5 = oscili:a(0.15, kFreq * 0.995)
  aVoice6 = oscili:a(0.15, kFreq * 1.003)
  
  aMixed = (aVoice1 + aVoice2 + aVoice3 + aVoice4 + aVoice5 + aVoice6) / 6
  
  ; =========== THETA HARMONICS (Dreamy Texture) ===========
  ; Add 5th and 7th harmonics modulated by theta
  aHarmonic5 = oscili:a(0.08 * kHarmonicAmp, kFreq * 5)
  aHarmonic7 = oscili:a(0.06 * kHarmonicAmp, kFreq * 7)
  
  aMixed = aMixed + aHarmonic5 + aHarmonic7
  
  ; =========== RESONANT LOWPASS (Beta-Controlled) ===========
  aFiltered = moogladder(aMixed, kCutoff, kQ)
  
  ; =========== ENVELOPE ===========
  aEnv = linseg:a(0, 0.3, 1, iDur - 0.6, 0.7, 0.3, 0)
  
  ; =========== ALPHA AMPLITUDE CONTROL ===========
  aOut = aFiltered * aEnv * kAlphaAmp
  
  ; =========== STEREO IMAGING ===========
  ; Beta controls stereo width
  aL = aOut * (1 - kBeta * 0.3)
  aR = aOut * (1 + kBeta * 0.3)
  
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
  
  ; Wet/dry mix: 35% wet, 65% dry
  aOutL = (aL * 0.35) + (gaOutL * 0.65)
  aOutR = (aR * 0.35) + (gaOutR * 0.65)
  
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

; Relaxing pad progression - whole notes
; C minor (relaxing key)
i 2 0 8 48   ; C3
i 2 0 8 52   ; Eb3
i 2 0 8 55   ; G3
i 2 0 8 60   ; C4

; Bb major (warm, open)
i 2 8 8 46   ; Bb2
i 2 8 8 50   ; D3
i 2 8 8 53   ; F3
i 2 8 8 58   ; Bb3

; F major (peaceful)
i 2 16 8 41  ; F2
i 2 16 8 45  ; A2
i 2 16 8 53  ; F3
i 2 16 8 57  ; A3

; Ab major (rich, grounded)
i 2 24 8 44  ; Ab2
i 2 24 8 48  ; C3
i 2 24 8 53  ; F3
i 2 24 8 56  ; Ab3

; Repeat
i 2 32 8 48
i 2 32 8 52
i 2 32 8 55
i 2 32 8 60
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
