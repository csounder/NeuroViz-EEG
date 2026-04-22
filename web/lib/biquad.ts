// Minimal biquad IIR filter — RBJ Audio-EQ Cookbook formulas.
// Direct-form I, one instance per channel.
//
//   y[n] = b0·x[n] + b1·x[n-1] + b2·x[n-2] − a1·y[n-1] − a2·y[n-2]
//
// Coefficient design follows:
//   https://www.w3.org/TR/audio-eq-cookbook/

export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  process(x: number): number {
    const y =
      this.b0 * x +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    // NaN/Inf guard (can happen if coefficients blow up briefly)
    return Number.isFinite(y) ? y : 0;
  }

  reset(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }

  // ------------- factories -------------

  static highpass(fs: number, fc: number, q = 0.707): Biquad {
    const b = new Biquad();
    b.configHighpass(fs, fc, q);
    return b;
  }
  static lowpass(fs: number, fc: number, q = 0.707): Biquad {
    const b = new Biquad();
    b.configLowpass(fs, fc, q);
    return b;
  }
  static notch(fs: number, f0: number, q = 30): Biquad {
    const b = new Biquad();
    b.configNotch(fs, f0, q);
    return b;
  }

  configHighpass(fs: number, fc: number, q = 0.707) {
    const w0 = (2 * Math.PI * Math.min(fc, fs / 2 - 1)) / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * Math.max(0.1, q));
    const a0 = 1 + alpha;
    this.b0 = ((1 + cw) / 2) / a0;
    this.b1 = -(1 + cw) / a0;
    this.b2 = ((1 + cw) / 2) / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  configLowpass(fs: number, fc: number, q = 0.707) {
    const w0 = (2 * Math.PI * Math.min(fc, fs / 2 - 1)) / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * Math.max(0.1, q));
    const a0 = 1 + alpha;
    this.b0 = ((1 - cw) / 2) / a0;
    this.b1 = (1 - cw) / a0;
    this.b2 = ((1 - cw) / 2) / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  configNotch(fs: number, f0: number, q = 30) {
    const w0 = (2 * Math.PI * Math.min(f0, fs / 2 - 1)) / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * Math.max(0.1, q));
    const a0 = 1 + alpha;
    this.b0 = 1 / a0;
    this.b1 = (-2 * cw) / a0;
    this.b2 = 1 / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }
}
