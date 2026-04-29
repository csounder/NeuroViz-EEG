/**
 * Smoothed RMS from the browser Csound output (AnalyserNode).
 * Read from the concert canvas rAF — no React state per frame.
 */

let rafId = 0;
let level = 0;

export function getConcertAudioLevel(): number {
  return level;
}

export function stopConcertAudioMeter(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  level = 0;
}

/** Call after `source.connect(analyser); analyser.connect(destination)`. */
export function attachConcertAudioMeter(analyser: AnalyserNode): void {
  stopConcertAudioMeter();
  const buffer = new Float32Array(analyser.fftSize);
  let smooth = 0;

  const tick = () => {
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const s = buffer[i] ?? 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / buffer.length);
    const inst = Math.min(1, rms * 5.5);
    smooth = smooth * 0.88 + inst * 0.12;
    level = smooth;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}
