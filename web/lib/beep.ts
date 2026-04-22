"use client";

// Tiny Web Audio API helper for UI beeps (calibration start/end, breath cues).
// No external assets — just pure oscillators with envelope shaping, so the bundle
// stays small and audio works offline.
//
// Call `enableAudio()` once in response to a user gesture (e.g., a button click)
// on iOS/Safari before the first beep — browsers otherwise suspend the audio
// context until the user explicitly allows sound.

let ctx: AudioContext | null = null;
let muted = false;
let volume = 0.5;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Resume the audio context if suspended. Safe to call multiple times. */
export async function enableAudio(): Promise<void> {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      // ignore — some browsers throw if called outside a gesture
    }
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

export function getVolume(): number {
  return volume;
}

/**
 * Fires a short decaying sine tone at `freq` Hz for `duration` seconds.
 * Peak loudness is capped so combined beeps won't clip.
 */
export function beep(
  freq = 880,
  duration = 0.2,
  peak = 0.25,
  type: OscillatorType = "sine",
): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") {
    // Best-effort resume; if not unlocked by a gesture, the tone will just be silent.
    c.resume().catch(() => {});
  }
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = c.createGain();
  const now = c.currentTime;
  const amp = peak * volume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(amp, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Two-note "start" chime — G5 then C6. */
export function startChime() {
  beep(784, 0.14, 0.28);
  setTimeout(() => beep(1047, 0.22, 0.25), 150);
}

/** Three-note "end" chime — descending, calming. */
export function endChime() {
  beep(1047, 0.18, 0.25);
  setTimeout(() => beep(784, 0.18, 0.24), 180);
  setTimeout(() => beep(523, 0.36, 0.22), 360);
}

/** Soft, low tick — inhale cue. */
export function inhaleCue() {
  beep(440, 0.08, 0.12, "sine");
}

/** Softer, even lower — exhale cue. */
export function exhaleCue() {
  beep(294, 0.08, 0.1, "sine");
}
