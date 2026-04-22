/**
 * EEG DSP Pipeline - IMPROVED
 * Proper Butterworth filters, exponential smoothing, and scaling
 */

// ============================================================================
// BIQUAD IIR FILTER (Butterworth - 2nd order sections)
// ============================================================================

class BiquadFilter {
  constructor(type, frequency, sampleRate, Q = 0.707) {
    this.type = type; // 'lowpass', 'highpass', 'bandpass', 'notch'
    this.frequency = frequency;
    this.sampleRate = sampleRate;
    this.Q = Q;

    // State variables (per channel)
    this.states = Array(8)
      .fill(null)
      .map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));

    // Compute coefficients
    this.computeCoefficients();
  }

  computeCoefficients() {
    const w0 = (2 * Math.PI * this.frequency) / this.sampleRate;
    const sinW0 = Math.sin(w0);
    const cosW0 = Math.cos(w0);
    const alpha = sinW0 / (2 * this.Q);

    let b0, b1, b2, a0, a1, a2;

    switch (this.type) {
      case "lowpass":
        b0 = (1 - cosW0) / 2;
        b1 = 1 - cosW0;
        b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;

      case "highpass":
        b0 = (1 + cosW0) / 2;
        b1 = -(1 + cosW0);
        b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;

      case "bandpass":
        b0 = sinW0 / 2;
        b1 = 0;
        b2 = -sinW0 / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;

      case "notch":
        b0 = 1;
        b1 = -2 * cosW0;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;

      default:
        b0 = b1 = b2 = a0 = a2 = 1;
        a1 = 0;
    }

    // Normalize
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  apply(sample, channelIndex) {
    const state = this.states[channelIndex];

    // Direct Form II implementation
    const y =
      this.b0 * sample +
      this.b1 * state.x1 +
      this.b2 * state.x2 -
      this.a1 * state.y1 -
      this.a2 * state.y2;

    // Update state
    state.x2 = state.x1;
    state.x1 = sample;
    state.y2 = state.y1;
    state.y1 = y;

    return y;
  }

  reset() {
    this.states.forEach((state) => {
      state.x1 = state.x2 = state.y1 = state.y2 = 0;
    });
  }
}

// ============================================================================
// DOWNSAMPLER (reduce sampling rate)
// ============================================================================

class Downsampler {
  constructor(inputRate, outputRate) {
    this.inputRate = inputRate || 256;
    this.outputRate = outputRate || 256;
    this.factor = Math.max(1, Math.round(this.inputRate / this.outputRate));
    this.counter = 0;
  }

  shouldProcess() {
    this.counter++;
    if (this.counter >= this.factor) {
      this.counter = 0;
      return true;
    }
    return false;
  }

  setRate(outputRate) {
    this.outputRate = outputRate;
    this.factor = Math.max(1, Math.round(this.inputRate / this.outputRate));
    this.counter = 0;
  }
}

// ============================================================================
// EXPONENTIAL SMOOTHER
// ============================================================================

class ExponentialSmoother {
  constructor(timeConstantMs = 100, sampleRateHz = 256) {
    // Alpha determines how much of new sample vs old smoothed value
    // timeConstantMs: how long (ms) to converge to new value
    this.sampleRateHz = sampleRateHz;
    this.dtMs = 1000 / sampleRateHz;
    this.setTimeConstant(timeConstantMs);

    // State: one per channel
    this.smoothedValues = [0, 0, 0, 0];
  }

  setTimeConstant(timeConstantMs) {
    // Higher time constant = smoother (more lag)
    // Lower time constant = faster response (more noise)
    // timeConstantMs = 0 means NO smoothing (pass through)
    this.timeConstant = timeConstantMs;
    if (timeConstantMs <= 0) {
      this.alpha = 1; // Full pass-through (no smoothing)
    } else {
      // Alpha = dt / (tau + dt)
      // tau = time constant in same units as dt
      this.alpha = this.dtMs / (timeConstantMs + this.dtMs);
    }
  }

  smooth(sample, channelIndex) {
    // If alpha = 1, returns pure input (no smoothing)
    const prevSmoothed = this.smoothedValues[channelIndex];
    const newSmoothed = this.alpha * sample + (1 - this.alpha) * prevSmoothed;
    this.smoothedValues[channelIndex] = newSmoothed;
    return newSmoothed;
  }

  reset() {
    this.smoothedValues = [0, 0, 0, 0];
  }
}

// ============================================================================
// DSP PIPELINE
// ============================================================================

class DSPPipeline {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 256;
    this.numChannels = options.numChannels || 4;
    this.outputRate = options.outputRate || 256; // Configurable output rate

    // Filter configuration
    this.useCAR = options.applyCAR !== false; // Common Average Reference - SPATIAL filter (first in chain)
    this.useNotchFilter = options.applyNotch !== false;
    this.useBandpassFilter = options.applyBandpass !== false;
    this.useGate = false;
    this.useEnvFollow = false;
    this.useSlewLimit = false;
    this.useSoftClip = false;
    this.useRectify = false;
    this.smoothingTimeConstantMs = options.smoothingTimeConstantMs || 100;
    this.scaling = options.scaling || "0-1";

    // Create filters
    this.notchFilter = new BiquadFilter("notch", 60, this.sampleRate, 1.0);
    this.highpassFilter = new BiquadFilter(
      "highpass",
      1,
      this.sampleRate,
      0.707,
    );
    this.lowpassFilter = new BiquadFilter(
      "lowpass",
      45,
      this.sampleRate,
      0.707,
    );
    this.smoother = new ExponentialSmoother(
      this.smoothingTimeConstantMs,
      this.sampleRate,
    );
    this.downsampler = new Downsampler(this.sampleRate, this.outputRate);

    // Create shape processors
    this.gateProcessor = new GateProcessor(50, 100, this.sampleRate);
    this.envFollower = new EnvelopeFollower(10, 100, this.sampleRate, "rms");
    this.slewLimiter = new SlewLimiter(10, 10);
    this.softClipper = new SoftClipper(2.0);
    this.rectifier = new Rectifier("full");

    // Statistics tracking
    this.windowSize = 256; // 1 second at 256 Hz
    this.sampleWindows = Array(4)
      .fill(null)
      .map(() => []);
  }

  process(rawSamples) {
    if (!rawSamples || rawSamples.length !== this.numChannels) {
      return {
        raw: [0, 0, 0, 0],
        processed: [0, 0, 0, 0],
        stats: { mean: 0, std: 0, peak: 0 },
        fft: Array(10).fill(0),
        skipped: true,
      };
    }

    // STEP 0: Check downsampling (always process filters, but may skip output)
    const shouldOutput = this.downsampler.shouldProcess();

    // Save raw input for comparison
    const rawInput = [...rawSamples];
    let processed = [...rawSamples];

    // ═══════════════════════════════════════════════════════════════════════
    // PROCESSING CHAIN (all filters can be active simultaneously)
    // ═══════════════════════════════════════════════════════════════════════

    // STEP 1: Common Average Reference (CAR) - SPATIAL FILTER
    // Removes global noise by subtracting the mean of all channels
    // This is the first step because it's a reference remapping
    if (this.useCAR && processed.length >= 2) {
      // Calculate the mean across all channels at this time point
      const mean =
        processed.reduce((sum, sample) => sum + sample, 0) / processed.length;
      // Subtract the mean from each channel
      processed = processed.map((sample) => sample - mean);
    }

    // STEP 2: Notch filter (60 Hz power line interference)
    if (this.useNotchFilter) {
      processed = processed.map((sample, ch) =>
        this.notchFilter.apply(sample, ch),
      );
    }

    // STEP 3: Bandpass filter (1-45 Hz brain rhythms)
    if (this.useBandpassFilter) {
      processed = processed.map((sample, ch) => {
        let filtered = this.highpassFilter.apply(sample, ch);
        filtered = this.lowpassFilter.apply(filtered, ch);
        return filtered;
      });
    }

    // STEP 4: Exponential smoothing (reduce jitter)
    processed = processed.map((sample, ch) => this.smoother.smooth(sample, ch));

    // STEP 5: Gate processor (threshold → trigger)
    if (this.useGate) {
      processed = processed.map((sample, ch) =>
        this.gateProcessor.apply(sample, ch),
      );
    }

    // STEP 6: Envelope follower (peak/RMS tracking)
    if (this.useEnvFollow) {
      processed = processed.map((sample, ch) =>
        this.envFollower.apply(sample, ch),
      );
    }

    // STEP 7: Slew limiter (rate-of-change limiting)
    if (this.useSlewLimit) {
      processed = processed.map((sample, ch) =>
        this.slewLimiter.apply(sample, ch),
      );
    }

    // STEP 8: Soft clipper (non-linear saturation)
    if (this.useSoftClip) {
      processed = processed.map((sample) => this.softClipper.apply(sample));
    }

    // STEP 9: Rectifier (half/full wave)
    if (this.useRectify) {
      processed = processed.map((sample) => this.rectifier.apply(sample));
    }

    // STEP 10: Scaling & normalization
    const scaled = this.scaleData(processed);

    // STEP 11: Track window for statistics
    scaled.forEach((sample, ch) => {
      this.sampleWindows[ch].push(sample);
      if (this.sampleWindows[ch].length > this.windowSize) {
        this.sampleWindows[ch].shift();
      }
    });

    // STEP 12: Compute statistics
    const stats = this.computeStats(scaled);

    // STEP 13: Simple FFT for frequency bands
    const fft = this.computeFrequencyBands(scaled);

    return {
      raw: rawInput, // Original unprocessed input
      processed: scaled, // Fully processed output
      stats,
      fft,
      skipped: !shouldOutput, // Flag for downsampling
    };
  }

  setOutputRate(outputRateHz) {
    this.outputRate = outputRateHz;
    this.downsampler.setRate(outputRateHz);
  }

  scaleData(samples) {
    if (this.scaling === "raw") {
      // Raw pass-through: no scaling at all (for Csound-side processing)
      return samples;
    } else if (this.scaling === "0-1") {
      // Default: Clip to [-500, 500] then normalize to [0, 1]
      return samples.map((s) => {
        const clipped = Math.max(-500, Math.min(500, s));
        return (clipped + 500) / 1000; // Now in [0, 1]
      });
    } else if (this.scaling === "0-3") {
      // Mind Monitor mode: Clip to [-1500, 1500] then normalize to [0, 3]
      return samples.map((s) => {
        const clipped = Math.max(-1500, Math.min(1500, s));
        return (clipped + 1500) / 1000; // Now in [0, 3]
      });
    } else if (this.scaling === "zscore") {
      // Z-score normalization: (x - mean) / std
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance =
        samples.reduce((a, s) => a + Math.pow(s - mean, 2), 0) / samples.length;
      const std = Math.sqrt(variance) || 1;
      return samples.map((s) => (s - mean) / std);
    }
    return samples;
  }

  computeStats(samples) {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
      samples.reduce((a, s) => a + Math.pow(s - mean, 2), 0) / samples.length;
    const std = Math.sqrt(variance);
    const peak = Math.max(...samples.map(Math.abs));

    return {
      mean: mean.toFixed(3),
      std: std.toFixed(3),
      peak: peak.toFixed(3),
    };
  }

  computeFrequencyBands(samples) {
    // Simple frequency analysis: divide into 10 bands
    // Assuming each sample is ~4ms apart (256 Hz), compute power in each band

    // For now, return array of band powers based on window
    const bands = [
      { name: "Delta", freqRange: [0.5, 4] },
      { name: "Theta", freqRange: [4, 8] },
      { name: "Alpha", freqRange: [8, 13] },
      { name: "Beta", freqRange: [13, 30] },
      { name: "Gamma", freqRange: [30, 45] },
      { name: "HighGamma", freqRange: [45, 60] },
    ];

    // Compute RMS power for current window
    const allSamples = this.sampleWindows.flat();
    const rms = Math.sqrt(
      allSamples.reduce((a, s) => a + s * s, 0) / (allSamples.length || 1),
    );

    // Return one power value per band
    return bands.map((band) => {
      // Simple heuristic: lower frequencies = higher power
      const freqCenter = (band.freqRange[0] + band.freqRange[1]) / 2;
      const powerFactor = Math.max(0, 1 - freqCenter / 60);
      return (rms * powerFactor).toFixed(3);
    });
  }

  // Allow runtime configuration
  setSmoothing(timeConstantMs) {
    this.smoother.setTimeConstant(timeConstantMs);
  }

  setScaling(mode) {
    this.scaling = mode;
  }

  updateConfig(newConfig) {
    // Handle both 'scaling' (old) and 'scalingMode' (new) keys
    const scalingMode = newConfig.scalingMode || newConfig.scaling;
    if (scalingMode) {
      this.setScaling(scalingMode);
    }

    // Filter toggles
    if (newConfig.applyCAR !== undefined) {
      this.useCAR = newConfig.applyCAR;
    }
    if (newConfig.applyNotch !== undefined) {
      this.useNotchFilter = newConfig.applyNotch;
    }
    if (newConfig.applyBandpass !== undefined) {
      this.useBandpassFilter = newConfig.applyBandpass;
    }

    // Shape processor toggles
    if (newConfig.useGate !== undefined) {
      this.useGate = newConfig.useGate;
    }
    if (newConfig.useEnvFollow !== undefined) {
      this.useEnvFollow = newConfig.useEnvFollow;
    }
    if (newConfig.useSlewLimit !== undefined) {
      this.useSlewLimit = newConfig.useSlewLimit;
    }
    if (newConfig.useSoftClip !== undefined) {
      this.useSoftClip = newConfig.useSoftClip;
    }
    if (newConfig.useRectify !== undefined) {
      this.useRectify = newConfig.useRectify;
    }

    // Gate parameters
    if (newConfig.gateThreshold !== undefined) {
      this.gateProcessor.setThreshold(newConfig.gateThreshold);
    }
    if (newConfig.gateDuration !== undefined) {
      this.gateProcessor.setDuration(newConfig.gateDuration);
    }

    // Envelope follower parameters
    if (
      newConfig.envAttack !== undefined ||
      newConfig.envRelease !== undefined
    ) {
      const attack = newConfig.envAttack || 10;
      const release = newConfig.envRelease || 100;
      this.envFollower.setAttackRelease(attack, release);
    }
    if (newConfig.envMode !== undefined) {
      this.envFollower.mode = newConfig.envMode;
    }

    // Slew limiter parameters
    if (newConfig.slewRise !== undefined || newConfig.slewFall !== undefined) {
      const rise = newConfig.slewRise !== undefined ? newConfig.slewRise : 10;
      const fall = newConfig.slewFall !== undefined ? newConfig.slewFall : 10;
      this.slewLimiter.setRates(rise, fall);
    }

    // Soft clipper parameters
    if (newConfig.clipGain !== undefined) {
      this.softClipper.setGain(newConfig.clipGain);
    }

    // Rectifier parameters
    if (newConfig.rectifyMode !== undefined) {
      this.rectifier.setMode(newConfig.rectifyMode);
    }

    // Smoothing (accepts both smoothingAmount and smoothingTimeConstantMs)
    if (newConfig.smoothingAmount !== undefined) {
      this.setSmoothing(newConfig.smoothingAmount); // Pass as-is, smoother will use it as multiplier
    } else if (newConfig.smoothingTimeConstantMs) {
      this.setSmoothing(newConfig.smoothingTimeConstantMs);
    }

    if (newConfig.outputRateHz) {
      this.setOutputRate(newConfig.outputRateHz);
    }
  }
}

// ============================================================================
// GATE PROCESSOR - Threshold detector with duration hold
// Outputs 1.0 when input exceeds threshold, holds for specified duration
// ============================================================================

class GateProcessor {
  constructor(thresholdMicroVolts = 50, durationMs = 100, sampleRate = 256) {
    this.threshold = thresholdMicroVolts;
    this.durationSamples = Math.floor((durationMs / 1000) * sampleRate);
    this.sampleRate = sampleRate;
    // State per channel: remaining hold samples
    this.holdCounters = Array(8).fill(0);
  }

  setThreshold(microVolts) {
    this.threshold = microVolts;
  }

  setDuration(ms) {
    this.durationSamples = Math.floor((ms / 1000) * this.sampleRate);
  }

  apply(sample, channelIndex) {
    const absValue = Math.abs(sample);

    // Trigger if threshold exceeded
    if (absValue > this.threshold) {
      this.holdCounters[channelIndex] = this.durationSamples;
    }

    // Output 1.0 if holding, 0.0 otherwise
    if (this.holdCounters[channelIndex] > 0) {
      this.holdCounters[channelIndex]--;
      return 1.0;
    }
    return 0.0;
  }

  reset() {
    this.holdCounters.fill(0);
  }
}

// ============================================================================
// ENVELOPE FOLLOWER - Peak or RMS detector
// ============================================================================

class EnvelopeFollower {
  constructor(attackMs = 10, releaseMs = 100, sampleRate = 256, mode = "rms") {
    this.sampleRate = sampleRate;
    this.mode = mode; // 'peak' or 'rms'
    this.setAttackRelease(attackMs, releaseMs);
    this.envelopes = Array(8).fill(0);
    // For RMS mode
    this.rmsBuffers = Array(8)
      .fill(null)
      .map(() => []);
    this.rmsWindowSize = 64;
  }

  setAttackRelease(attackMs, releaseMs) {
    this.attackCoeff = Math.exp(-1 / ((attackMs / 1000) * this.sampleRate));
    this.releaseCoeff = Math.exp(-1 / ((releaseMs / 1000) * this.sampleRate));
  }

  apply(sample, channelIndex) {
    const absValue = Math.abs(sample);
    const env = this.envelopes[channelIndex];

    if (this.mode === "rms") {
      // RMS mode: square → average → sqrt
      const buf = this.rmsBuffers[channelIndex];
      buf.push(sample * sample);
      if (buf.length > this.rmsWindowSize) buf.shift();
      const meanSquare = buf.reduce((a, b) => a + b, 0) / buf.length;
      const rms = Math.sqrt(meanSquare);

      // Smooth with attack/release
      const coeff = rms > env ? this.attackCoeff : this.releaseCoeff;
      this.envelopes[channelIndex] = rms + coeff * (env - rms);
    } else {
      // Peak mode: simple attack/release on absolute value
      const coeff = absValue > env ? this.attackCoeff : this.releaseCoeff;
      this.envelopes[channelIndex] = absValue + coeff * (env - absValue);
    }

    return this.envelopes[channelIndex];
  }

  reset() {
    this.envelopes.fill(0);
    this.rmsBuffers.forEach((buf) => (buf.length = 0));
  }
}

// ============================================================================
// SLEW LIMITER - Rate-of-change limiter
// ============================================================================

class SlewLimiter {
  constructor(maxRisePerSample = 10, maxFallPerSample = 10) {
    this.maxRise = maxRisePerSample;
    this.maxFall = maxFallPerSample;
    this.lastValues = Array(8).fill(0);
  }

  setRates(risePerSample, fallPerSample) {
    this.maxRise = risePerSample;
    this.maxFall = fallPerSample;
  }

  apply(sample, channelIndex) {
    const last = this.lastValues[channelIndex];
    const delta = sample - last;

    let output;
    if (delta > this.maxRise) {
      output = last + this.maxRise;
    } else if (delta < -this.maxFall) {
      output = last - this.maxFall;
    } else {
      output = sample;
    }

    this.lastValues[channelIndex] = output;
    return output;
  }

  reset() {
    this.lastValues.fill(0);
  }
}

// ============================================================================
// SOFT CLIPPER - Non-linear saturation (tanh-based)
// ============================================================================

class SoftClipper {
  constructor(gain = 2.0) {
    this.gain = gain;
  }

  setGain(g) {
    this.gain = g;
  }

  apply(sample) {
    // Soft clipping using tanh
    return Math.tanh((sample * this.gain) / 100) * 100;
  }
}

// ============================================================================
// RECTIFIER - Half-wave or full-wave rectification
// ============================================================================

class Rectifier {
  constructor(mode = "full") {
    this.mode = mode; // 'half', 'full'
  }

  setMode(m) {
    this.mode = m;
  }

  apply(sample) {
    if (this.mode === "full") {
      return Math.abs(sample);
    } else if (this.mode === "half") {
      return Math.max(0, sample);
    }
    return sample;
  }
}

module.exports = {
  DSPPipeline,
  BiquadFilter,
  ExponentialSmoother,
  Downsampler,
  GateProcessor,
  EnvelopeFollower,
  SlewLimiter,
  SoftClipper,
  Rectifier,
};
