import type { BandName, BandPowers } from "./types";

/**
 * Build the four Muse-style floats for `/prefix/elements/{band}_absolute`.
 * When per-channel bandpass traces are available (simulator / future DSP path),
 * each channel gets a distinct value; otherwise repeats the scalar (legacy).
 */
export function elementsBandAbsoluteArgs(
  band: BandName,
  absolute: BandPowers,
  trace: number[] | undefined | null,
): number[] {
  const base = absolute[band];
  if (!trace || trace.length < 4) {
    return [base, base, base, base];
  }
  return trace.map((v) => base + 15 * Math.tanh(v / 30));
}

/**
 * Four floats for `/prefix/elements/{band}_relative`: per-channel split of the
 * band's relative power (sums to `relative[band]`).
 */
export function elementsBandRelativeArgs(
  band: BandName,
  relative: BandPowers,
  trace: number[] | undefined | null,
): number[] {
  const rb = relative[band];
  if (!trace || trace.length < 4) {
    const q = rb / 4;
    return [q, q, q, q];
  }
  const e = trace.map((x) => x * x + 1e-12);
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => (x / s) * rb);
}
