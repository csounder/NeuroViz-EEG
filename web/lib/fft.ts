// Lightweight radix-2 Cooley–Tukey FFT + PSD helpers.
// Hamming-window spectral helpers for Mind Monitor–style displays:
//   psd = |rFFT(sig)|^2 / N   →   mask to [min,max] Hz   →   10·log10(psd + ε)

/** In-place iterative radix-2 FFT. `re` and `im` must have the same power-of-2 length. */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const wReBase = Math.cos((-2 * Math.PI) / len);
    const wImBase = Math.sin((-2 * Math.PI) / len);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const aIdx = i + k;
        const bIdx = aIdx + half;
        const tRe = wRe * re[bIdx] - wIm * im[bIdx];
        const tIm = wRe * im[bIdx] + wIm * re[bIdx];
        re[bIdx] = re[aIdx] - tRe;
        im[bIdx] = im[aIdx] - tIm;
        re[aIdx] += tRe;
        im[aIdx] += tIm;
        const nwRe = wRe * wReBase - wIm * wImBase;
        const nwIm = wRe * wImBase + wIm * wReBase;
        wRe = nwRe;
        wIm = nwIm;
      }
    }
  }
}

/** Largest power of 2 <= x. */
export function prevPow2(x: number): number {
  if (x < 1) return 0;
  let p = 1;
  while (p * 2 <= x) p *= 2;
  return p;
}

/** Hann window (reduces spectral leakage). */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/** Hamming window (Mind Monitor “discrete frequency” / MuseIO-style FFT). */
export function hammingWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1));
  }
  return w;
}

export interface FFTResult {
  /** Frequencies in Hz (length = N/2 + 1). */
  freqs: Float64Array;
  /** Power spectral density in dB, same length as freqs. */
  psdDb: Float64Array;
}

/**
 * Computes the PSD in dB for a real-valued time-series signal.
 *
 * - Takes the trailing `N` samples (N = prev power of 2 of requested length).
 * - Removes the DC component (mean subtraction).
 * - Applies a Hann or Hamming window (`opts.window`, default Hann).
 * - Runs radix-2 FFT.
 * - PSD = |FFT(x)|² / N
 * - Converts to dB: 10·log10(psd + 1e-10)
 * - Masks to [minFreq, maxFreq] (optional).
 *
 * @param samples   raw time-series (at least 32 samples)
 * @param sampleRate Hz
 * @param opts.targetN target FFT size (will be clamped to prev-pow-2 of input length)
 * @param opts.minFreq,maxFreq optional frequency mask in Hz
 */
export function computePSD(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts?: {
    targetN?: number;
    minFreq?: number;
    maxFreq?: number;
    window?: "hann" | "hamming";
  },
): FFTResult | null {
  const inLen = samples.length;
  if (inLen < 32 || sampleRate <= 0) return null;

  const wanted = opts?.targetN ?? 512;
  const N = prevPow2(Math.min(inLen, wanted));
  if (N < 32) return null;

  // Copy the trailing N samples, subtract mean (kills DC).
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const start = inLen - N;
  let mean = 0;
  for (let i = 0; i < N; i++) mean += samples[start + i] ?? 0;
  mean /= N;

  const winKind = opts?.window ?? "hann";
  const win =
    winKind === "hamming" ? hammingWindow(N) : hannWindow(N);
  for (let i = 0; i < N; i++) {
    re[i] = ((samples[start + i] ?? 0) - mean) * win[i];
  }

  fftRadix2(re, im);

  const half = (N >> 1) + 1;
  const freqs = new Float64Array(half);
  const psdDb = new Float64Array(half);
  const df = sampleRate / N;
  for (let k = 0; k < half; k++) {
    freqs[k] = k * df;
    const mag2 = re[k] * re[k] + im[k] * im[k];
    const psd = mag2 / N;
    psdDb[k] = 10 * Math.log10(psd + 1e-10);
  }

  // Apply optional frequency mask
  const minF = opts?.minFreq ?? 0;
  const maxF = opts?.maxFreq ?? sampleRate / 2;
  if (minF > 0 || maxF < sampleRate / 2) {
    const keep: number[] = [];
    for (let k = 0; k < half; k++) {
      if (freqs[k] >= minF && freqs[k] <= maxF) keep.push(k);
    }
    const fOut = new Float64Array(keep.length);
    const pOut = new Float64Array(keep.length);
    for (let i = 0; i < keep.length; i++) {
      fOut[i] = freqs[keep[i]];
      pOut[i] = psdDb[keep[i]];
    }
    return { freqs: fOut, psdDb: pOut };
  }

  return { freqs, psdDb };
}
