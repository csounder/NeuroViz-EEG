// ============================================================================
// NeuroVis Canvas Displays (ported from NeuroVis React components)
// ============================================================================

const NV_COLORS = ["#6366f1", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444"];
const NV_NAMES = ["Delta", "Theta", "Alpha", "Beta", "Gamma"];
const NV_RANGES = [
  { lo: 0.5, hi: 4 },
  { lo: 4, hi: 8 },
  { lo: 8, hi: 13 },
  { lo: 13, hi: 30 },
  { lo: 30, hi: 60 },
];

// Shared state for canvas displays
const nvState = {
  waterfallHistory: [],
  phaseTrails: {},
  fftBandHistory: [[], [], [], [], []],
  ppgHistory: [[], [], []],
  ppgHrSmooth: 72,
  quadWaterfallHist: [],
  quadPPGHist: [[], [], []],
};

// Selector state for visualization filtering
const selectorState = {
  selectedBand: "delta", // Which band to display in filtered views
  selectedChannel: "TP9", // Which channel to highlight in FFT
};

// ============================================================================
// Device & Visualization Metadata
// ============================================================================

const DEVICE_INFO = {
  "muse-2": {
    name: "Muse 2",
    icon: "🧠",
    channels: 4,
    channelNames: ["TP9", "AF7", "AF8", "TP10"],
    extras: ["PPG", "Accelerometer", "Gyroscope"],
    description: "Consumer-grade EEG headband with 4 dry electrodes",
    specs: "256 Hz sampling, 10-20 placement",
  },
  "muse-s": {
    name: "Muse S / Athena",
    icon: "🧠",
    channels: 4,
    channelNames: ["TP9", "AF7", "AF8", "TP10"],
    extras: ["PPG", "fNIRS", "Accelerometer", "Gyroscope"],
    description:
      "Premium EEG headband with optical sensors for advanced metrics",
    specs: "256 Hz sampling, PPG + fNIRS optical",
  },
  ganglion: {
    name: "OpenBCI Ganglion",
    icon: "🎛️",
    channels: 4,
    channelNames: ["Ch1", "Ch2", "Ch3", "Ch4"],
    extras: ["Accelerometer", "Gyroscope"],
    description: "Research-grade 4-channel wireless EEG system",
    specs: "200 Hz sampling, ultra-low noise",
  },
  ultracortex: {
    name: "OpenBCI Ultracortex",
    icon: "👑",
    channels: 16,
    channelNames: [
      "Fp1",
      "Fp2",
      "F3",
      "F4",
      "C3",
      "C4",
      "P3",
      "P4",
      "O1",
      "O2",
      "F7",
      "F8",
      "T3",
      "T4",
      "T5",
      "T6",
    ],
    extras: ["Accelerometer", "Gyroscope"],
    description: "Professional 16-channel 10-20 system EEG cap",
    specs: "250 Hz sampling, full brain coverage",
  },
};

const VISUALIZATION_DESCRIPTIONS = {
  bands:
    "🎨 Band Power: Real-time power in δ θ α β γ frequency bands. Green = high power.",
  fft: "📊 FFT Spectrum: Frequency domain visualization with overlaid band regions (colored).",
  waterfall:
    "📈 Waterfall: Time-frequency spectrogram showing how bands change over time.",
  phase:
    "🔄 Phase Polar: EEG phase coherence plot across channels—shows synchronization.",
  ppg: "❤️ PPG/HR: Photoplethysmography heart rate + blood oxygen (Muse S/Athena only).",
  motion: "📍 Motion: Accelerometer (3-axis) and gyroscope (angular velocity).",
  mindmetrics:
    "🧠 Mind Metrics: Personalized attention, meditation, drowsiness using z-score baselines.",
};

const COLOR_PALETTES = {
  default: {
    name: "Default (NeuroVis)",
    primary: "#6366f1",
    accent: "#f59e0b",
    success: "#22c55e",
    danger: "#ef4444",
    info: "#3b82f6",
    bg: "#0d1117",
    text: "#e6edf3",
  },
  dark: {
    name: "Dark (High Contrast)",
    primary: "#00ffff",
    accent: "#ffff00",
    success: "#00ff00",
    danger: "#ff0000",
    info: "#00aaff",
    bg: "#000000",
    text: "#ffffff",
  },
  warm: {
    name: "Warm (Sunset)",
    primary: "#ff6b6b",
    accent: "#ffa500",
    success: "#90ee90",
    danger: "#ff4500",
    info: "#87ceeb",
    bg: "#1a0f0a",
    text: "#f5e6d3",
  },
  cool: {
    name: "Cool (Ocean)",
    primary: "#00bcd4",
    accent: "#64b5f6",
    success: "#4caf50",
    danger: "#e91e63",
    info: "#2196f3",
    bg: "#0a1420",
    text: "#b0d4e3",
  },
  solarized: {
    name: "Solarized",
    primary: "#268bd2",
    accent: "#b58900",
    success: "#859900",
    danger: "#dc322f",
    info: "#2aa198",
    bg: "#002b36",
    text: "#839496",
  },
};

// ── FFT Spectrum + Power Bands (NeuroVis-style) ──
function updateFFTSpectrumCanvas() {
  const canvasId =
    nvState._activeTab === "fftSpectrum"
      ? "fftSpectrumCanvas2"
      : "fftSpectrumCanvas";
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  const rel = state.bandPowers.relative || {};
  const bandVals = [
    rel.delta || 0,
    rel.theta || 0,
    rel.alpha || 0,
    rel.beta || 0,
    rel.gamma || 0,
  ];
  const specW = W * 0.62,
    barX = specW + 30,
    barW = W - barX - 10;

  // Band region shading
  NV_RANGES.forEach((br, bi) => {
    const x1 = 40 + (br.lo / 60) * (specW - 50),
      x2 = 40 + (br.hi / 60) * (specW - 50);
    ctx.fillStyle = NV_COLORS[bi] + "18";
    ctx.fillRect(x1, 15, x2 - x1, H - 40);
    ctx.fillStyle = NV_COLORS[bi];
    ctx.font = "bold 9px monospace";
    ctx.fillText(NV_NAMES[bi], x1 + 2, 12);
  });

  // Simulated spectrum curve from band powers
  const eegData = state.eegData || [[], [], [], []];
  for (let ch = 0; ch < Math.min(4, eegData.length); ch++) {
    ctx.strokeStyle = BAND_COLORS[ch % 5];
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let f = 0; f < 120; f++) {
      const freq = (f / 120) * 60;
      const bi =
        freq < 4 ? 0 : freq < 8 ? 1 : freq < 13 ? 2 : freq < 30 ? 3 : 4;
      const amp =
        bandVals[bi] * (50 + Math.sin(f * 0.3 + ch + Date.now() * 0.001) * 20);
      const x = 40 + (freq / 60) * (specW - 50);
      const y = H - 30 - amp * (H - 50) * 0.8;
      f === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Frequency axis
  ctx.fillStyle = "#888";
  ctx.font = "8px monospace";
  [0, 10, 20, 30, 40, 50, 60].forEach((f) => {
    ctx.fillText(f + "Hz", 40 + (f / 60) * (specW - 50) - 6, H - 4);
  });

  // Right: Power band bars with sparklines
  ctx.fillStyle = "#ccc";
  ctx.font = "bold 10px monospace";
  ctx.fillText("Band Power", barX, 14);
  const bandH = (H - 30) / 5 - 4;
  NV_NAMES.forEach((name, bi) => {
    const val = bandVals[bi];
    nvState.fftBandHistory[bi].push(val);
    if (nvState.fftBandHistory[bi].length > 40)
      nvState.fftBandHistory[bi].shift();
    const by = 22 + bi * (bandH + 4);
    ctx.fillStyle = NV_COLORS[bi];
    ctx.font = "bold 9px monospace";
    ctx.fillText(name, barX, by + 10);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(barX + 50, by + 2, barW - 55, bandH - 4);
    ctx.fillStyle = NV_COLORS[bi];
    ctx.globalAlpha = 0.8;
    ctx.fillRect(barX + 50, by + 2, val * (barW - 55), bandH - 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.fillText(
      Math.round(val * 100) + "%",
      barX + 50 + val * (barW - 55) + 4,
      by + bandH - 6,
    );
    // Sparkline
    ctx.strokeStyle = NV_COLORS[bi] + "80";
    ctx.lineWidth = 1;
    ctx.beginPath();
    nvState.fftBandHistory[bi].forEach((v, i) => {
      const sx = barX + 50 + (i / 39) * (barW - 55);
      const sy = by + bandH - 2 - v * (bandH - 8);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  });
}

// ── 3D Waterfall (IBVA-style) ──
function updateWaterfallCanvas() {
  const c = document.getElementById("waterfallCanvas");
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  const rel = state.bandPowers.relative || {};
  const bandVals = [
    rel.delta || 0,
    rel.theta || 0,
    rel.alpha || 0,
    rel.beta || 0,
    rel.gamma || 0,
  ];
  const nBins = 60;

  // Build a row from current band powers
  const row = [];
  for (let f = 0; f < nBins; f++) {
    const freq = (f / nBins) * 60;
    const bi = freq < 4 ? 0 : freq < 8 ? 1 : freq < 13 ? 2 : freq < 30 ? 3 : 4;
    row.push(
      bandVals[bi] * (0.7 + Math.sin(f * 0.2 + Date.now() * 0.002) * 0.3),
    );
  }
  nvState.waterfallHistory.push(row);
  if (nvState.waterfallHistory.length > 80) nvState.waterfallHistory.shift();

  const oX = 50,
    oY = 30,
    nRows = nvState.waterfallHistory.length;
  const binW = (W - 120) / nBins;

  // Draw back to front
  for (let r = 0; r < nRows; r++) {
    const rd = nvState.waterfallHistory[r];
    const yBase = H - oY - r * 4;
    const xShift = r * 1.5;
    const alpha = 0.08 + (r / nRows) * 0.92;

    // Filled polygon
    ctx.beginPath();
    ctx.moveTo(oX + xShift, yBase);
    for (let b = 0; b < nBins; b++) {
      const x = oX + xShift + b * binW;
      const amp = Math.min(rd[b], 1.5) * 130;
      ctx.lineTo(x, yBase - amp);
    }
    ctx.lineTo(oX + xShift + (nBins - 1) * binW, yBase);
    ctx.closePath();
    ctx.fillStyle =
      BAND_COLORS[2] +
      Math.floor(alpha * 18)
        .toString(16)
        .padStart(2, "0");
    ctx.fill();

    // Line segments colored by band
    for (let b = 1; b < nBins; b++) {
      const freq = (b / nBins) * 60;
      const bi =
        freq < 4 ? 0 : freq < 8 ? 1 : freq < 13 ? 2 : freq < 30 ? 3 : 4;
      ctx.strokeStyle = NV_COLORS[bi];
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(
        oX + xShift + (b - 1) * binW,
        yBase - Math.min(rd[b - 1], 1.5) * 130,
      );
      ctx.lineTo(oX + xShift + b * binW, yBase - Math.min(rd[b], 1.5) * 130);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Frequency axis
  ctx.fillStyle = "#888";
  ctx.font = "9px monospace";
  [0, 4, 8, 13, 30, 60].forEach((f) => {
    ctx.fillText(f + "Hz", oX + (f / 60) * (W - 120) - 6, H - 4);
  });
  // Band labels
  ctx.font = "bold 9px monospace";
  NV_RANGES.forEach((br, bi) => {
    const x1 = oX + (br.lo / 60) * (W - 120);
    ctx.fillStyle = NV_COLORS[bi] + "40";
    ctx.fillRect(x1, 4, oX + (br.hi / 60) * (W - 120) - x1, 14);
    ctx.fillStyle = NV_COLORS[bi];
    ctx.fillText(NV_NAMES[bi], x1 + 2, 14);
  });
  ctx.fillStyle = "#888";
  ctx.font = "10px monospace";
  ctx.fillText("← Time (rows)", W - 110, 18);
  ctx.fillText("Amplitude ↑", 2, 18);
}

// ── Phase Display (polar plot) ──
function updatePhaseCanvas() {
  const c = document.getElementById("phaseCanvas");
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  const cX = W / 2,
    cY = H / 2,
    R = Math.min(cX, cY) - 30;
  const rel = state.bandPowers.relative || {};
  const bandVals = [
    rel.delta || 0,
    rel.theta || 0,
    rel.alpha || 0,
    rel.beta || 0,
    rel.gamma || 0,
  ];
  const electrodes = ["TP9", "AF7", "AF8", "TP10"];
  const col = BAND_COLORS[2]; // Alpha color

  // Grid circles
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 0.5;
  [1, 0.75, 0.5, 0.25].forEach((s) => {
    ctx.beginPath();
    ctx.arc(cX, cY, R * s, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(cX - R, cY);
  ctx.lineTo(cX + R, cY);
  ctx.moveTo(cX, cY - R);
  ctx.lineTo(cX, cY + R);
  ctx.stroke();

  // Degree labels
  ctx.fillStyle = "#888";
  ctx.font = "9px monospace";
  [0, 90, 180, 270].forEach((deg) => {
    const rad = (deg * Math.PI) / 180;
    ctx.fillText(
      deg + "°",
      cX + Math.cos(rad) * (R + 14) - 8,
      cY + Math.sin(rad) * (R + 14) + 3,
    );
  });

  // Electrode phase vectors
  const t = Date.now() * 0.001;
  electrodes.forEach((el, i) => {
    const eeg = state.eegData[i] || [];
    const lastVal = eeg.length > 0 ? eeg[eeg.length - 1] : 0;
    const phase = (lastVal / 80) * Math.PI + i * 0.8 + t * 0.5;
    const mg = Math.min(Math.max(bandVals[2] + i * 0.05, 0), 1);
    const ex = cX + Math.cos(phase) * R * mg,
      ey = cY + Math.sin(phase) * R * mg;

    // Trail
    if (!nvState.phaseTrails[el]) nvState.phaseTrails[el] = [];
    nvState.phaseTrails[el].push({ x: ex, y: ey });
    if (nvState.phaseTrails[el].length > 12) nvState.phaseTrails[el].shift();
    ctx.strokeStyle = col + "30";
    ctx.lineWidth = 1;
    ctx.beginPath();
    nvState.phaseTrails[el].forEach((pt, j) =>
      j === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y),
    );
    ctx.stroke();

    // Vector line
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + mg * 0.5;
    ctx.beginPath();
    ctx.moveTo(cX, cY);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Dot + label
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(ex, ey, 3 + mg * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px monospace";
    ctx.fillText(el, ex + 6, ey - 4);
  });
}

// ── PPG / Heart Rate Display ──
function updatePPGHRCanvas() {
  const c = document.getElementById("ppgHRCanvas");
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  const ppgColors = ["#ef4444", "#22c55e", "#3b82f6"];
  const ppgLabels = ["Red LED", "Green LED", "Infrared"];
  const ppgData = state.motionData.ppg || [[], [], []];

  // Store history
  for (let i = 0; i < 3; i++) {
    const arr = ppgData[i] || [];
    if (arr.length > 0) nvState.ppgHistory[i].push(arr[arr.length - 1]);
    if (nvState.ppgHistory[i].length > 250) nvState.ppgHistory[i].shift();
  }

  // Simulated HR from PPG period
  const hr = nvState.ppgHrSmooth;
  nvState.ppgHrSmooth =
    hr * 0.98 + (60 + Math.sin(Date.now() * 0.0005) * 12) * 0.02;

  // HR display
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 36px monospace";
  ctx.fillText("❤️ " + Math.round(nvState.ppgHrSmooth) + " BPM", 20, 50);
  ctx.fillStyle = "#888";
  ctx.font = "11px monospace";
  ctx.fillText(
    "Photoplethysmography — blood volume pulse via infrared light",
    20,
    70,
  );
  ctx.fillText("HRV observable in peak spacing. Smoothed BPM readout.", 20, 84);

  // PPG waveforms
  const plotY = 100,
    plotH = H - plotY - 20;
  ppgLabels.forEach((label, ci) => {
    const data = nvState.ppgHistory[ci];
    if (data.length < 2) return;
    ctx.strokeStyle = ppgColors[ci];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = 20 + (i / 249) * (W - 40);
      const y = plotY + (ci * plotH) / 3 + plotH / 6 - v * (plotH / 8);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = ppgColors[ci];
    ctx.font = "bold 9px monospace";
    ctx.fillText(label, W - 80, plotY + (ci * plotH) / 3 + 14);
  });
}

// ── Accelerometer Display (Motion Sensor) ──
function updateAccelCanvas() {
  const c = document.getElementById("accelChart");
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);

  const accelColors = ["#ef4444", "#22c55e", "#3b82f6"];
  const accelLabels = ["X", "Y", "Z"];
  const accelData = state.motionData.accel || [[], [], []];

  // Store history for each axis
  for (let i = 0; i < 3; i++) {
    const arr = accelData[i] || [];
    if (arr.length > 0) {
      if (!nvState.accelHistory) nvState.accelHistory = [[], [], []];
      nvState.accelHistory[i].push(arr[arr.length - 1] || 0);
      if (nvState.accelHistory[i].length > 200) nvState.accelHistory[i].shift();
    }
  }

  // Title
  ctx.fillStyle = "#999";
  ctx.font = "11px monospace";
  ctx.fillText("💨 Accelerometer (g-force, Z≈9.8 at rest)", 20, 20);

  // Draw 3 waveforms side by side
  if (!nvState.accelHistory) nvState.accelHistory = [[], [], []];
  const plotH = (H - 40) / 3;
  const plotW = W - 40;

  for (let axis = 0; axis < 3; axis++) {
    const data = nvState.accelHistory[axis];
    const y0 = 30 + axis * plotH;

    // Axis label + value
    ctx.fillStyle = accelColors[axis];
    ctx.font = "bold 10px monospace";
    const lastVal = data.length > 0 ? data[data.length - 1] : 0;
    ctx.fillText(`${accelLabels[axis]}: ${lastVal.toFixed(2)} g`, 20, y0 + 12);

    // Grid line
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(20, y0 + plotH / 2);
    ctx.lineTo(W - 20, y0 + plotH / 2);
    ctx.stroke();

    // Waveform
    if (data.length > 1) {
      ctx.strokeStyle = accelColors[axis];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = 20 + (i / 199) * plotW;
        const yOffset = (v / 12) * (plotH * 0.35);
        const y = y0 + plotH / 2 - yOffset;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
}

// ── Gyroscope Display (Motion Sensor) ──
function updateGyroCanvas() {
  const c = document.getElementById("gyroChart");
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);

  const gyroColors = ["#a855f7", "#f59e0b", "#06b6d4"];
  const gyroLabels = ["X", "Y", "Z"];
  const gyroData = state.motionData.gyro || [[], [], []];

  // Store history for each axis
  for (let i = 0; i < 3; i++) {
    const arr = gyroData[i] || [];
    if (arr.length > 0) {
      if (!nvState.gyroHistory) nvState.gyroHistory = [[], [], []];
      nvState.gyroHistory[i].push(arr[arr.length - 1] || 0);
      if (nvState.gyroHistory[i].length > 200) nvState.gyroHistory[i].shift();
    }
  }

  // Title
  ctx.fillStyle = "#999";
  ctx.font = "11px monospace";
  ctx.fillText("🔄 Gyroscope (°/s, rotation velocity)", 20, 20);

  // Draw 3 waveforms side by side
  if (!nvState.gyroHistory) nvState.gyroHistory = [[], [], []];
  const plotH = (H - 40) / 3;
  const plotW = W - 40;

  for (let axis = 0; axis < 3; axis++) {
    const data = nvState.gyroHistory[axis];
    const y0 = 30 + axis * plotH;

    // Axis label + value
    ctx.fillStyle = gyroColors[axis];
    ctx.font = "bold 10px monospace";
    const lastVal = data.length > 0 ? data[data.length - 1] : 0;
    ctx.fillText(`${gyroLabels[axis]}: ${lastVal.toFixed(1)} °/s`, 20, y0 + 12);

    // Grid line
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(20, y0 + plotH / 2);
    ctx.lineTo(W - 20, y0 + plotH / 2);
    ctx.stroke();

    // Waveform
    if (data.length > 1) {
      ctx.strokeStyle = gyroColors[axis];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = 20 + (i / 199) * plotW;
        const yOffset = (v / 6) * (plotH * 0.3);
        const y = y0 + plotH / 2 - yOffset;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
}

// ── PPG/Heart Rate for Motion Tab ──
function updatePPGHRMotion() {
  const c = document.getElementById("ppgChart");
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);

  const ppgColors = ["#ef4444", "#22c55e", "#3b82f6"];
  const ppgLabels = ["Red", "Green", "IR"];
  const ppgData = state.motionData.ppg || [[], [], []];

  // Store history
  if (!nvState.ppgMotionHistory) nvState.ppgMotionHistory = [[], [], []];
  for (let i = 0; i < 3; i++) {
    const arr = ppgData[i] || [];
    if (arr.length > 0) {
      nvState.ppgMotionHistory[i].push(arr[arr.length - 1] || 0);
      if (nvState.ppgMotionHistory[i].length > 200)
        nvState.ppgMotionHistory[i].shift();
    }
  }

  // Title + HR display
  const hr = nvState.ppgHrSmooth;
  nvState.ppgHrSmooth =
    hr * 0.98 + (60 + Math.sin(Date.now() * 0.0005) * 12) * 0.02;

  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 32px monospace";
  ctx.fillText("❤️ " + Math.round(nvState.ppgHrSmooth) + " BPM", 20, 35);

  // PPG waveforms
  const plotY = 50;
  const plotH = H - plotY - 20;
  const plotW = W - 40;

  for (let ch = 0; ch < 3; ch++) {
    const data = nvState.ppgMotionHistory[ch];
    const yOffset = ch * (plotH / 3);

    // Channel label
    ctx.fillStyle = ppgColors[ch];
    ctx.font = "bold 9px monospace";
    ctx.fillText(ppgLabels[ch], W - 30, plotY + yOffset + 15);

    // Waveform
    if (data.length > 1) {
      ctx.strokeStyle = ppgColors[ch];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = 20 + (i / 199) * plotW;
        const y =
          plotY +
          yOffset +
          plotH / 6 -
          (Math.max(Math.min(v, 100), 0) / 100) * (plotH / 3 - 10);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
}

// ── Quad View Panel Rendering ──
function renderQuadPanel(panelType, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear existing canvas or content
  container.innerHTML = "";

  if (panelType === "fftSpectrum") {
    const canvas = document.createElement("canvas");
    canvas.id = containerId + "-canvas";
    canvas.width = 520;
    canvas.height = 220;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.borderRadius = "6px";
    canvas.style.background = "#0d1117";
    container.appendChild(canvas);
    updateQuadFFTSpectrumCanvas(canvas.id);
  } else if (panelType === "waterfall") {
    const canvas = document.createElement("canvas");
    canvas.id = containerId + "-canvas";
    canvas.width = 520;
    canvas.height = 220;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.borderRadius = "6px";
    canvas.style.background = "#0d1117";
    container.appendChild(canvas);
    updateQuadWaterfallCanvas(canvas.id);
  } else if (panelType === "phase") {
    const canvas = document.createElement("canvas");
    canvas.id = containerId + "-canvas";
    canvas.width = 240;
    canvas.height = 220;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.borderRadius = "6px";
    canvas.style.background = "#0d1117";
    container.appendChild(canvas);
    updateQuadPhaseCanvas(canvas.id);
  } else if (panelType === "ppgHR") {
    const canvas = document.createElement("canvas");
    canvas.id = containerId + "-canvas";
    canvas.width = 520;
    canvas.height = 220;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.borderRadius = "6px";
    canvas.style.background = "#0d1117";
    container.appendChild(canvas);
    updateQuadPPGCanvas(canvas.id);
  }
}

function updateQuadViewPanels() {
  // Get current panel selections
  const panelA = document.getElementById("quadPanelA")?.value || "fftSpectrum";
  const panelB = document.getElementById("quadPanelB")?.value || "waterfall";
  const panelC = document.getElementById("quadPanelC")?.value || "phase";
  const panelD = document.getElementById("quadPanelD")?.value || "ppgHR";

  // Render each quadrant
  renderQuadPanel(panelA, "quadPanelA-content");
  renderQuadPanel(panelB, "quadPanelB-content");
  renderQuadPanel(panelC, "quadPanelC-content");
  renderQuadPanel(panelD, "quadPanelD-content");
}

// ── Quad FFT Spectrum (compact) ──
function updateQuadFFTSpectrumCanvas(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  const rel = state.bandPowers.relative || {};
  const bandVals = [
    rel.delta || 0,
    rel.theta || 0,
    rel.alpha || 0,
    rel.beta || 0,
    rel.gamma || 0,
  ];
  const specW = W * 0.6,
    barX = specW + 10,
    barW = W - barX - 8;

  // Band shading
  NV_RANGES.forEach((br, bi) => {
    const x1 = 30 + (br.lo / 60) * (specW - 40),
      x2 = 30 + (br.hi / 60) * (specW - 40);
    ctx.fillStyle = NV_COLORS[bi] + "10";
    ctx.fillRect(x1, 8, x2 - x1, H - 20);
    ctx.fillStyle = NV_COLORS[bi];
    ctx.font = "bold 7px monospace";
    ctx.fillText(NV_NAMES[bi], x1 + 1, 7);
  });

  // Spectrum curve
  for (let ch = 0; ch < 2; ch++) {
    ctx.strokeStyle = NV_COLORS[ch];
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let f = 0; f < 60; f++) {
      const freq = (f / 60) * 60;
      const bi =
        freq < 4 ? 0 : freq < 8 ? 1 : freq < 13 ? 2 : freq < 30 ? 3 : 4;
      const amp =
        bandVals[bi] * (30 + Math.sin(f * 0.3 + ch + Date.now() * 0.001) * 10);
      const x = 30 + (freq / 60) * (specW - 40);
      const y = H - 8 - amp * (H - 16) * 0.6;
      f === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Band power bars (compact)
  ctx.fillStyle = "#999";
  ctx.font = "bold 7px monospace";
  ctx.fillText("Power", barX + 2, 8);
  const bandH = (H - 15) / 5 - 2;
  NV_NAMES.forEach((name, bi) => {
    const val = bandVals[bi];
    const by = 12 + bi * (bandH + 2);
    ctx.fillStyle = NV_COLORS[bi];
    ctx.font = "bold 6px monospace";
    ctx.fillText(name.substring(0, 3), barX + 2, by + 6);
    ctx.fillStyle = "#222";
    ctx.fillRect(barX + 28, by + 1, barW - 30, bandH - 2);
    ctx.fillStyle = NV_COLORS[bi];
    ctx.globalAlpha = 0.8;
    ctx.fillRect(barX + 28, by + 1, Math.max(1, val * (barW - 30)), bandH - 2);
    ctx.globalAlpha = 1;
  });
}

// ── Quad Waterfall (compact) ──
function updateQuadWaterfallCanvas(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  const rel = state.bandPowers.relative || {};
  const bandVals = [
    rel.delta || 0,
    rel.theta || 0,
    rel.alpha || 0,
    rel.beta || 0,
    rel.gamma || 0,
  ];

  // Add row to history
  const row = [];
  for (let f = 0; f < 40; f++) {
    const freq = (f / 40) * 60;
    const bi = freq < 4 ? 0 : freq < 8 ? 1 : freq < 13 ? 2 : freq < 30 ? 3 : 4;
    row.push(
      bandVals[bi] * (0.6 + Math.sin(f * 0.2 + Date.now() * 0.002) * 0.4),
    );
  }
  if (!nvState.quadWaterfallHist) nvState.quadWaterfallHist = [];
  nvState.quadWaterfallHist.push(row);
  if (nvState.quadWaterfallHist.length > 30) nvState.quadWaterfallHist.shift();

  const oX = 20,
    oY = 10;
  const binW = (W - 30) / 40;
  const nRows = nvState.quadWaterfallHist.length;

  // Draw back to front
  for (let r = 0; r < nRows; r++) {
    const depth = 1 - r / nRows;
    const rd = nvState.quadWaterfallHist[r];
    for (let f = 0; f < 40; f++) {
      const bi = Math.floor((f / 40) * 5);
      const val = rd[f] || 0;
      const x = oX + f * binW;
      const y = oY + r * ((H - 20) / nRows);
      const h = Math.max(1, val * (((H - 20) / nRows) * 0.8));
      ctx.fillStyle = NV_COLORS[bi];
      ctx.globalAlpha = 0.4 + depth * 0.4;
      ctx.fillRect(x, y, binW - 1, h);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Quad Phase (compact) ──
function updateQuadPhaseCanvas(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2,
    cy = H / 2,
    r = Math.min(W, H) / 2.5;
  const rel = state.bandPowers.relative || {};
  const bandVals = [
    rel.delta || 0,
    rel.theta || 0,
    rel.alpha || 0,
    rel.beta || 0,
    rel.gamma || 0,
  ];

  // Circle grid
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 0.5;
  for (let rr = r * 0.25; rr <= r; rr += r * 0.25) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial lines (freq bands)
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 0.5;
  for (let f = 0; f < 5; f++) {
    const ang = (f / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.stroke();
  }

  // Draw electrode vectors (simplified)
  for (let ch = 0; ch < 4; ch++) {
    const ang = (ch / 4) * Math.PI * 2 + Date.now() * 0.001;
    const mag = bandVals[2] * r; // Use alpha band
    const x = cx + Math.cos(ang) * mag;
    const y = cy + Math.sin(ang) * mag;
    ctx.fillStyle = NV_COLORS[ch];
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
}

// ── Quad PPG (compact) ──
function updateQuadPPGCanvas(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d"),
    W = c.width,
    H = c.height;
  ctx.clearRect(0, 0, W, H);

  // Simple HR display
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 18px monospace";
  ctx.fillText("❤️ " + Math.round(nvState.ppgHrSmooth) + " BPM", 10, 28);

  // Tiny waveform
  const ppgColors = ["#ef4444", "#22c55e", "#3b82f6"];
  const ppgLabels = ["R", "G", "IR"];
  const ppgData = state.motionData.ppg || [[], [], []];

  for (let i = 0; i < 3; i++) {
    const arr = ppgData[i] || [];
    if (arr.length > 0) {
      if (!nvState.quadPPGHist) nvState.quadPPGHist = [[], [], []];
      nvState.quadPPGHist[i].push(arr[arr.length - 1]);
      if (nvState.quadPPGHist[i].length > 100) nvState.quadPPGHist[i].shift();
    }

    if (nvState.quadPPGHist?.[i]) {
      ctx.strokeStyle = ppgColors[i];
      ctx.lineWidth = 1;
      ctx.beginPath();
      nvState.quadPPGHist[i].forEach((v, idx) => {
        const x = 10 + (idx / 99) * (W - 20);
        const y = 50 + i * ((H - 60) / 3) + (H - 80) / 6 - v * ((H - 80) / 12);
        idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = ppgColors[i];
      ctx.font = "bold 6px monospace";
      ctx.fillText(ppgLabels[i], W - 12, 50 + i * ((H - 60) / 3) + 6);
    }
  }
}

/**
 * Muse EEG Neuro Dashboard PRO - Frontend
 * Advanced visualization and controls
 */

const CONFIG = {
  wsUrl: `ws://${window.location.hostname}:8080`,
  maxDataPoints: 256,
  updateRate: 30, // Hz - controls chart update frequency
};

let state = {
  connected: false,
  deviceConnected: false,
  devices: [],
  selectedDeviceIndex: -1,
  selectedDeviceName: null,
  eegData: [[], [], [], []],
  charts: [null, null, null, null],
  fftChart: null,
  panelCharts: {}, // Panel-specific chart instances: "panel0_eeg", "panel1_bands", etc.
  motionCharts: {
    accel: null,
    gyro: null,
    ppg: null,
  },
  motionData: {
    accel: [[], [], []], // X, Y, Z
    gyro: [[], [], []], // X, Y, Z
    ppg: [[], [], []], // Red, Green, IR
  },
  packets: 0,
  lastPacketTime: 0,
  packetRateHz: 0,
  startTime: Date.now(),
  settings: {},
  recording: false,
  simulator: false,
  bandPowers: {},
  batteryLevel: 0,
  panelSelections: {
    0: "eeg",
    1: "bands",
    2: "fft",
    3: "stats",
  },
  biofeedback: {
    alphaThreshold: 0.5,
    betaThreshold: 0.4,
    deltaThreshold: 0.6,
    alertSounds: false, // Default OFF - enable via header toggle
    activeAlerts: {
      alpha: false,
      beta: false,
      delta: false,
    },
  },
};

const COLORS = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24"];
const BAND_COLORS = {
  delta: "#ff6b6b",
  theta: "#ffa500",
  alpha: "#4ecdc4",
  beta: "#45b7d1",
  gamma: "#f39c12",
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Dashboard initializing...");

  initCharts();
  // initFFTChart()  // LAZY: will initialize when FFT tab is clicked
  // initMotionCharts()  // LAZY: will initialize when Motion tab is clicked
  // initializeMultiPanel()  // DISABLED - using simple tab interface
  connectWebSocket();
  setupEventListeners();

  // Initialize device & data source indicators
  updateDeviceIndicator();
  updateDataSourceIndicator();

  // Initialize brain state UI
  updateBrainStateUI();

  // Initialize OSC examples and selectors
  initializeOSCSelectors();
  updateOSCExamples();
  setInterval(updateOSCMessages, 500);

  // Update brain state periodically based on band powers
  setInterval(() => {
    updateBrainStateEstimate();
    updateBrainStateUI();
  }, 500);

  // Update stats periodically
  setInterval(updateStats, 1000);
  setInterval(updatePerformanceMetrics, 1000);

  // Initialize Mind Metrics
  initMindMetrics();

  // Initialize color palette selector
  initializeColorPalette();

  // Continuous canvas visualization updates (run on every frame, even if tab not active)
  // This keeps data flowing to waterfall, FFT, phase, etc. so they're ready when you switch tabs
  function canvasUpdateLoop() {
    // Always update canvas visualization data in the background
    if (document.getElementById("waterfallCanvas")) {
      // Feed data to waterfall history even when not visible
      const rel = state.bandPowers.relative || {};
      const bandVals = [
        rel.delta || 0,
        rel.theta || 0,
        rel.alpha || 0,
        rel.beta || 0,
        rel.gamma || 0,
      ];
      const nBins = 60;
      const row = [];
      for (let f = 0; f < nBins; f++) {
        const freq = (f / nBins) * 60;
        const bi =
          freq < 4 ? 0 : freq < 8 ? 1 : freq < 13 ? 2 : freq < 30 ? 3 : 4;
        row.push(
          bandVals[bi] * (0.7 + Math.sin(f * 0.2 + Date.now() * 0.002) * 0.3),
        );
      }
      nvState.waterfallHistory.push(row);
      if (nvState.waterfallHistory.length > 80)
        nvState.waterfallHistory.shift();

      // Similarly, update FFT band history
      nvState.fftBandHistory.forEach((_, bi) => {
        const val = bandVals[bi];
        nvState.fftBandHistory[bi].push(val);
        if (nvState.fftBandHistory[bi].length > 40)
          nvState.fftBandHistory[bi].shift();
      });
    }

    requestAnimationFrame(canvasUpdateLoop);
  }
  canvasUpdateLoop();
});

// ============================================================================
// Charts Initialization
// ============================================================================

function initCharts() {
  const labels = [
    "EEG1 - Left Ear",
    "EEG2 - Left Forehead",
    "EEG3 - Right Forehead",
    "EEG4 - Right Ear",
  ];
  const canvases = ["chart1", "chart2", "chart3", "chart4"];

  canvases.forEach((id, idx) => {
    const canvas = document.getElementById(id);
    if (!canvas) {
      console.log(
        `[NeuroVis] Canvas #${id} not found (using React UI) — skipping Chart.js init`,
      );
      return; // Skip if canvas doesn't exist (React UI mode)
    }
    const ctx = canvas.getContext("2d");
    state.charts[idx] = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: labels[idx],
            data: [],
            borderColor: COLORS[idx],
            backgroundColor: `${COLORS[idx]}20`,
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "#00ff88",
            bodyColor: "#fff",
            borderColor: "#00ff88",
            borderWidth: 1,
            callbacks: {
              label: (context) => `${context.raw.toFixed(3)}`,
            },
          },
        },
        scales: {
          x: {
            display: false,
          },
          y: {
            display: true,
            grid: { color: "#2a2a3e" },
            ticks: { color: "#b0b0b0", maxTicksLimit: 5 },
          },
        },
      },
    });
  });
}

function initFFTChart() {
  const ctx = document.getElementById("fftChart").getContext("2d");
  const rel = state.bandPowers.relative || {};
  const labels = ["Delta", "Theta", "Alpha", "Beta", "Gamma"];
  const data = [
    rel.delta || 0,
    rel.theta || 0,
    rel.alpha || 0,
    rel.beta || 0,
    rel.gamma || 0,
  ];
  const colors = ["#ff6b6b", "#ffa500", "#4ecdc4", "#45b7d1", "#f39c12"];

  state.fftChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Power Spectral Density",
          data: data,
          backgroundColor: colors.map((c) => c + "80"),
          borderColor: colors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: true },
      },
      scales: {
        x: {
          grid: { color: "#2a2a3e" },
          ticks: { color: "#b0b0b0" },
          title: { display: true, text: "Frequency (Hz)" },
        },
        y: {
          grid: { color: "#2a2a3e" },
          ticks: { color: "#b0b0b0" },
          title: { display: true, text: "Power" },
          max: 1,
        },
      },
    },
  });
  console.log(`📊 FFT chart initialized with data:`, data);
}

function initMotionCharts() {
  // Accelerometer
  let ctx = document.getElementById("accelChart")?.getContext("2d");
  if (ctx) {
    state.motionCharts.accel = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "X", data: [], borderColor: "#ff0000", tension: 0.1 },
          { label: "Y", data: [], borderColor: "#00ff00", tension: 0.1 },
          { label: "Z", data: [], borderColor: "#0000ff", tension: 0.1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: { grid: { color: "#2a2a3e" }, ticks: { color: "#b0b0b0" } },
        },
      },
    });
  }

  // Gyroscope
  ctx = document.getElementById("gyroChart")?.getContext("2d");
  if (ctx) {
    state.motionCharts.gyro = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "X", data: [], borderColor: "#ff0000", tension: 0.1 },
          { label: "Y", data: [], borderColor: "#00ff00", tension: 0.1 },
          { label: "Z", data: [], borderColor: "#0000ff", tension: 0.1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: { grid: { color: "#2a2a3e" }, ticks: { color: "#b0b0b0" } },
        },
      },
    });
  }

  // PPG / Heart Rate
  ctx = document.getElementById("ppgChart")?.getContext("2d");
  if (ctx) {
    state.motionCharts.ppg = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "Red", data: [], borderColor: "#ff6666", tension: 0.1 },
          { label: "Green", data: [], borderColor: "#66ff66", tension: 0.1 },
          { label: "IR", data: [], borderColor: "#ffaa00", tension: 0.1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: { grid: { color: "#2a2a3e" }, ticks: { color: "#b0b0b0" } },
        },
      },
    });
  }

  // Populate charts with buffered data
  console.log(`📊 Populating motion charts with buffered data`);
  if (state.motionCharts.accel && state.motionData.accel) {
    state.motionCharts.accel.data.datasets[0].data =
      state.motionData.accel[0] || [];
    state.motionCharts.accel.data.datasets[1].data =
      state.motionData.accel[1] || [];
    state.motionCharts.accel.data.datasets[2].data =
      state.motionData.accel[2] || [];
    state.motionCharts.accel.update("none");
  }
  if (state.motionCharts.gyro && state.motionData.gyro) {
    state.motionCharts.gyro.data.datasets[0].data =
      state.motionData.gyro[0] || [];
    state.motionCharts.gyro.data.datasets[1].data =
      state.motionData.gyro[1] || [];
    state.motionCharts.gyro.data.datasets[2].data =
      state.motionData.gyro[2] || [];
    state.motionCharts.gyro.update("none");
  }
  if (state.motionCharts.ppg && state.motionData.ppg) {
    state.motionCharts.ppg.data.datasets[0].data =
      state.motionData.ppg[0] || [];
    state.motionCharts.ppg.data.datasets[1].data =
      state.motionData.ppg[1] || [];
    state.motionCharts.ppg.data.datasets[2].data =
      state.motionData.ppg[2] || [];
    state.motionCharts.ppg.update("none");
  }
}

function updateMotionChart(sensorType, values) {
  const chart = state.motionCharts[sensorType];
  if (!chart || values.length !== 3) return;

  // Update each axis dataset
  for (let i = 0; i < 3; i++) {
    const data = chart.data.datasets[i].data;
    data.push(values[i]);
    if (data.length > 128) {
      data.shift();
    }
  }

  chart.update("none");

  // Update panel motion chart if visible
  const panelChartId = {
    accel: "panelAccelChart",
    gyro: "panelGyroChart",
    ppg: "panelPpgChart",
  }[sensorType];

  const panelChart = state.panelCharts[panelChartId];
  if (panelChart && panelChart.data.datasets) {
    for (let i = 0; i < 3; i++) {
      panelChart.data.datasets[i].data = state.motionData[sensorType][i] || [];
    }
    panelChart.update("none");
  }
}

function updateActivePanels() {
  // ONLY updates chart data, does NOT re-render HTML (prevents strobing)
  Object.entries(state.panelSelections || {}).forEach(([index, panelType]) => {
    updatePanelCharts(parseInt(index), panelType);
  });
}

function updatePanelCharts(panelIndex, contentType) {
  const CHART_ID_MAP = {
    eeg: "panelEegChart",
    fft: "panelFFTChart",
    accel: "panelAccelChart",
    gyro: "panelGyroChart",
    ppg: "panelPpgChart",
  };

  const chartId = CHART_ID_MAP[contentType];
  if (!chartId || !state.panelCharts[chartId]) return;

  const chart = state.panelCharts[chartId];

  try {
    switch (contentType) {
      case "eeg":
        chart.data.datasets[0].data = state.eegData[0] || [];
        chart.data.datasets[1].data = state.eegData[1] || [];
        chart.data.datasets[2].data = state.eegData[2] || [];
        chart.data.datasets[3].data = state.eegData[3] || [];
        break;
      case "fft":
        const rel = state.bandPowers.relative || {};
        chart.data.datasets[0].data = [
          rel.delta || 0,
          rel.theta || 0,
          rel.alpha || 0,
          rel.beta || 0,
          rel.gamma || 0,
        ];
        break;
      case "accel":
      case "gyro":
      case "ppg":
        const data = state.motionData[contentType] || [[], [], []];
        chart.data.datasets[0].data = data[0] || [];
        chart.data.datasets[1].data = data[1] || [];
        chart.data.datasets[2].data = data[2] || [];
        break;
    }
    chart.update("none");
  } catch (err) {
    console.error(`❌ Error updating panel chart ${chartId}:`, err);
  }
}

function updateChart(chartIndex, value) {
  const chart = state.charts[chartIndex];
  if (!chart) return;

  const data = chart.data.datasets[0].data;
  data.push(value);

  if (data.length > CONFIG.maxDataPoints) {
    data.shift();
  }

  chart.data.labels = Array.from({ length: data.length }, (_, i) => i);
  chart.update("none");
}

// ============================================================================
// WebSocket Connection
// ============================================================================

function connectWebSocket() {
  const ws = new WebSocket(CONFIG.wsUrl);

  ws.onopen = () => {
    state.connected = true;
    updateStatus("ws", true);
    console.log("✓ WebSocket connected");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log(`🔌 WebSocket message parsed: type=${msg.type}`);
      handleServerMessage(msg);
    } catch (e) {
      console.error("Parse error:", e);
    }
  };

  ws.onerror = () => {
    updateStatus("ws", false);
  };

  ws.onclose = () => {
    state.connected = false;
    updateStatus("ws", false);
    setTimeout(connectWebSocket, 3000);
  };

  window.ws = ws;
}

function handleServerMessage(msg) {
  if (msg.type !== "eeg")
    console.log(`📡 Message received: type="${msg.type}"`, msg);
  switch (msg.type) {
    case "eeg":
      handleEEGData(msg);
      break;
    case "bandPowers":
      console.log(`✅ Handling bandPowers`);
      handleBandPowers(msg);
      break;
    case "motionData":
      console.log(`✅ Handling motionData: sensor=${msg.sensor}`);
      handleMotionData(msg);
      break;
    case "battery":
      handleBattery(msg);
      break;
    case "device_list":
      handleDeviceList(msg.devices);
      // Update React UI device list
      if (window._reactSetBtDevs && msg.devices) {
        const btDevs = msg.devices.map((dev) => ({
          name: dev.name,
          mac: dev.mac || "",
          device_type: dev.device_type || "muse_2", // Use device_type from server
        }));
        window._reactSetBtDevs(btDevs);
      }
      break;
    case "settings_updated":
      state.settings = msg.settings;
      updateSettingsUI();
      updateStreamingStatusDisplay();
      updateDataSourceIndicator();
      break;
    case "instrument_status":
      handleInstrumentStatus(msg);
      break;
    case "init":
      state.settings = msg.settings;
      handleDeviceList(msg.devices || []);
      // Update React UI device list
      if (window._reactSetBtDevs && msg.devices) {
        const btDevs = (msg.devices || []).map((dev) => ({
          name: dev.name,
          mac: dev.mac || "",
          device_type: dev.device_type || "muse_2", // Use device_type from server
        }));
        window._reactSetBtDevs(btDevs);
      }
      updateStreamingStatusDisplay();
      updateDataSourceIndicator();
      break;
  }
}

function handleBandPowers(msg) {
  console.log("📊 Band Powers received:", msg);
  console.log("🧠 state.bandPowers now:", state.bandPowers);
  console.log("🎨 Active panels:", state.panelSelections);
  state.bandPowers = msg;

  // Update band display bars (sidebar only)
  if (msg.relative) {
    const rel = msg.relative;
    const bandNames = ["delta", "theta", "alpha", "beta", "gamma"];
    bandNames.forEach((name) => {
      const bar = document.getElementById(`band-${name}`);
      const val = document.getElementById(`band-${name}-val`);
      if (bar) bar.style.width = rel[name] * 100 + "%";
      if (val) val.textContent = rel[name].toFixed(3);
    });
  }

  // Update FFT chart with band powers
  updateFFTChart(msg);

  // Check biofeedback alerts
  checkBiofeedbackAlerts(msg);
}

function handleMotionData(msg) {
  console.log(
    `💨 Motion Data received: sensor=${msg.sensor}, values=[${msg.values}]`,
  );

  if (!msg.sensor || !msg.values) return;

  const sensor = msg.sensor;
  const values = msg.values;

  // Store in motion data buffers
  if (state.motionData[sensor]) {
    for (let i = 0; i < values.length && i < 3; i++) {
      state.motionData[sensor][i].push(values[i]);
      // Keep buffer limited to last 256 samples
      if (state.motionData[sensor][i].length > 256) {
        state.motionData[sensor][i].shift();
      }
    }
  }

  // Update motion displays (if elements exist)
  if (sensor === "accel") {
    const accelX = document.getElementById("accelXValue");
    const accelY = document.getElementById("accelYValue");
    const accelZ = document.getElementById("accelZValue");
    if (accelX) accelX.textContent = values[0].toFixed(2);
    if (accelY) accelY.textContent = values[1].toFixed(2);
    if (accelZ) accelZ.textContent = values[2].toFixed(2);
    updateMotionChart("accel", values);
  } else if (sensor === "gyro") {
    const gyroX = document.getElementById("gyroXValue");
    const gyroY = document.getElementById("gyroYValue");
    const gyroZ = document.getElementById("gyroZValue");
    if (gyroX) gyroX.textContent = values[0].toFixed(2);
    if (gyroY) gyroY.textContent = values[1].toFixed(2);
    if (gyroZ) gyroZ.textContent = values[2].toFixed(2);
    updateMotionChart("gyro", values);
  } else if (sensor === "ppg") {
    const ppgRed = document.getElementById("ppgRedValue");
    const ppgGreen = document.getElementById("ppgGreenValue");
    const ppgIR = document.getElementById("ppgIRValue");
    if (ppgRed) ppgRed.textContent = values[0].toFixed(0);
    if (ppgGreen) ppgGreen.textContent = values[1].toFixed(0);
    if (ppgIR) ppgIR.textContent = values[2].toFixed(0);
    updateMotionChart("ppg", values);
  }
}

function handleBattery(msg) {
  if (msg.percentage !== undefined) {
    state.batteryLevel = msg.percentage;
    const batteryEl = document.getElementById("batteryPercentageDisplay");
    const statusEl = document.getElementById("batteryStatusDisplay");

    if (batteryEl) {
      batteryEl.textContent = msg.percentage.toFixed(0) + "%";
    }

    if (statusEl) {
      let status = "🔋 Good";
      if (msg.percentage > 75) {
        status = "🔋 Full";
      } else if (msg.percentage > 50) {
        status = "🔋 Good";
      } else if (msg.percentage > 25) {
        status = "⚠️ Low";
      } else {
        status = "🔴 Critical";
      }
      statusEl.textContent = status;
    }
  }
}

function handleInstrumentStatus(msg) {
  updateInstrumentUI(msg.current, msg.running, msg.mode || "headless");
}

function handleEEGData(msg) {
  state.packets++;
  lastPacketTime = Date.now();
  state.deviceConnected = true;
  updateStatus("device", true);
  trackPacket();

  // Log OSC messages to console (with applied scaling)
  if (msg.raw) {
    logOSCMessage(msg.raw[0], msg.raw[1], msg.raw[2], msg.raw[3]);
  }

  const eeg = msg.processed || msg.raw;
  eeg.forEach((value, idx) => {
    state.eegData[idx].push(value);
    if (state.eegData[idx].length > CONFIG.maxDataPoints) {
      state.eegData[idx].shift();
    }
    updateChart(idx, value);
  });

  // Update panel EEG chart if visible
  const eegChart = state.panelCharts["panelEegChart"];
  if (eegChart) {
    eegChart.data.datasets.forEach((ds, i) => {
      ds.data = state.eegData[i] || [];
    });
    eegChart.update("none");
  }

  // Update band powers
  if (msg.fft && msg.fft.channel_0) {
    const bands = msg.fft.channel_0;
    updateBandDisplay(bands);
    updateFFTChart(bands);
  }

  // Update statistics
  if (msg.stats && msg.stats.length > 0) {
    updateStatsDisplay(msg.stats);
  }
}

function handleDeviceList(devices) {
  const container = document.getElementById("deviceList");
  state.devices = devices;

  // Skip sidebar rendering if using React UI (no deviceList element)
  if (!container) {
    console.log("[NeuroVis] Using React UI — skipping sidebar device list");
    return;
  }

  if (devices.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid #444;">
        <p style="color: #aaa; margin: 8px 0; font-size: 0.9rem;">📱 No Real Devices Detected</p>
        <p style="color: #f59e0b; margin: 8px 0; font-size: 0.85rem; font-weight: 600;">✨ Use Simulator Mode to Test!</p>
        <p style="color: #666; margin: 8px 0; font-size: 0.75rem;">Scroll down to the <strong>🎲 Simulator</strong> section and click <strong>Enable Test Mode</strong> to test the dashboard with synthetic EEG data.</p>
        <div style="margin-top: 12px; padding: 8px; background: #1a3a3a; border-radius: 4px; border-left: 3px solid #4dd0e1;">
          <p style="margin: 0; font-size: 0.7rem; color: #4dd0e1;">
            <strong>💡 For real Muse device:</strong> Pair device in Bluetooth settings, then ensure MuseBridge is running.
          </p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = devices
    .map((device, idx) => {
      const isSelected = state.selectedDeviceIndex === idx;
      const borderStyle = isSelected
        ? "4px solid #00ff88; box-shadow: 0 0 10px #00ff88;"
        : "4px solid #333;";

      // Infer device type from name
      let deviceType = "muse-2";
      if (device.name.includes("Muse S") || device.name.includes("Athena"))
        deviceType = "muse-s";
      if (device.name.includes("Ganglion")) deviceType = "ganglion";
      if (device.name.includes("Ultracortex")) deviceType = "ultracortex";

      const info = DEVICE_INFO[deviceType];

      return `
    <div class="device-card" onclick="connectDevice(${idx})" style="border: ${borderStyle}; cursor: pointer; transition: all 0.2s; padding: 12px; background: var(--bg-secondary); border-radius: 6px; position: relative;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-size: 1.2rem;">${info.icon}</span>
        <div style="flex: 1;">
          <div class="device-name" style="font-weight: 700; margin: 0; color: #00ff88;">
            ${isSelected ? "✅ CONNECTED: " : "🔗 "} ${device.name}
          </div>
          <div style="font-size: 0.7rem; color: #888; margin: 2px 0;">${info.name}</div>
          <div style="font-size: 0.65rem; color: #f59e0b; margin-top: 4px; font-weight: 600;">
            ${isSelected ? "✓ Active" : "Click to Connect"}
          </div>
        </div>
      </div>
      <div style="padding-top: 8px; border-top: 1px solid #333; font-size: 0.75rem; color: #999;">
        <div style="margin-bottom: 4px;">
          <strong style="color: #00ff88;">Channels:</strong> ${info.channels} × ${info.channelNames.join(", ")}
        </div>
        <div style="margin-bottom: 4px;">
          <strong style="color: #00ff88;">Extras:</strong> ${info.extras.join(", ")}
        </div>
        <div style="margin-bottom: 4px;">
          <strong style="color: #00ff88;">Specs:</strong> ${info.specs}
        </div>
        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #555; color: #aaa;">
          🔋 Battery: ${device.battery || "?"}%
        </div>
      </div>
    </div>
  `;
    })
    .join("");

  // Update header device selector dropdown
  updateHeaderDeviceSelector();
}

// Update header device dropdown to match device list
function updateHeaderDeviceSelector() {
  const selector = document.getElementById("headerDeviceSelector");
  if (!selector) return;

  const devices = state.devices || [];
  selector.innerHTML = '<option value="">No Device</option>';

  devices.forEach((device, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    const deviceType =
      device.name.includes("Athena") || device.name.includes("Muse S")
        ? "Muse S"
        : device.name.includes("Ganglion")
          ? "Ganglion"
          : device.name.includes("Ultracortex")
            ? "Ultracortex"
            : "Muse 2";
    option.textContent = `${device.name} (${deviceType})`;

    // Mark as selected if this device is connected
    if (state.selectedDeviceIndex === idx) {
      option.textContent = `✅ ${option.textContent}`;
      option.selected = true;
    }

    selector.appendChild(option);
  });

  // Add change listener
  selector.onchange = (e) => {
    if (e.target.value !== "") {
      connectDevice(parseInt(e.target.value));
    }
  };
}

// ============================================================================
// Band Power Display
// ============================================================================

function updateBandDisplay(bands) {
  Object.keys(bands).forEach((band) => {
    const power = bands[band].power || 0;
    const normalized = Math.min(100, power * 1000); // Scale for visibility

    const fillEl = document.getElementById(`band-${band}`);
    const valEl = document.getElementById(`band-${band}-val`);

    if (fillEl) {
      fillEl.style.width = `${normalized}%`;
      fillEl.style.background = BAND_COLORS[band];
    }

    if (valEl) {
      valEl.textContent = power.toFixed(3);
    }
  });
}

// ============================================================================
// FFT Chart Update
// ============================================================================

function updateFFTChart(bands) {
  if (!state.fftChart || !bands) return;

  const bandNames = ["delta", "theta", "alpha", "beta", "gamma"];
  const powers = bandNames.map((band) => bands[band]?.power || 0);

  state.fftChart.data.labels = bandNames;
  state.fftChart.data.datasets[0].data = powers;

  // Color each bar by band
  state.fftChart.data.datasets[0].backgroundColor = bandNames.map((band) => {
    const color = BAND_COLORS[band] || "#00ff88";
    return color + "80"; // Add transparency
  });

  state.fftChart.data.datasets[0].borderColor = bandNames.map(
    (band) => BAND_COLORS[band] || "#00ff88",
  );

  state.fftChart.update("none");

  // Update panel FFT chart if visible
  const panelFFTChart = state.panelCharts["panelFFTChart"];
  if (panelFFTChart) {
    panelFFTChart.data.datasets[0].data = powers;
    panelFFTChart.update("none");
  }
}

// ============================================================================
// Statistics Display
// ============================================================================

function updateStatsDisplay(stats) {
  const tbody = document.getElementById("statsTableBody");
  if (!tbody) return;

  tbody.innerHTML = stats
    .map(
      (s, idx) => `
    <tr>
      <td>EEG${idx + 1}</td>
      <td>${s.min.toFixed(3)}</td>
      <td>${s.max.toFixed(3)}</td>
      <td>${s.mean.toFixed(3)}</td>
      <td>${s.stddev.toFixed(3)}</td>
    </tr>
  `,
    )
    .join("");

  // Update sidebar stats
  const panel = document.getElementById("statsPanel");
  if (panel) {
    panel.innerHTML = stats
      .map(
        (s) => `
      <div class="stat-item">
        <span class="stat-label">Ch${stats.indexOf(s) + 1}</span>
        <span class="stat-value">${s.mean.toFixed(2)}</span>
      </div>
    `,
      )
      .join("");
  }
}

// ============================================================================
// Device Control
// ============================================================================

function connectDevice(index) {
  if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
    alert("WebSocket not connected");
    return;
  }

  // Update state and UI
  state.selectedDeviceIndex = index;
  if (state.devices && state.devices[index]) {
    state.selectedDeviceName = state.devices[index].name;
    console.log(`✅ DEVICE SELECTED: ${state.selectedDeviceName}`);
  }

  // Re-render device list to show selection
  handleDeviceList(state.devices);
  updateDeviceIndicator();

  window.ws.send(
    JSON.stringify({
      type: "connect_device",
      deviceIndex: index,
    }),
  );
}

// ============================================================================
// Settings Management
// Settings Management
// ============================================================================

function setupEventListeners() {
  // Skip sidebar setup if using React UI (no sidebar elements)
  if (!document.getElementById("tabContainer")) {
    console.log(
      "[NeuroVis] React UI detected — skipping sidebar event listeners",
    );
    return;
  }

  // Tabs
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      switchTab(e.target.dataset.tab);
    });
  });

  // Quad View Panel Selectors
  ["A", "B", "C", "D"].forEach((quad) => {
    const select = document.getElementById(`quadPanel${quad}`);
    if (select) {
      select.addEventListener("change", (e) => {
        const panelType = e.target.value;
        const containerId = `quadPanel${quad}-content`;
        renderQuadPanel(panelType, containerId);
      });
    }
  });

  // Calibration Buttons
  const calibStartBtn = document.getElementById("calibrationStartBtn");
  const calibStopBtn = document.getElementById("calibrationStopBtn");
  const calibResetBtn = document.getElementById("calibrationResetBtn");

  if (calibStartBtn) {
    calibStartBtn.addEventListener("click", calibrationStart);
  }
  if (calibStopBtn) {
    calibStopBtn.addEventListener("click", calibrationStop);
  }
  if (calibResetBtn) {
    calibResetBtn.addEventListener("click", calibrationReset);
  }

  // DSP Processing Buttons
  initializeDSPButtons();

  // OSC Monitor Mode Buttons
  const oscModeABtn = document.getElementById("oscModeA");
  const oscModeBBtn = document.getElementById("oscModeB");
  const oscPortInput = document.getElementById("oscPort");
  const oscRateInput = document.getElementById("oscRate");
  const oscSmoothInput = document.getElementById("oscSmooth");
  const oscScaleInput = document.getElementById("oscScale");
  const oscFilteredToggle = document.getElementById("oscFiltered");

  if (oscModeABtn) oscModeABtn.addEventListener("click", () => setOSCMode("A"));
  if (oscModeBBtn) oscModeBBtn.addEventListener("click", () => setOSCMode("B"));

  if (oscPortInput) {
    oscPortInput.addEventListener("change", (e) => {
      oscConfig.port = parseInt(e.target.value) || 7400;
      document.getElementById("oscPortDisplay").textContent = oscConfig.port;
    });
  }

  if (oscRateInput) {
    oscRateInput.addEventListener("input", (e) => {
      oscConfig.rate = parseInt(e.target.value) || 20;
      document.getElementById("oscRateVal").textContent = oscConfig.rate;
      document.getElementById("oscRateDisplay").textContent = oscConfig.rate;
      updateOSCMessages();
    });
  }

  if (oscSmoothInput) {
    oscSmoothInput.addEventListener("input", (e) => {
      oscConfig.smooth = parseFloat(e.target.value) || 0;
      document.getElementById("oscSmoothVal").textContent =
        oscConfig.smooth.toFixed(2);
    });
  }

  if (oscScaleInput) {
    oscScaleInput.addEventListener("input", (e) => {
      oscConfig.scale = parseFloat(e.target.value) || 1;
      document.getElementById("oscScaleVal").textContent =
        oscConfig.scale.toFixed(2);
      updateOSCMessages();
    });
  }

  if (oscFilteredToggle) {
    oscFilteredToggle.addEventListener("change", (e) => {
      oscConfig.filtered = e.target.checked;
      document.getElementById("oscFilteredLabel").textContent =
        oscConfig.filtered ? "Filtered" : "Raw";
      document.getElementById("oscFilteredLabel").style.color =
        oscConfig.filtered ? "#22c55e" : "#888";
      updateOSCMessages();
    });
  }

  // Simulator (both sidebar and header)
  const handleSimulatorToggle = (checked) => {
    lastSliderUpdate["simulatorMode"] = Date.now(); // Track when user toggled
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: "toggle_simulator" }));
      document.getElementById("simControls").style.display = checked
        ? "block"
        : "none";
      // Update indicator immediately
      state.settings.simulatorMode = checked;
      updateDataSourceIndicator();
      // Sync both toggles
      document.getElementById("simulatorToggle").checked = checked;
      document.getElementById("headerSimulatorToggle").checked = checked;
    }
  };

  const sidebarToggle = document.getElementById("simulatorToggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("change", (e) => {
      handleSimulatorToggle(e.target.checked);
    });
  }

  const headerToggle = document.getElementById("headerSimulatorToggle");
  if (headerToggle) {
    headerToggle.addEventListener("change", (e) => {
      handleSimulatorToggle(e.target.checked);
    });
  }

  // Simulator frequency (sidebar only)
  const simFreq = document.getElementById("simFreq");
  if (simFreq) {
    simFreq.addEventListener("change", (e) => {
      const simFreqDisplay = document.getElementById("simFreqDisplay");
      if (simFreqDisplay) simFreqDisplay.textContent = e.target.value;
    });
  }

  // Recording (sidebar only)
  const recordBtn = document.getElementById("recordBtn");
  if (recordBtn) {
    recordBtn.addEventListener("click", toggleRecording);
  }
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadRecording);
  }

  // Instrument Selection - DISABLED
  // initializeInstrumentSelector()

  // Biofeedback Thresholds
  initializeBiofeedback();

  // DSP Pipeline Controls (sidebar only)
  // Filters
  const notchFilter = document.getElementById("notchFilter");
  if (notchFilter) {
    notchFilter.addEventListener("change", (e) => {
      lastSliderUpdate["applyNotch"] = Date.now(); // Track when we edited this
      const notchStatus = document.getElementById("notchStatus");
      if (notchStatus)
        notchStatus.textContent = e.target.checked ? "ON" : "OFF";
      updateDSPSetting("applyNotch", e.target.checked);
    });
  }

  const bandpassFilter = document.getElementById("bandpassFilter");
  if (bandpassFilter) {
    bandpassFilter.addEventListener("change", (e) => {
      lastSliderUpdate["applyBandpass"] = Date.now(); // Track when we edited this
      const bandpassStatus = document.getElementById("bandpassStatus");
      if (bandpassStatus)
        bandpassStatus.textContent = e.target.checked ? "ON" : "OFF";
      updateDSPSetting("applyBandpass", e.target.checked);
    });
  }

  // OSC Stream Selection
  const oscStreamRawEEG = document.getElementById("oscStreamRawEEG");
  const oscStreamBandAbsolute = document.getElementById(
    "oscStreamBandAbsolute",
  );
  const oscStreamBandRelative = document.getElementById(
    "oscStreamBandRelative",
  );

  if (oscStreamRawEEG) {
    oscStreamRawEEG.addEventListener("change", (e) => {
      updateOSCStreamSetting("rawEEG", e.target.checked);
    });
  }
  if (oscStreamBandAbsolute) {
    oscStreamBandAbsolute.addEventListener("change", (e) => {
      updateOSCStreamSetting("bandAbsolute", e.target.checked);
    });
  }
  if (oscStreamBandRelative) {
    oscStreamBandRelative.addEventListener("change", (e) => {
      updateOSCStreamSetting("bandRelative", e.target.checked);
    });
  }

  // Motion Data OSC Streams
  const oscStreamMotionAccel = document.getElementById("oscStreamMotionAccel");
  const oscStreamMotionGyro = document.getElementById("oscStreamMotionGyro");
  const oscStreamMotionPPG = document.getElementById("oscStreamMotionPPG");

  if (oscStreamMotionAccel) {
    oscStreamMotionAccel.addEventListener("change", (e) => {
      updateOSCStreamSetting("motionAccel", e.target.checked);
    });
  }
  if (oscStreamMotionGyro) {
    oscStreamMotionGyro.addEventListener("change", (e) => {
      updateOSCStreamSetting("motionGyro", e.target.checked);
    });
  }
  if (oscStreamMotionPPG) {
    oscStreamMotionPPG.addEventListener("change", (e) => {
      updateOSCStreamSetting("motionPPG", e.target.checked);
    });
  }

  // Smoothing slider
  const smoothingSlider = document.getElementById("smoothingSlider");
  smoothingSlider.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    const display = value === 0 ? "OFF" : value;
    document.getElementById("smoothingValue").textContent = display;
    lastSliderUpdate["smoothingAmount"] = Date.now(); // Track when we edited this
    updateDSPSetting("smoothingAmount", value);
  });

  // Scaling mode
  document.getElementById("scalingMode").addEventListener("change", (e) => {
    lastSliderUpdate["scalingMode"] = Date.now(); // Track when we edited this
    updateDSPSetting("scalingMode", e.target.value);
  });

  // Output rate (sampling rate)
  const outputRateSelect = document.getElementById("outputRateHz");
  if (outputRateSelect) {
    outputRateSelect.addEventListener("change", (e) => {
      lastSliderUpdate["outputRateHz"] = Date.now(); // Track when we edited this
      updateDSPSetting("outputRateHz", parseInt(e.target.value));
    });
  }

  // Artifact threshold
  const artifactSlider = document.getElementById("artifactSlider");
  artifactSlider.addEventListener("input", (e) => {
    document.getElementById("artifactValue").textContent = e.target.value;
    lastSliderUpdate["artifactThreshold"] = Date.now(); // Track when we edited this
    updateDSPSetting("artifactThreshold", parseInt(e.target.value));
  });

  // Display Options
  document.getElementById("chartSize").addEventListener("change", (e) => {
    updateChartSize(e.target.value);
  });

  // Channel toggles
  const chToggleIds = ["ch1Toggle", "ch2Toggle", "ch3Toggle", "ch4Toggle"];
  for (let idx = 0; idx < chToggleIds.length; idx++) {
    const el = document.getElementById(chToggleIds[idx]);
    if (el) {
      el.addEventListener("change", (e) => {
        toggleChannelDisplay(idx, e.target.checked);
      });
    }
  }

  // Presets
  const presetSelector = document.getElementById("presetSelector");
  presetSelector.addEventListener("change", (e) => {
    if (e.target.value) {
      applyPreset(e.target.value);
      e.target.value = "";
    }
  });

  // Show DSP info on hover
  presetSelector.addEventListener("mouseover", (e) => {
    const presetName = e.target.value || presetSelector.value;
    if (presetName && PRESETS[presetName]) {
      showPresetDSPInfo(presetName);
    }
  });

  presetSelector.addEventListener("mouseout", () => {
    const info = document.getElementById("presetDSPInfo");
    if (info) info.style.display = "none";
  });

  document
    .getElementById("savePresetBtn")
    .addEventListener("click", saveCurrentPreset);

  // Display Rate
  document
    .getElementById("displayRateSlider")
    .addEventListener("input", (e) => {
      document.getElementById("displayRateValue").textContent = e.target.value;
      CONFIG.updateRate = parseInt(e.target.value);
    });

  document
    .getElementById("bufferSizeSelect")
    .addEventListener("change", (e) => {
      CONFIG.maxDataPoints = parseInt(e.target.value);
      state.eegData = [[], [], [], []];
      console.log(`📊 Buffer size set to: ${e.target.value} samples`);
    });

  // Export
  document
    .getElementById("exportJsonBtn")
    .addEventListener("click", exportJSON);
  document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);

  // Band Selector Buttons (for visualization filtering)
  initializeBandSelectors();
}

function initializeBandSelectors() {
  // Wire band selector buttons in all tabs
  const bandNames = ["delta", "theta", "alpha", "beta", "gamma"];
  const bandLabels = {
    delta: "δ Delta",
    theta: "θ Theta",
    alpha: "α Alpha",
    beta: "β Beta",
    gamma: "γ Gamma",
  };

  // Find all band selector buttons and add click handlers
  document.querySelectorAll(".selector-btn[data-band]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const bandName = e.target.dataset.band;

      // Update selector state
      selectorState.selectedBand = bandName;

      // Update active state: remove from all, add to clicked
      e.target.parentElement
        .querySelectorAll("[data-band]")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");

      // Update visualization to show selected band
      updateVisualizationForSelectedBand();

      console.log(`🎨 Band selector: ${bandName}`);
    });
  });

  // Set initial active band
  const deltaBtn = document.querySelector(
    ".selector-btn[data-band='delta'].active",
  );
  if (deltaBtn) {
    selectorState.selectedBand = "delta";
  }
}

function updateVisualizationForSelectedBand() {
  // Trigger re-render of canvas visualizations
  // This is called whenever a band selector button is clicked
  updateFFTSpectrumCanvas();
  updateWaterfallCanvas();
}

function updateDSPSetting(setting, value) {
  // Debounce rapid updates (e.g., from slider)
  clearTimeout(dspUpdateTimeout);
  dspUpdateTimeout = setTimeout(() => {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(
        JSON.stringify({
          type: "update_dsp_setting",
          setting,
          value,
        }),
      );
    }
  }, 300); // Wait 300ms after last change before sending
}

function updateOSCStreamSetting(stream, enabled) {
  // Update OSC stream selection
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(
      JSON.stringify({
        type: "update_osc_stream",
        stream,
        enabled,
      }),
    );
  }
  // Update visual status
  updateStreamingStatusDisplay();
}

function updateStreamingStatusDisplay() {
  // Update the streaming status widget to show what's being sent
  const streams = state.settings.oscStreams || {};

  const streamMap = {
    rawEEG: "streamEEG",
    bandAbsolute: "streamBandAbs",
    bandRelative: "streamBandRel",
    motionAccel: "streamAccel",
    motionGyro: "streamGyro",
    motionPPG: "streamPPG",
  };

  Object.entries(streamMap).forEach(([streamKey, elementId]) => {
    const el = document.getElementById(elementId);
    if (el) {
      const isEnabled = streams[streamKey];
      const label = el.textContent.split(" ")[1]; // Get label after ✓/✗
      el.textContent = isEnabled ? "✓ " + label : "✗ " + label;
      el.style.color = isEnabled ? "#00ff88" : "#666";
      el.style.fontWeight = isEnabled ? "bold" : "normal";
    }
  });

  // Update output rate and scaling
  if (state.settings.outputRateHz) {
    const rateEl = document.getElementById("streamOutputRate");
    if (rateEl) {
      rateEl.textContent = `${state.settings.outputRateHz} Hz`;
    }
  }

  if (state.settings.scalingMode) {
    const scalingEl = document.getElementById("streamScaling");
    if (scalingEl) {
      const modeDisplay = {
        raw: "Raw (No scaling)",
        "0-1": "0-1 (OpenBCI)",
        "0-3": "0-3 (Mind Monitor)",
        zscore: "Z-Score",
      };
      scalingEl.textContent =
        modeDisplay[state.settings.scalingMode] || state.settings.scalingMode;
    }
  }
}

// ============================================================================
// Display Options
// ============================================================================

function updateChartSize(size) {
  document.querySelectorAll(".chart-container").forEach((chart) => {
    chart.classList.remove("compact", "large");
    if (size === "compact") {
      chart.classList.add("compact");
    } else if (size === "large") {
      chart.classList.add("large");
    }
  });
  // Trigger chart updates
  state.charts.forEach((chart) => {
    if (chart) chart.resize();
  });
  if (state.fftChart) state.fftChart.resize();
}

function toggleChannelDisplay(channelIdx, visible) {
  const chartId = `chart${channelIdx + 1}`;
  const chart = document.getElementById(chartId)?.parentElement;
  if (chart) {
    chart.style.display = visible ? "block" : "none";
  }
}

// ============================================================================
// Preset System
// ============================================================================

const PRESETS = {
  relaxed: {
    applyNotch: true,
    applyBandpass: true,
    smoothingAmount: 15,
    scaling: "0-1",
    artifactThreshold: 150,
    outputRateHz: 256,
    scalingMode: "0-1",
    dsp: {
      processor: "ema",
      params: { a: 0.15 },
    },
  },
  focused: {
    applyNotch: true,
    applyBandpass: true,
    smoothingAmount: 8,
    scaling: "0-1",
    artifactThreshold: 80,
    outputRateHz: 256,
    scalingMode: "0-1",
    dsp: {
      processor: "savgol",
      params: { win: 7 },
    },
  },
  sleep: {
    applyNotch: true,
    applyBandpass: true,
    smoothingAmount: 20,
    scaling: "0-1",
    artifactThreshold: 120,
    outputRateHz: 256,
    scalingMode: "0-1",
    dsp: {
      processor: "ema",
      params: { a: 0.25 },
    },
  },
  clean: {
    applyNotch: true,
    applyBandpass: true,
    smoothingAmount: 5,
    scaling: "0-1",
    artifactThreshold: 50,
    outputRateHz: 256,
    scalingMode: "0-1",
    dsp: {
      processor: "median",
      params: { win: 5 },
    },
  },
  mindMonitor: {
    applyNotch: true,
    applyBandpass: true,
    smoothingAmount: 12,
    scaling: "0-3",
    artifactThreshold: 100,
    outputRateHz: 256,
    scalingMode: "0-3",
    dsp: {
      processor: "notch",
      params: { nf: 60 },
    },
  },
  rawPassThrough: {
    applyNotch: false,
    applyBandpass: false,
    smoothingAmount: 0,
    scaling: "raw",
    artifactThreshold: 500,
    outputRateHz: 256,
    scalingMode: "raw",
    dsp: {
      processor: "none",
      params: {},
    },
  },
  deltaSuppress: {
    applyNotch: true,
    applyBandpass: false,
    smoothingAmount: 0,
    scaling: "0-1",
    artifactThreshold: 100,
    outputRateHz: 256,
    scalingMode: "0-1",
    dsp: {
      processor: "deltafilt",
      params: {},
    },
  },
  artifactRejection: {
    applyNotch: true,
    applyBandpass: true,
    smoothingAmount: 10,
    scaling: "0-1",
    artifactThreshold: 50,
    outputRateHz: 256,
    scalingMode: "0-1",
    dsp: {
      processor: "artifact",
      params: { gt: 30 },
    },
  },
};

function applyPreset(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) return;

  // Track that we're applying a preset (not user edit)
  lastSliderUpdate["preset_apply"] = Date.now();

  // Update UI controls
  document.getElementById("smoothingSlider").value = preset.smoothingAmount;
  document.getElementById("smoothingValue").textContent =
    preset.smoothingAmount;
  document.getElementById("notchFilter").checked = preset.applyNotch;
  document.getElementById("bandpassFilter").checked = preset.applyBandpass;
  document.getElementById("scalingMode").value =
    preset.scalingMode || preset.scaling;
  document.getElementById("artifactSlider").value = preset.artifactThreshold;
  document.getElementById("artifactValue").textContent =
    preset.artifactThreshold;
  if (document.getElementById("outputRateHz")) {
    document.getElementById("outputRateHz").value = preset.outputRateHz;
  }

  // Apply DSP settings from preset
  if (preset.dsp) {
    selectDSPProcessor(preset.dsp.processor);
    if (preset.dsp.params) {
      Object.assign(dspConfig.params, preset.dsp.params);
      renderDSPParams(preset.dsp.processor);
    }
  }

  // Apply to backend
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(
      JSON.stringify({
        type: "update_dsp_setting",
        setting: "all",
        value: preset,
      }),
    );
  }

  console.log(`📋 Preset applied: ${presetName}`, preset.dsp);
}

function showPresetDSPInfo(presetName) {
  const preset = PRESETS[presetName];
  if (!preset || !preset.dsp) return;

  const info = document.getElementById("presetDSPInfo");
  const nameEl = document.getElementById("presetDSPName");
  const paramsEl = document.getElementById("presetDSPParams");

  if (!info || !nameEl || !paramsEl) return;

  const proc = DSP_CATALOG[preset.dsp.processor];
  if (!proc) return;

  nameEl.textContent = `🔧 ${proc.name}`;

  let paramsHtml = "";
  if (preset.dsp.params && Object.keys(preset.dsp.params).length > 0) {
    paramsHtml = Object.entries(preset.dsp.params)
      .map(([key, val]) => {
        const labels = {
          a: "Alpha",
          nf: "Freq",
          gt: "Threshold",
          th: "Threshold",
          hi: "High",
          lo: "Low",
          win: "Window",
          slew: "Slew",
          clip: "Clip",
        };
        return `${labels[key] || key}: <strong>${val}</strong>`;
      })
      .join(" • ");
  }
  paramsEl.innerHTML = paramsHtml || "(no parameters)";
  info.style.display = "block";
}

function saveCurrentPreset() {
  const name = prompt("Enter preset name:");
  if (!name) return;

  const preset = {
    applyNotch: document.getElementById("notchFilter").checked,
    applyBandpass: document.getElementById("bandpassFilter").checked,
    smoothingAmount: parseInt(document.getElementById("smoothingSlider").value),
    scaling: document.getElementById("scalingMode").value,
    scalingMode: document.getElementById("scalingMode").value,
    artifactThreshold: parseInt(
      document.getElementById("artifactSlider").value,
    ),
    outputRateHz: parseInt(
      document.getElementById("outputRateHz").value || 256,
    ),
    dsp: {
      processor: dspConfig.currentProc,
      params: JSON.parse(JSON.stringify(dspConfig.params)),
    },
  };

  localStorage.setItem(`preset_${name}`, JSON.stringify(preset));
  PRESETS[name] = preset; // Also add to runtime PRESETS
  console.log(`💾 Preset saved: ${name}`, preset.dsp);
  alert(`✅ Preset "${name}" saved! (includes DSP: ${preset.dsp.processor})`);
}

// ============================================================================
// Performance Metrics
// ============================================================================

let lastPacketTime = Date.now();
let dspUpdateTimeout = null; // Debounce timer for DSP settings
let lastSliderUpdate = {}; // Track when each slider was last edited locally

function updatePerformanceMetrics() {
  const now = Date.now();
  const elapsed = (now - state.startTime) / 1000;
  const packetsPerSec = elapsed > 0 ? (state.packets / elapsed).toFixed(1) : 0;
  const latency = (now - lastPacketTime).toFixed(0);
  const fftReady =
    Object.keys(state.fftChart?.data?.datasets || {}).length > 0 ? "YES" : "NO";

  const packetsPerSecEl = document.getElementById("packetsPerSec");
  const latencyMsEl = document.getElementById("latencyMs");
  const fftReadyEl = document.getElementById("fftReady");

  if (packetsPerSecEl) packetsPerSecEl.textContent = packetsPerSec;
  if (latencyMsEl) latencyMsEl.textContent = latency + "ms";
  if (fftReadyEl) fftReadyEl.textContent = fftReady;
}

// ============================================================================
// Export Functions
// ============================================================================

function exportJSON() {
  const data = {
    timestamp: new Date().toISOString(),
    packets: state.packets,
    stats: state.eegData.map((ch, idx) => ({
      channel: idx,
      samples: ch.length,
      data: ch,
    })),
    settings: state.settings,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadFile(blob, `eeg-export-${Date.now()}.json`);
}

function exportCSV() {
  const headers = ["Timestamp", "Ch1", "Ch2", "Ch3", "Ch4"];
  const maxLen = Math.max(...state.eegData.map((ch) => ch.length));

  let csv = headers.join(",") + "\n";
  for (let i = 0; i < maxLen; i++) {
    const row = [i];
    state.eegData.forEach((ch) => {
      row.push(ch[i] ?? "");
    });
    csv += row.join(",") + "\n";
  }

  const blob = new Blob([csv], { type: "text/csv" });
  downloadFile(blob, `eeg-export-${Date.now()}.csv`);
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`📥 Exported: ${filename}`);
}

let initializedTabs = new Set();

// Brain State & Calibration
const brainState = {
  state: "Neutral",
  zscores: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  calibration: {
    isCalibrating: false,
    isLocked: false,
    progress: 0,
    samplesCollected: 0,
  },
};

const STATE_COLORS = {
  Aroused: { bg: "#ef444420", fg: "#ef4444", border: "#ef444040" },
  Focused: { bg: "#eab30820", fg: "#eab308", border: "#eab30840" },
  Relaxed: { bg: "#22c55e20", fg: "#22c55e", border: "#22c55e40" },
  Drowsy: { bg: "#3b82f620", fg: "#3b82f6", border: "#3b82f640" },
  Neutral: { bg: "#6b728020", fg: "#6b7280", border: "#6b728040" },
};

function updateBrainStateUI() {
  const label = document.getElementById("brainStateLabel");
  const status = document.getElementById("calibrationStatus");
  const progressFill = document.getElementById("calibrationProgressFill");
  const startBtn = document.getElementById("calibrationStartBtn");
  const stopBtn = document.getElementById("calibrationStopBtn");
  const resetBtn = document.getElementById("calibrationResetBtn");
  const zscoreBars = document.getElementById("zscoreBars");

  if (!label) return; // Tab not rendered yet

  // Update state label
  const state = brainState.state || "Neutral";
  const colors = STATE_COLORS[state] || STATE_COLORS.Neutral;
  label.textContent = state;
  label.style.background = colors.bg;
  label.style.color = colors.fg;
  label.style.borderColor = colors.border;

  // Update calibration status
  if (brainState.calibration.isCalibrating) {
    const progress = Math.round((brainState.calibration.progress || 0) * 100);
    status.textContent = `⏳ Calibrating... ${progress}%`;
    status.style.color = "#fbbf24";
    progressFill.style.width = progress + "%";
    progressFill.style.background = "#fbbf24";
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    resetBtn.style.display = "none";
  } else if (brainState.calibration.isLocked) {
    const samples = brainState.calibration.samplesCollected || 0;
    status.textContent = `✓ Calibrated (${samples} samples)`;
    status.style.color = "#22c55e";
    progressFill.style.width = "100%";
    progressFill.style.background = "#22c55e";
    startBtn.style.display = "none";
    stopBtn.style.display = "none";
    resetBtn.style.display = "block";
    zscoreBars.style.display = "block";
    updateZScoreBars();
  } else {
    status.textContent = "Not calibrated — start calibration";
    status.style.color = "#888";
    progressFill.style.width = "0%";
    progressFill.style.background = "#fbbf24";
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
    resetBtn.style.display = "none";
    zscoreBars.style.display = "none";
  }
}

function updateZScoreBars() {
  const bands = ["delta", "theta", "alpha", "beta", "gamma"];
  const colors = ["#6366f1", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444"];

  bands.forEach((band, i) => {
    const zval = brainState.zscores[band] || 0;
    const barH = Math.min(Math.abs(zval) * 15, 40);
    const bar = document.getElementById(`zscore-${band}`);
    const val = document.getElementById(`zscore-${band}-val`);

    if (bar) {
      bar.style.height = barH + "px";
      bar.style.background = colors[i] + "60";
      if (zval < 0) {
        bar.style.transform = `translateY(${barH}px)`;
      } else {
        bar.style.transform = "none";
      }
    }
    if (val) {
      val.textContent = zval.toFixed(1);
    }
  });
}

function calibrationStart() {
  console.log("🔄 Starting calibration (90 seconds)...");
  brainState.calibration.isCalibrating = true;
  brainState.calibration.progress = 0;
  brainState.calibration.samplesCollected = 0;
  updateBrainStateUI();

  // Send to server API
  fetch("/api/calibration/start", { method: "POST" }).catch((e) =>
    console.error("Calibration start error:", e),
  );

  // Poll calibration status every 500ms
  const statusInterval = setInterval(() => {
    fetch("/api/calibration/status")
      .then((r) => r.json())
      .then((data) => {
        brainState.calibration.isCalibrating = data.isCalibrating;
        brainState.calibration.progress = data.progress || 0;
        brainState.calibration.samplesCollected = data.samplesCollected || 0;
        updateBrainStateUI();

        // When done
        if (!data.isCalibrating && data.progress >= 1) {
          clearInterval(statusInterval);
          brainState.calibration.isLocked = true;
          brainState.zscores = data.zscores || {
            delta: 0,
            theta: 0,
            alpha: 0,
            beta: 0,
            gamma: 0,
          };
          console.log("✅ Calibration complete! Z-scores:", brainState.zscores);
          updateBrainStateUI();
        }
      })
      .catch((e) => console.error("Status polling error:", e));
  }, 500);
}

function calibrationStop() {
  console.log("⏹️ Stopping calibration...");
  brainState.calibration.isCalibrating = false;
  updateBrainStateUI();

  fetch("/api/calibration/stop", { method: "POST" })
    .then((r) => r.json())
    .then((data) => {
      console.log("Calibration stopped:", data);
      brainState.calibration.isLocked = true;
      updateBrainStateUI();
    })
    .catch((e) => console.error("Calibration stop error:", e));
}

function calibrationReset() {
  console.log("🔃 Resetting calibration...");
  brainState.calibration.isLocked = false;
  brainState.calibration.isCalibrating = false;
  brainState.calibration.progress = 0;
  brainState.calibration.samplesCollected = 0;
  brainState.zscores = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  updateBrainStateUI();

  fetch("/api/calibration/reset", { method: "POST" })
    .then((r) => r.json())
    .then(() => {
      console.log("Calibration reset complete");
      updateBrainStateUI();
    })
    .catch((e) => console.error("Calibration reset error:", e));
}

function updateBrainStateEstimate() {
  const rel = state.bandPowers.relative || {};
  const delta = rel.delta || 0;
  const theta = rel.theta || 0;
  const alpha = rel.alpha || 0;
  const beta = rel.beta || 0;
  const gamma = rel.gamma || 0;

  // Simple heuristic-based brain state classification
  // (Real implementation would use ML model with z-scores)
  let newState = "Neutral";

  if (beta > 0.4 && gamma > 0.2) {
    newState = "Aroused"; // High beta + gamma = arousal/stress
  } else if (alpha > 0.35 && beta < 0.25) {
    newState = "Relaxed"; // High alpha, low beta = relaxation
  } else if (beta > 0.3 && alpha > 0.25) {
    newState = "Focused"; // Balanced alpha + beta = focus
  } else if (theta > 0.3 && delta > 0.2) {
    newState = "Drowsy"; // High theta + delta = drowsiness
  }

  if (brainState.state !== newState) {
    brainState.state = newState;
  }

  // If calibrated, update z-scores based on band powers
  if (brainState.calibration.isLocked && false) {
    // TODO: Calculate z-scores using calibration baseline
    // For now, using placeholder calculation
  }
}

// ── DSP Processing Configuration ──
const dspConfig = {
  currentProc: "none",
  params: {
    a: 0.2, // Alpha (smoothing factor)
    nf: 60, // Notch frequency (50 or 60)
    gt: 20, // Gate threshold
    th: 30, // Threshold value
    hi: 40, // Hysteresis high
    lo: 20, // Hysteresis low
    win: 7, // Window size (savgol, median, gaussian, rms)
    slew: 0.5, // Slew rate
    clip: 0.8, // Clip threshold
  },
};

// OSC Device Definitions
const OSC_DEVICES = {
  muse2: {
    name: "Muse 2",
    channels: ["TP9", "AF7", "AF8", "TP10"],
    extras: [
      { id: "quality", label: "Quality", color: "#6366f1" },
      { id: "acc", label: "Accel", color: "#22c55e" },
      { id: "gyro", label: "Gyro", color: "#3b82f6" },
    ],
  },
  athena: {
    name: "Muse S/Athena",
    channels: ["TP9", "AF7", "AF8", "TP10"],
    extras: [
      { id: "quality", label: "Quality", color: "#6366f1" },
      { id: "ppg", label: "PPG/HR", color: "#ec4899" },
      { id: "fnirs", label: "fNIRS", color: "#f59e0b" },
      { id: "acc", label: "Accel", color: "#22c55e" },
      { id: "gyro", label: "Gyro", color: "#3b82f6" },
    ],
  },
  ganglion: {
    name: "OpenBCI Ganglion",
    channels: ["Ch1", "Ch2", "Ch3", "Ch4"],
    extras: [
      { id: "quality", label: "Quality", color: "#6366f1" },
      { id: "acc", label: "Accel", color: "#22c55e" },
      { id: "gyro", label: "Gyro", color: "#3b82f6" },
    ],
  },
  ultracortex: {
    name: "OpenBCI Ultracortex",
    channels: [
      "Fp1",
      "Fpz",
      "Fp2",
      "AF7",
      "AF3",
      "AFz",
      "AF4",
      "AF8",
      "F7",
      "F5",
      "F3",
      "F1",
      "Fz",
      "F2",
      "F4",
      "F6",
      "F8",
      "FT7",
      "FC5",
      "FC3",
      "FC1",
      "FCz",
      "FC2",
      "FC4",
      "FC6",
      "FT8",
      "T7",
      "C5",
      "C3",
      "C1",
      "Cz",
      "C2",
      "C4",
      "C6",
      "T8",
      "TP7",
      "CP5",
      "CP3",
      "CP1",
      "CPz",
      "CP2",
      "CP4",
      "CP6",
      "TP8",
      "P7",
      "P5",
      "P3",
      "P1",
      "Pz",
      "P2",
      "P4",
      "P6",
      "P8",
      "PO7",
      "PO3",
      "POz",
      "PO4",
      "PO8",
      "O1",
      "Oz",
      "O2",
    ].slice(0, 16), // First 16 from 10-20 system for standard config
    extras: [
      { id: "quality", label: "Quality", color: "#6366f1" },
      { id: "acc", label: "Accel", color: "#22c55e" },
      { id: "gyro", label: "Gyro", color: "#3b82f6" },
    ],
  },
};

// OSC Configuration
const oscConfig = {
  mode: "A", // Mode A (bands/array) or Mode B (scalar)
  device: "muse2", // Currently selected device
  port: 7400,
  rate: 20, // Hz
  smooth: 0.1, // 0-1 smoothing factor
  scale: 1.0, // 0.1-5 output scaling
  filtered: true, // Use filtered (DSP) or raw data
  selectedBands: ["Alpha", "Beta", "Theta"], // Bands to stream
  selectedChannels: ["TP9", "AF7", "AF8", "TP10"], // Initially Muse 2
  selectedExtras: ["quality"], // Extra features
  allBands: ["Delta", "Theta", "Alpha", "Beta", "Gamma"],
  get availableChannels() {
    return OSC_DEVICES[this.device]?.channels || [];
  },
  get availableExtras() {
    return OSC_DEVICES[this.device]?.extras || [];
  },
};

const DSP_CATALOG = {
  none: {
    name: "Bypass",
    desc: "No processing applied. Signal passes through unchanged.",
    params: [],
    cat: "Filter",
  },
  lp: {
    name: "Low Pass",
    desc: "Smooths high-frequency noise. Alpha controls cutoff (0.01–0.99).",
    params: ["alpha"],
    cat: "Filter",
  },
  hp: {
    name: "High Pass",
    desc: "Removes DC drift and slow baseline wander. Alpha controls cutoff.",
    params: ["alpha"],
    cat: "Filter",
  },
  notch: {
    name: "Notch 50/60",
    desc: "Removes mains hum (50Hz or 60Hz). Toggle between standard frequencies.",
    params: ["notchFreq"],
    cat: "Filter",
  },
  bp: {
    name: "Band Pass",
    desc: "Isolates a specific frequency band (e.g., Alpha 8–12Hz).",
    params: ["alpha"],
    cat: "Filter",
  },
  dc: {
    name: "DC Block",
    desc: "Blocks DC offset and very low frequencies (< 0.5Hz). Fixed tuning.",
    params: [],
    cat: "Filter",
  },
  deltafilt: {
    name: "Delta Suppress",
    desc: "Attenuates Delta band (0.5–4Hz) while preserving other frequencies.",
    params: [],
    cat: "Filter",
  },
  ema: {
    name: "EMA",
    desc: "Exponential Moving Average. Alpha controls smoothing (0.01–0.99).",
    params: ["alpha"],
    cat: "Smooth",
  },
  savgol: {
    name: "Savitzky-Golay",
    desc: "Polynomial smoothing with edge preservation. Window controls span (3–21).",
    params: ["window"],
    cat: "Smooth",
  },
  median: {
    name: "Median",
    desc: "Robust to outliers. Window size (odd, 3–21) determines filter width.",
    params: ["window"],
    cat: "Smooth",
  },
  kalman: {
    name: "Kalman",
    desc: "Adaptive optimal filtering. Self-tuning to signal dynamics.",
    params: [],
    cat: "Smooth",
  },
  rms: {
    name: "RMS Env",
    desc: "RMS envelope detector. Window extracts power envelope from raw signal.",
    params: ["window"],
    cat: "Smooth",
  },
  gauss: {
    name: "Gaussian",
    desc: "Gaussian blur filter. Window size (3–21) controls blur radius.",
    params: ["window"],
    cat: "Smooth",
  },
  gate: {
    name: "Noise Gate",
    desc: "Silences signal below threshold. Threshold (1–80) in amplitude units.",
    params: ["gateThreshold"],
    cat: "Gate",
  },
  thresh: {
    name: "Threshold",
    desc: "Hard thresholding. Values below threshold become zero.",
    params: ["threshold"],
    cat: "Gate",
  },
  hyst: {
    name: "Hysteresis",
    desc: "Comparator with hysteresis. High (10–100) > Low (1–80) prevents chatter.",
    params: ["hystHigh", "hystLow"],
    cat: "Gate",
  },
  peak: {
    name: "Peak Detect",
    desc: "Extracts peak envelope. Asymmetric rise/fall times for transient capture.",
    params: [],
    cat: "Gate",
  },
  zerox: {
    name: "Zero-Cross",
    desc: "Zero-crossing detector. Triggers on rising and falling zero crossings.",
    params: [],
    cat: "Gate",
  },
  artifact: {
    name: "Artifact Rej",
    desc: "Artifact rejection. Mutes bursts exceeding amplitude threshold.",
    params: ["gateThreshold"],
    cat: "Gate",
  },
  envf: {
    name: "Env Follow",
    desc: "Envelope follower. Tracks signal envelope with asymmetric rise/fall.",
    params: [],
    cat: "Shape",
  },
  slew: {
    name: "Slew Limit",
    desc: "Limits rate of change. Slew rate (V/s) prevents aliasing.",
    params: ["slewRate"],
    cat: "Shape",
  },
  clip: {
    name: "Soft Clip",
    desc: "Soft clipping with tanh saturation. Threshold controls onset.",
    params: ["clipThreshold"],
    cat: "Shape",
  },
  rect: {
    name: "Rectifier",
    desc: "Full-wave rectifier. Absolute value of input signal.",
    params: [],
    cat: "Shape",
  },
};

function initializeDSPButtons() {
  document.querySelectorAll(".dsp-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const procId = e.target.dataset.proc;
      selectDSPProcessor(procId);
    });
  });
}

function selectDSPProcessor(procId) {
  dspConfig.currentProc = procId;
  const proc = DSP_CATALOG[procId];

  // Update active processor display
  const nameEl = document.getElementById("activeProcName");
  const descEl = document.getElementById("activeProcDesc");
  if (nameEl) nameEl.textContent = proc.name;
  if (descEl) descEl.textContent = proc.desc;

  // Update button states
  document.querySelectorAll(".dsp-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.proc === procId);
    btn.style.borderColor =
      btn.dataset.proc === procId ? "#6366f1" : "var(--border)";
    btn.style.background =
      btn.dataset.proc === procId ? "#6366f118" : "transparent";
    btn.style.color =
      btn.dataset.proc === procId ? "#6366f1" : "var(--text-primary)";
    btn.style.fontWeight = btn.dataset.proc === procId ? "600" : "400";
  });

  // Render parameter controls
  renderDSPParams(procId);

  // Send to server
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({ type: "dsp_select", processor: procId }));
  }
}

function renderDSPParams(procId) {
  const proc = DSP_CATALOG[procId];
  const filterParams = document.getElementById("filterParams");
  const smoothParams = document.getElementById("smoothParams");
  const gateParams = document.getElementById("gateParams");
  const shapeParams = document.getElementById("shapeParams");

  // Clear all
  [filterParams, smoothParams, gateParams, shapeParams].forEach((el) => {
    if (el) el.innerHTML = "";
  });

  // Determine target container
  let targetEl;
  if (proc.cat === "Filter") targetEl = filterParams;
  else if (proc.cat === "Smooth") targetEl = smoothParams;
  else if (proc.cat === "Gate") targetEl = gateParams;
  else if (proc.cat === "Shape") targetEl = shapeParams;

  if (!targetEl) return;

  // Render parameter controls based on type
  if (proc.params.includes("alpha")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="min-width: 50px; font-weight: 600;">Alpha:</label>
        <input type="range" min="0.01" max="0.99" step="0.01" value="${dspConfig.params.a}" 
               onchange="dspConfig.params.a = +this.value; updateDSPParam('alpha')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 30px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.a.toFixed(2)}</span>
      </div>
    `;
  }
  if (proc.params.includes("notchFreq")) {
    const freq = dspConfig.params.nf;
    targetEl.innerHTML += `
      <div style="display: flex; gap: 8px;">
        <button style="flex: 1; padding: 6px 8px; border: 1px solid ${freq === 50 ? "#6366f1" : "var(--border)"}; background: ${freq === 50 ? "#6366f118" : "transparent"}; border-radius: 4px; cursor: pointer;" 
                onclick="dspConfig.params.nf = 50; updateDSPParam('notchFreq')">50 Hz</button>
        <button style="flex: 1; padding: 6px 8px; border: 1px solid ${freq === 60 ? "#6366f1" : "var(--border)"}; background: ${freq === 60 ? "#6366f118" : "transparent"}; border-radius: 4px; cursor: pointer;" 
                onclick="dspConfig.params.nf = 60; updateDSPParam('notchFreq')">60 Hz</button>
      </div>
    `;
  }
  if (proc.params.includes("window")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="min-width: 50px; font-weight: 600;">Window:</label>
        <input type="range" min="3" max="21" step="2" value="${dspConfig.params.win}" 
               onchange="dspConfig.params.win = +this.value; updateDSPParam('window')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 30px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.win}</span>
      </div>
    `;
  }
  if (proc.params.includes("gateThreshold")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="min-width: 60px; font-weight: 600;">Threshold:</label>
        <input type="range" min="1" max="80" step="1" value="${dspConfig.params.gt}" 
               onchange="dspConfig.params.gt = +this.value; updateDSPParam('gateThreshold')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 30px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.gt}</span>
      </div>
    `;
  }
  if (proc.params.includes("threshold")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="min-width: 60px; font-weight: 600;">Threshold:</label>
        <input type="range" min="1" max="100" step="1" value="${dspConfig.params.th}" 
               onchange="dspConfig.params.th = +this.value; updateDSPParam('threshold')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 30px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.th}</span>
      </div>
    `;
  }
  if (proc.params.includes("hystHigh")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <label style="min-width: 60px; font-weight: 600;">High:</label>
        <input type="range" min="10" max="100" step="1" value="${dspConfig.params.hi}" 
               onchange="dspConfig.params.hi = +this.value; updateDSPParam('hystHigh')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 30px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.hi}</span>
      </div>
    `;
  }
  if (proc.params.includes("hystLow")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px;">
        <label style="min-width: 60px; font-weight: 600;">Low:</label>
        <input type="range" min="1" max="80" step="1" value="${dspConfig.params.lo}" 
               onchange="dspConfig.params.lo = +this.value; updateDSPParam('hystLow')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 30px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.lo}</span>
      </div>
    `;
  }
  if (proc.params.includes("slewRate")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="min-width: 60px; font-weight: 600;">Slew:</label>
        <input type="range" min="0.01" max="2" step="0.01" value="${dspConfig.params.slew}" 
               onchange="dspConfig.params.slew = +this.value; updateDSPParam('slewRate')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 40px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.slew.toFixed(2)} V/s</span>
      </div>
    `;
  }
  if (proc.params.includes("clipThreshold")) {
    targetEl.innerHTML += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="min-width: 60px; font-weight: 600;">Clip:</label>
        <input type="range" min="0.1" max="1" step="0.05" value="${dspConfig.params.clip}" 
               onchange="dspConfig.params.clip = +this.value; updateDSPParam('clipThreshold')"
               style="flex: 1; accent-color: #6366f1;">
        <span style="min-width: 40px; text-align: right; font-family: monospace; color: #6366f1;">${dspConfig.params.clip.toFixed(2)}</span>
      </div>
    `;
  }
}

function updateDSPParam(paramType) {
  // Send parameter update to server
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(
      JSON.stringify({
        type: "dsp_param",
        processor: dspConfig.currentProc,
        paramType: paramType,
        value: dspConfig.params,
      }),
    );
  }
}

// ── OSC Monitor ──
// ── OSC Band/Channel/Extras Selection ──
function initializeOSCSelectors() {
  renderBandSelector();
  renderChannelSelector();
  renderExtrasSelector();

  // Device selector event listener
  const deviceSelect = document.getElementById("oscDeviceSelect");
  if (deviceSelect) {
    deviceSelect.addEventListener("change", (e) => {
      const newDevice = e.target.value;
      oscConfig.device = newDevice;

      // Reset channels to device's default channels
      const deviceDef = OSC_DEVICES[newDevice];
      oscConfig.selectedChannels = [...deviceDef.channels];

      // Reset extras to device's available extras
      oscConfig.selectedExtras = []; // Start empty

      // Re-render selectors
      renderChannelSelector();
      renderExtrasSelector();
      updateOSCExamples();
      updateOSCMessages();
    });
  }
}

function renderBandSelector() {
  const container = document.getElementById("oscBandSelect");
  if (!container) return;

  container.innerHTML = oscConfig.allBands
    .map((band, idx) => {
      const colors = ["#6366f1", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444"];
      const isSelected = oscConfig.selectedBands.includes(band);
      const color = colors[idx];

      return `
      <button class="osc-selector-btn" data-band="${band}" 
              style="padding: 6px 12px; border-radius: 6px; border: 2px solid ${isSelected ? color : "var(--border)"}; 
                     background: ${isSelected ? color + "20" : "transparent"}; color: ${isSelected ? color : "var(--text-primary)"}; 
                     font-weight: ${isSelected ? "600" : "400"}; cursor: pointer; font-size: 0.85rem;">
        ${band}
      </button>
    `;
    })
    .join("");

  // Add event listeners
  document.querySelectorAll(".osc-selector-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const band = e.target.dataset.band;
      const idx = oscConfig.selectedBands.indexOf(band);
      if (idx >= 0) {
        oscConfig.selectedBands.splice(idx, 1);
      } else {
        oscConfig.selectedBands.push(band);
      }
      renderBandSelector();
      updateOSCMessages();
    });
  });
}

function renderChannelSelector() {
  const container = document.getElementById("oscChannelSelect");
  if (!container) return;

  container.innerHTML = oscConfig.availableChannels
    .map((ch) => {
      const isSelected = oscConfig.selectedChannels.includes(ch);

      return `
      <button class="osc-channel-btn" data-channel="${ch}" 
              style="padding: 6px 12px; border-radius: 6px; border: 2px solid ${isSelected ? "#3b82f6" : "var(--border)"}; 
                     background: ${isSelected ? "#3b82f620" : "transparent"}; color: ${isSelected ? "#3b82f6" : "var(--text-primary)"}; 
                     font-weight: ${isSelected ? "600" : "400"}; cursor: pointer; font-size: 0.85rem; font-family: monospace;">
        ${ch}
      </button>
    `;
    })
    .join("");

  // Add event listeners
  document.querySelectorAll(".osc-channel-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const channel = e.target.dataset.channel;
      const idx = oscConfig.selectedChannels.indexOf(channel);
      if (idx >= 0) {
        oscConfig.selectedChannels.splice(idx, 1);
      } else {
        oscConfig.selectedChannels.push(channel);
      }
      renderChannelSelector();
      updateOSCMessages();
    });
  });
}

function renderExtrasSelector() {
  const container = document.getElementById("oscExtrasSelect");
  if (!container) return;

  container.innerHTML = oscConfig.availableExtras
    .map((extra) => {
      const isSelected = oscConfig.selectedExtras.includes(extra.id);

      return `
      <button class="osc-extras-btn" data-extra="${extra.id}" 
              style="padding: 6px 12px; border-radius: 6px; border: 2px solid ${isSelected ? extra.color : "var(--border)"}; 
                     background: ${isSelected ? extra.color + "20" : "transparent"}; color: ${isSelected ? extra.color : "var(--text-primary)"}; 
                     font-weight: ${isSelected ? "600" : "400"}; cursor: pointer; font-size: 0.85rem;">
        ${extra.label}
      </button>
    `;
    })
    .join("");

  // Add event listeners
  document.querySelectorAll(".osc-extras-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const extra = e.target.dataset.extra;
      const idx = oscConfig.selectedExtras.indexOf(extra);
      if (idx >= 0) {
        oscConfig.selectedExtras.splice(idx, 1);
      } else {
        oscConfig.selectedExtras.push(extra);
      }
      renderExtrasSelector();
      updateOSCMessages();
    });
  });
}

function setOSCMode(mode) {
  oscConfig.mode = mode;

  // Update button states
  document.getElementById("oscModeA").style.borderColor =
    mode === "A" ? "#6366f1" : "var(--border)";
  document.getElementById("oscModeA").style.background =
    mode === "A" ? "#6366f120" : "transparent";
  document.getElementById("oscModeA").style.color =
    mode === "A" ? "#6366f1" : "var(--text-primary)";

  document.getElementById("oscModeB").style.borderColor =
    mode === "B" ? "#eab308" : "var(--border)";
  document.getElementById("oscModeB").style.background =
    mode === "B" ? "#eab30820" : "transparent";
  document.getElementById("oscModeB").style.color =
    mode === "B" ? "#eab308" : "var(--text-primary)";

  // Update info boxes
  document.getElementById("modeInfoA").style.display =
    mode === "A" ? "block" : "none";
  document.getElementById("modeInfoB").style.display =
    mode === "B" ? "block" : "none";

  // Update example code
  updateOSCExamples();

  // Update message display
  updateOSCMessages();
}

function updateOSCExamples() {
  const codeEl = document.getElementById("exampleCode");
  if (!codeEl) return; // React UI doesn't have this element
  let code = "";

  if (oscConfig.mode === "A") {
    code = `# Mode A: Csound-compatible band arrays
# One message per band with all channels

# Alpha band (4 floats, one per channel)
/muse/bands/alpha_absolute f f f f
  0.234 0.456 0.345 0.567

# Beta band
/muse/bands/beta_absolute f f f f
  0.123 0.234 0.145 0.267

# Csound OSC Listen Example:
; in your .csd file:
OSClisten giSock, "localhost", 7400, "/muse/bands/alpha_absolute", fAlphaTP9, fAlphaAF7, fAlphaAF8, fAlphaTP10

# Max/MSP Example:
; use [udpreceive 7400] with [OSC-route] to parse`;
  } else {
    code = `# Mode B: Max/MSP-compatible scalar messages
# Individual message per electrode per band

# One value per message (per electrode per band)
/eeg/AF7/alpha f
  0.234

/eeg/AF8/beta f
  0.145

/eeg/TP9/theta f
  0.456

# Max/MSP Example:
[udpreceive 7400]
  |
[OSC-route /eeg/AF7/alpha]
  |
[r alpha_af7]  <- route to parameter

# TouchDesigner Example:
# Use CHOP oscin node, port 7400
# /eeg/{electrode}/{band} → CHOP channels`;
  }

  codeEl.textContent = code;
}

function updateOSCMessages() {
  const list = document.getElementById("oscMessageList");
  const count = document.getElementById("oscMessageCount");
  if (!list || !count) return; // React UI doesn't have these elements
  let rel = state.bandPowers.relative || {};

  // Apply scale if needed
  if (oscConfig.filtered) {
    rel = Object.keys(rel).reduce((acc, key) => {
      acc[key] = (rel[key] || 0) * oscConfig.scale;
      return acc;
    }, {});
  }

  let messages = [];

  if (oscConfig.mode === "A") {
    // Mode A: one message per selected band (array of selected channels)
    oscConfig.selectedBands.forEach((band) => {
      const val = rel[band.toLowerCase()] || 0;
      const chCount = oscConfig.selectedChannels.length;
      const vals = Array(chCount)
        .fill(val)
        .map((v, i) => (v * (0.8 + i * 0.08) * oscConfig.scale).toFixed(3))
        .join(" ");

      const typeStr = "f ".repeat(chCount).trim();
      messages.push({
        addr: `/muse/bands/${band.toLowerCase()}_absolute`,
        type: typeStr,
        vals: vals,
        mode: "A",
        note: `${chCount} channels`,
      });
    });

    // Add extras if selected
    if (oscConfig.selectedExtras.includes("quality")) {
      messages.push({
        addr: `/eeg/quality`,
        type: `f f f f`,
        vals: `0.85 0.92 0.78 0.88`,
        mode: "A",
        note: "Quality per channel",
      });
    }
  } else {
    // Mode B: one message per selected electrode per selected band
    oscConfig.selectedChannels.forEach((ch) => {
      oscConfig.selectedBands.forEach((band) => {
        const baseVal =
          (rel[band.toLowerCase()] || 0) * (0.8 + Math.random() * 0.4);
        const val = oscConfig.filtered ? baseVal : baseVal / oscConfig.scale;
        messages.push({
          addr: `/eeg/${ch}/${band.toLowerCase()}`,
          type: `f`,
          vals: val.toFixed(3),
          mode: "B",
        });
      });

      // Add extras for this channel if selected
      if (oscConfig.selectedExtras.includes("quality")) {
        messages.push({
          addr: `/eeg/${ch}/quality`,
          type: `f`,
          vals: (0.75 + Math.random() * 0.25).toFixed(2),
          mode: "B",
        });
      }
    });
  }

  count.textContent = messages.length;

  if (messages.length === 0) {
    list.innerHTML =
      '<div style="color: var(--text-secondary); padding: 8px; text-align: center;">Select at least one band and channel</div>';
    return;
  }

  let html = messages
    .slice(0, 25)
    .map((m, i) => {
      const modeColor = m.mode === "A" ? "#6366f1" : "#eab308";
      return `<div style="display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border); align-items: baseline; font-size: 0.8rem;">
      <span style="width: 14px; color: ${modeColor}; font-weight: 600;">${m.mode}</span>
      <span style="color: #6366f1; min-width: 200px; flex: 0 0 auto; font-family: monospace;">${m.addr}</span>
      <span style="color: var(--text-secondary); min-width: 35px; flex: 0 0 auto;">${m.type}</span>
      <span style="color: #eab308; font-weight: 500;">${m.vals}</span>
      ${m.note ? `<span style="color: var(--text-secondary); font-size: 0.7rem;">(${m.note})</span>` : ""}
    </div>`;
    })
    .join("");

  list.innerHTML = html;
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.remove("active");
  });
  document.getElementById(tabName).classList.add("active");

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");

  // Initialize charts lazily when tab becomes visible
  if (!initializedTabs.has(tabName)) {
    initializedTabs.add(tabName);
    if (tabName === "motion") {
      console.log("💨 Initializing Motion charts now that tab is visible");
      initMotionCharts();
    }
  }

  // Start canvas animation loops for NeuroVis displays
  if (nvState._animFrame) cancelAnimationFrame(nvState._animFrame);
  const canvasTabs = [
    "fftSpectrum",
    "waterfall",
    "phase",
    "ppgHR",
    "quad",
    "motion",
  ];
  if (canvasTabs.includes(tabName)) {
    nvState._activeTab = tabName;
    function nvLoop() {
      if (nvState._activeTab === tabName) {
        if (tabName === "fftSpectrum") updateFFTSpectrumCanvas();
        if (tabName === "waterfall") updateWaterfallCanvas();
        if (tabName === "phase") updatePhaseCanvas();
        if (tabName === "ppgHR") updatePPGHRCanvas();
        if (tabName === "quad") updateQuadViewPanels();
        if (tabName === "motion") {
          updateAccelCanvas();
          updateGyroCanvas();
        }
        nvState._animFrame = requestAnimationFrame(nvLoop);
      }
    }
    nvLoop();
  } else {
    nvState._activeTab = null;
  }
}

function updateSettingsUI() {
  // Update sidebar controls with settings from server
  // BUT: Don't update sliders that were edited very recently (within 500ms)

  // React UI doesn't have these elements - skip
  const smoothingSlider = document.getElementById("smoothingSlider");
  if (!smoothingSlider) return;

  const now = Date.now();

  if (state.settings.smoothingAmount !== undefined) {
    const lastEdit = lastSliderUpdate["smoothingAmount"] || 0;
    if (now - lastEdit > 500) {
      // Only update if it's been >500ms since last edit
      smoothingSlider.value = state.settings.smoothingAmount;
      const display =
        state.settings.smoothingAmount === 0
          ? "OFF"
          : state.settings.smoothingAmount;
      const smoothingValue = document.getElementById("smoothingValue");
      if (smoothingValue) {
        smoothingValue.textContent = display;
      }
    }
  }

  // Restore scaling mode (trust server if we haven't edited recently)
  const scalingValue = state.settings.scalingMode || state.settings.scaling;
  if (scalingValue) {
    const lastEdit = lastSliderUpdate["scalingMode"] || 0;
    const scalingMode = document.getElementById("scalingMode");
    if (scalingMode) {
      const currentValue = scalingMode.value;
      // Update only if: user hasn't edited in 500ms, OR server value differs from current
      if (now - lastEdit > 500 || currentValue !== scalingValue.toString()) {
        scalingMode.value = scalingValue;
      }
    }
  }

  // Restore output rate (trust server if we haven't edited recently)
  if (state.settings.outputRateHz) {
    const lastEdit = lastSliderUpdate["outputRateHz"] || 0;
    const outputRateSelect = document.getElementById("outputRateHz");
    if (outputRateSelect) {
      const currentValue = outputRateSelect.value;
      const newValue = state.settings.outputRateHz.toString();
      // Update only if: user hasn't edited in 500ms, OR server value differs from current
      if (now - lastEdit > 500 || currentValue !== newValue) {
        outputRateSelect.value = newValue;
      }
    }
  }

  // Update checkboxes only if user hasn't changed them recently (1000ms debounce)
  if (state.settings.applyNotch !== undefined) {
    const lastEdit = lastSliderUpdate["applyNotch"] || 0;
    const notchFilter = document.getElementById("notchFilter");
    if (notchFilter) {
      const currentValue = notchFilter.checked;
      const newValue = state.settings.applyNotch;
      // Only update if: >1000ms since edit AND value actually changed
      if (now - lastEdit > 1000 && currentValue !== newValue) {
        notchFilter.checked = newValue;
        const notchStatus = document.getElementById("notchStatus");
        if (notchStatus) {
          notchStatus.textContent = newValue ? "ON" : "OFF";
        }
      }
    }
  }

  if (state.settings.applyBandpass !== undefined) {
    const lastEdit = lastSliderUpdate["applyBandpass"] || 0;
    const bandpassFilter = document.getElementById("bandpassFilter");
    if (bandpassFilter) {
      const currentValue = bandpassFilter.checked;
      const newValue = state.settings.applyBandpass;
      // Only update if: >1000ms since edit AND value actually changed
      if (now - lastEdit > 1000 && currentValue !== newValue) {
        bandpassFilter.checked = newValue;
        const bandpassStatus = document.getElementById("bandpassStatus");
        if (bandpassStatus) {
          bandpassStatus.textContent = newValue ? "ON" : "OFF";
        }
      }
    }
  }

  // Restore OSC stream selections
  if (state.settings.oscStreams) {
    if (document.getElementById("oscStreamRawEEG")) {
      document.getElementById("oscStreamRawEEG").checked =
        state.settings.oscStreams.rawEEG;
    }
    if (document.getElementById("oscStreamBandAbsolute")) {
      document.getElementById("oscStreamBandAbsolute").checked =
        state.settings.oscStreams.bandAbsolute;
    }
    if (document.getElementById("oscStreamBandRelative")) {
      document.getElementById("oscStreamBandRelative").checked =
        state.settings.oscStreams.bandRelative;
    }
  }

  if (state.settings.artifactThreshold) {
    const lastEdit = lastSliderUpdate["artifactThreshold"] || 0;
    if (now - lastEdit > 500) {
      // Only update if it's been >500ms since last edit
      const artifactSlider = document.getElementById("artifactSlider");
      const artifactValue = document.getElementById("artifactValue");
      if (artifactSlider) {
        artifactSlider.value = state.settings.artifactThreshold;
      }
      if (artifactValue) {
        artifactValue.textContent = state.settings.artifactThreshold;
      }
    }
  }

  if (state.settings.simulatorMode !== undefined) {
    const lastEdit = lastSliderUpdate["simulatorMode"] || 0;
    if (now - lastEdit > 500) {
      const simulatorToggle = document.getElementById("simulatorToggle");
      if (simulatorToggle) {
        simulatorToggle.checked = state.settings.simulatorMode;
      }
    }
  }
}

// ============================================================================
// Device & Packet Indicator
// ============================================================================

function updateDeviceIndicator() {
  const deviceStatus = document.getElementById("deviceStatus");
  if (!deviceStatus) return;

  if (state.selectedDeviceName) {
    deviceStatus.classList.add("active");
    deviceStatus.innerHTML = `<span class="dot pulse"></span><span>${state.selectedDeviceName}</span>`;
  } else {
    deviceStatus.classList.remove("active");
    deviceStatus.innerHTML = `<span class="dot"></span><span>Device</span>`;
  }
}

function updateDataSourceIndicator() {
  const simStatus = document.getElementById("simulatorStatus");
  if (!simStatus) return;

  const isSimulator = state.settings && state.settings.simulatorMode;
  const label = document.getElementById("simLabel");

  if (isSimulator) {
    simStatus.classList.remove("active");
    simStatus.innerHTML = `<span class="dot" style="background: #ff6b6b;"></span><span style="color: #ff6b6b;">SIMULATOR</span>`;
    if (label) label.textContent = "Simulator";
  } else {
    simStatus.classList.add("active");
    simStatus.innerHTML = `<span class="dot pulse" style="background: #00ff88;"></span><span style="color: #00ff88;">🔴 LIVE DATA</span>`;
    if (label) label.textContent = "🔴 LIVE";
  }
}

function trackPacket() {
  state.packets++;
  state.lastPacketTime = Date.now();

  // Update packet pulse every 100ms
  if (state.packets % 10 === 0) {
    const deviceStatus = document.getElementById("deviceStatus");
    if (deviceStatus && deviceStatus.classList.contains("active")) {
      deviceStatus.style.boxShadow = "0 0 8px #00ff88";
      setTimeout(() => {
        if (deviceStatus) deviceStatus.style.boxShadow = "none";
      }, 100);
    }
  }
}

// ============================================================================
// Recording
// ============================================================================

function toggleRecording() {
  const btn = document.getElementById("recordBtn");

  if (!state.recording) {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: "start_recording" }));
      state.recording = true;
      btn.textContent = "Stop Recording";
      btn.classList.add("danger");
      document.getElementById("recordStatus").textContent = "Recording...";
    }
  } else {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: "stop_recording" }));
    }
    state.recording = false;
    btn.textContent = "Start Recording";
    btn.classList.remove("danger");
    document.getElementById("recordStatus").textContent = "Ready to download";
    document.getElementById("downloadBtn").disabled = false;
  }
}

function downloadRecording() {
  const link = document.createElement("a");
  link.href = "/api/recording/download";
  link.download = `eeg-${Date.now()}.csv`;
  link.click();
}

// ============================================================================
// Instrument Management
// ============================================================================

async function initializeInstrumentSelector() {
  try {
    // Load available instruments
    const response = await fetch("/api/instruments");
    const data = await response.json();

    const selector = document.getElementById("instrumentSelector");
    const launchBtn = document.getElementById("instrumentLaunchBtn");
    const stopBtn = document.getElementById("instrumentStopBtn");

    // Populate dropdown
    data.instruments.forEach((inst) => {
      const option = document.createElement("option");
      option.value = inst.id;
      option.textContent = inst.name;
      selector.appendChild(option);
    });

    // Update UI based on current status
    updateInstrumentStatus(data);

    // Event listeners
    selector.addEventListener("change", () => {
      launchBtn.disabled = !selector.value;
    });

    launchBtn.addEventListener("click", () => {
      const instId = selector.value;
      if (instId) {
        const launchMode = document.getElementById("launchMode").value;
        launchInstrument(instId, launchMode);
      }
    });

    stopBtn.addEventListener("click", () => {
      stopInstrument();
    });
  } catch (err) {
    console.error("Failed to load instruments:", err);
  }
}

async function launchInstrument(instId, mode = "headless") {
  try {
    const response = await fetch("/api/instruments/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: instId, mode: mode }),
    });

    const data = await response.json();
    if (data.success) {
      updateInstrumentUI(instId, true, mode);
      if (mode === "csoundqt") {
        alert(
          "✏️ CsoundQt opened — edit and run the instrument there.\nServer continues streaming OSC.",
        );
      }
    } else {
      alert(`Failed to launch: ${data.error}`);
    }
  } catch (err) {
    console.error("Launch failed:", err);
    alert("Failed to launch instrument");
  }
}

async function stopInstrument() {
  try {
    await fetch("/api/instruments/stop", { method: "POST" });
    updateInstrumentUI(null, false);
  } catch (err) {
    console.error("Stop failed:", err);
  }
}

function updateInstrumentStatus(data) {
  const statusEl = document.getElementById("instrumentStatusText");
  const launchBtn = document.getElementById("instrumentLaunchBtn");
  const stopBtn = document.getElementById("instrumentStopBtn");

  if (data.running && data.current) {
    const currentName =
      data.instruments.find((i) => i.id === data.current)?.name || data.current;
    statusEl.textContent = `🎵 Running: ${currentName}`;
    statusEl.parentElement.style.backgroundColor = "rgba(0, 255, 136, 0.1)";
    launchBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusEl.textContent = "No instrument running";
    statusEl.parentElement.style.backgroundColor = "var(--bg-primary)";
    launchBtn.disabled = true;
    stopBtn.disabled = true;
  }
}

function updateInstrumentUI(instId, running, mode = "headless") {
  const statusEl = document.getElementById("instrumentStatusText");
  const selector = document.getElementById("instrumentSelector");
  const launchBtn = document.getElementById("instrumentLaunchBtn");
  const stopBtn = document.getElementById("instrumentStopBtn");

  if (running && instId) {
    const option = Array.from(selector.options).find((o) => o.value === instId);
    const name = option ? option.textContent : instId;

    if (mode === "csoundqt_editing") {
      statusEl.textContent = `✏️ Editing in CsoundQt: ${name}`;
      statusEl.parentElement.style.backgroundColor = "rgba(100, 150, 255, 0.1)";
    } else {
      statusEl.textContent = `🎵 Running (Headless): ${name}`;
      statusEl.parentElement.style.backgroundColor = "rgba(0, 255, 136, 0.1)";
    }

    launchBtn.disabled = true;
    stopBtn.disabled = false;
  } else if (instId && !running && mode === "csoundqt_editing") {
    // CsoundQt mode without running headless
    const option = Array.from(selector.options).find((o) => o.value === instId);
    const name = option ? option.textContent : instId;
    statusEl.textContent = `✏️ Editing in CsoundQt: ${name}`;
    statusEl.parentElement.style.backgroundColor = "rgba(100, 150, 255, 0.1)";
    launchBtn.disabled = false;
    stopBtn.disabled = false;
  } else {
    statusEl.textContent = "No instrument running";
    statusEl.parentElement.style.backgroundColor = "var(--bg-primary)";
    launchBtn.disabled = true;
    stopBtn.disabled = true;
    selector.value = "";
  }
}

// ============================================================================
// Biofeedback System
// ============================================================================

function initializeBiofeedback() {
  // Threshold sliders
  const alphaSlider = document.getElementById("alphaThreshold");
  const betaSlider = document.getElementById("betaThreshold");
  const deltaSlider = document.getElementById("deltaThreshold");
  const soundsToggle = document.getElementById("alertSoundsToggle");

  if (alphaSlider) {
    alphaSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.biofeedback.alphaThreshold = val;
      document.getElementById("alphaThresholdValue").textContent =
        val.toFixed(2);
    });
  }

  if (betaSlider) {
    betaSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.biofeedback.betaThreshold = val;
      document.getElementById("betaThresholdValue").textContent =
        val.toFixed(2);
    });
  }

  if (deltaSlider) {
    deltaSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.biofeedback.deltaThreshold = val;
      document.getElementById("deltaThresholdValue").textContent =
        val.toFixed(2);
    });
  }

  if (soundsToggle) {
    soundsToggle.addEventListener("change", (e) => {
      state.biofeedback.alertSounds = e.target.checked;
    });
  }
}

function checkBiofeedbackAlerts(bandPowers) {
  if (!bandPowers || !bandPowers.relative) return;

  const rel = bandPowers.relative;
  const alerts = state.biofeedback.activeAlerts;

  // Check Alpha (relaxation)
  const alphaAlert = rel.alpha && rel.alpha >= state.biofeedback.alphaThreshold;
  if (alphaAlert && !alerts.alpha) {
    triggerAlert(
      "alpha",
      "Relaxation Detected! Alpha ≥ " +
        state.biofeedback.alphaThreshold.toFixed(2),
    );
    alerts.alpha = true;
  } else if (!alphaAlert && alerts.alpha) {
    clearAlert("alpha");
    alerts.alpha = false;
  }

  // Check Beta (focus)
  const betaAlert = rel.beta && rel.beta >= state.biofeedback.betaThreshold;
  if (betaAlert && !alerts.beta) {
    triggerAlert(
      "beta",
      "Focus Detected! Beta ≥ " + state.biofeedback.betaThreshold.toFixed(2),
    );
    alerts.beta = true;
  } else if (!betaAlert && alerts.beta) {
    clearAlert("beta");
    alerts.beta = false;
  }

  // Check Delta (fatigue)
  const deltaAlert = rel.delta && rel.delta >= state.biofeedback.deltaThreshold;
  if (deltaAlert && !alerts.delta) {
    triggerAlert(
      "delta",
      "Fatigue Detected! Delta ≥ " +
        state.biofeedback.deltaThreshold.toFixed(2),
    );
    alerts.delta = true;
  } else if (!deltaAlert && alerts.delta) {
    clearAlert("delta");
    alerts.delta = false;
  }
}

function triggerAlert(type, message) {
  console.log(`🚨 ${type.toUpperCase()} ALERT: ${message}`);

  const statusEl = document.getElementById(`${type}AlertStatus`);
  if (statusEl) {
    statusEl.textContent = `🚨 ACTIVE: ${message}`;
    statusEl.style.color = "#ffaa00";
    statusEl.style.fontWeight = "bold";
  }

  // Play alert sound
  if (state.biofeedback.alertSounds) {
    playAlertSound(type);
  }
}

function clearAlert(type) {
  const statusEl = document.getElementById(`${type}AlertStatus`);
  if (statusEl) {
    statusEl.textContent = "—";
    statusEl.style.color = "#aaa";
    statusEl.style.fontWeight = "normal";
  }
}

function playAlertSound(type) {
  // Create simple beep using Web Audio API
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    // Different frequencies for different alerts
    const frequencies = {
      alpha: 523.25, // C5
      beta: 659.25, // E5
      delta: 392, // G4
    };

    osc.frequency.value = frequencies[type] || 440;
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.3,
    );

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.3);
  } catch (err) {
    // Web Audio not available, silent fail
  }
}

// ============================================================================
// Status & Stats
// ============================================================================

function updateStatus(type, connected) {
  const el = document.getElementById(`${type}Status`);
  if (!el) return;

  const dot = el.querySelector(".dot");
  if (connected) {
    el.classList.add("connected");
    dot.style.background = "#00ff88";
  } else {
    el.classList.remove("connected");
    dot.style.background = "#ff4444";
  }
}

function updateStats() {
  const uptime = Math.floor((Date.now() - state.startTime) / 1000);
  const upStr =
    uptime > 3600
      ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
      : `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

  // Could update more stats here
}

// ============================================================================
// EEG SCALING & OSC CONSOLE (Added for smooth data control)
// ============================================================================

// EEG Scaling factors
let eegScaling = {
  eeg1: 1.0,
  eeg2: 1.0,
  eeg3: 1.0,
  eeg4: 1.0,
};

// OSC console message buffer
let oscMessageBuffer = [];
const OSC_MAX_MESSAGES = 15;

// ============================================================================
// EEG SCALING SLIDER HANDLERS
// ============================================================================

document.getElementById("eegScale1")?.addEventListener("input", (e) => {
  const percent = parseFloat(e.target.value);
  eegScaling.eeg1 = percent / 100;
  document.getElementById("scale1Display").textContent = percent + "%";
});

document.getElementById("eegScale2")?.addEventListener("input", (e) => {
  const percent = parseFloat(e.target.value);
  eegScaling.eeg2 = percent / 100;
  document.getElementById("scale2Display").textContent = percent + "%";
});

document.getElementById("eegScale3")?.addEventListener("input", (e) => {
  const percent = parseFloat(e.target.value);
  eegScaling.eeg3 = percent / 100;
  document.getElementById("scale3Display").textContent = percent + "%";
});

document.getElementById("eegScale4")?.addEventListener("input", (e) => {
  const percent = parseFloat(e.target.value);
  eegScaling.eeg4 = percent / 100;
  document.getElementById("scale4Display").textContent = percent + "%";
});

// ============================================================================
// OSC CONSOLE DISPLAY
// ============================================================================

function logOSCMessage(ch0, ch1, ch2, ch3) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const message = {
    timestamp,
    address: "/muse/eeg",
    ch0: (ch0 * eegScaling.eeg1).toFixed(3),
    ch1: (ch1 * eegScaling.eeg2).toFixed(3),
    ch2: (ch2 * eegScaling.eeg3).toFixed(3),
    ch3: (ch3 * eegScaling.eeg4).toFixed(3),
  };

  oscMessageBuffer.unshift(message);
  if (oscMessageBuffer.length > OSC_MAX_MESSAGES) {
    oscMessageBuffer.pop();
  }

  updateOSCConsole();
}

function updateOSCConsole() {
  if (!document.getElementById("oscConsoleToggle")?.checked) {
    return;
  }

  const console = document.querySelector("#oscConsole .osc-messages");
  if (!console) return;

  console.innerHTML = oscMessageBuffer
    .map(
      (msg) => `
    <div class="osc-message">
      <span class="osc-timestamp">[${msg.timestamp}]</span>
      <span class="osc-address">${msg.address}</span>
      <span class="osc-values">${msg.ch0} ${msg.ch1} ${msg.ch2} ${msg.ch3}</span>
    </div>
  `,
    )
    .join("");
}

// OSC Console toggle
document.getElementById("oscConsoleToggle")?.addEventListener("change", () => {
  updateOSCConsole();
});

// Clear OSC console
document.getElementById("oscClearBtn")?.addEventListener("click", () => {
  oscMessageBuffer = [];
  const console = document.querySelector("#oscConsole .osc-messages");
  if (console) {
    console.innerHTML = '<div class="osc-message">Log cleared</div>';
  }
});

// MODIFY the WebSocket message handler to log OSC messages
// Find the existing ws.onmessage handler and add OSC logging

const originalOnMessage = window.wsOnMessage;
if (!window.wsOnMessage) {
  // Store original handler if modifying
  window.logOSCFromWebSocket = function (eegData) {
    if (eegData && eegData.raw) {
      logOSCMessage(
        eegData.raw[0],
        eegData.raw[1],
        eegData.raw[2],
        eegData.raw[3],
      );
    }
  };
}

// OSC Output Scaler setup
function setupOSCScaler() {
  const slider = document.getElementById("oscScaler");
  const display = document.getElementById("oscScalerDisplay");

  // Return early if elements don't exist (not in current UI)
  if (!slider || !display) return;

  slider.addEventListener("change", (e) => {
    const value = parseFloat(e.target.value);
    display.textContent = value.toFixed(1);
    window.ws.send(
      JSON.stringify({ type: "update_settings", oscOutputScaler: value }),
    );
  });

  // Preset buttons
  document.getElementById("oscScale01").addEventListener("click", () => {
    slider.value = 1;
    display.textContent = "1.0";
    window.ws.send(
      JSON.stringify({ type: "update_settings", oscOutputScaler: 1 }),
    );
  });

  document.getElementById("oscScale03").addEventListener("click", () => {
    slider.value = 3;
    display.textContent = "3.0";
    window.ws.send(
      JSON.stringify({ type: "update_settings", oscOutputScaler: 3 }),
    );
  });

  document.getElementById("oscScale010").addEventListener("click", () => {
    slider.value = 10;
    display.textContent = "10.0";
    window.ws.send(
      JSON.stringify({ type: "update_settings", oscOutputScaler: 10 }),
    );
  });

  document.getElementById("oscScale020").addEventListener("click", () => {
    slider.value = 20;
    display.textContent = "20.0";
    window.ws.send(
      JSON.stringify({ type: "update_settings", oscOutputScaler: 20 }),
    );
  });

  document.getElementById("oscScaleRaw").addEventListener("click", () => {
    slider.value = 1;
    display.textContent = "Raw";
    window.ws.send(
      JSON.stringify({
        type: "update_settings",
        oscOutputScaler: 1,
        oscScaleMode: "raw",
      }),
    );
  });

  document.getElementById("oscScaleNone").addEventListener("click", () => {
    slider.value = 1;
    display.textContent = "None";
    window.ws.send(
      JSON.stringify({
        type: "update_settings",
        oscOutputScaler: 1,
        oscScaleMode: "none",
      }),
    );
  });
}

// Call this from DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupOSCScaler);
} else {
  setupOSCScaler();
}

// Add negative values toggle to setupOSCScaler
setTimeout(() => {
  const negativeToggle = document.getElementById("oscAllowNegative");
  if (negativeToggle) {
    negativeToggle.addEventListener("change", (e) => {
      const allowNegative = e.target.checked;
      console.log(
        `📊 OSC Allow Negative: ${allowNegative ? "YES" : "NO (positive only)"}`,
      );
      window.ws.send(
        JSON.stringify({
          type: "update_settings",
          oscAllowNegative: allowNegative,
        }),
      );
    });
  }
}, 100);

// ============================================================================
// Mind Metrics - Attention, Meditation, Drowsiness
// ============================================================================

const mindMetrics = {
  attentionHistory: [],
  meditationHistory: [],
  drowsinessHistory: [],
  maxHistoryLength: 120, // Keep 2 minutes of data (1 per second)
};

function calculateMindMetrics() {
  const rel = state.bandPowers.relative || {};
  const delta = rel.delta || 0.001;
  const theta = rel.theta || 0.001;
  const alpha = rel.alpha || 0.001;
  const beta = rel.beta || 0.001;
  const gamma = rel.gamma || 0.001;

  let attention, meditation, drowsiness;
  let isCalibrated = false;

  // Check if calibration is complete (z-scores available and locked)
  if (brainState.calibration.isLocked && brainState.zscores) {
    isCalibrated = true;
    // Use z-score calculations
    const zDelta = brainState.zscores.delta || 0;
    const zTheta = brainState.zscores.theta || 0;
    const zAlpha = brainState.zscores.alpha || 0;
    const zBeta = brainState.zscores.beta || 0;
    const zGamma = brainState.zscores.gamma || 0;

    // Attention: Z-Beta / (Z-Alpha + Z-Theta)
    attention = zBeta / (Math.abs(zAlpha) + Math.abs(zTheta) + 0.001);

    // Meditation: Z-Alpha / (Z-Beta + Z-Gamma)
    meditation = zAlpha / (Math.abs(zBeta) + Math.abs(zGamma) + 0.001);

    // Drowsiness: Z-Delta / (Z-Alpha + Z-Beta)
    drowsiness = zDelta / (Math.abs(zAlpha) + Math.abs(zBeta) + 0.001);
  } else {
    // Use raw ratio calculations (pre-calibration)
    attention = beta / (alpha + theta);
    meditation = alpha / (beta + gamma);
    drowsiness = delta / (alpha + beta);
  }

  // Store in history
  mindMetrics.attentionHistory.push(attention);
  mindMetrics.meditationHistory.push(meditation);
  mindMetrics.drowsinessHistory.push(drowsiness);

  if (mindMetrics.attentionHistory.length > mindMetrics.maxHistoryLength) {
    mindMetrics.attentionHistory.shift();
    mindMetrics.meditationHistory.shift();
    mindMetrics.drowsinessHistory.shift();
  }

  // Update UI
  updateMindMetricsDisplay(attention, meditation, drowsiness, isCalibrated);

  return { attention, meditation, drowsiness, isCalibrated };
}

function updateMindMetricsDisplay(
  attention,
  meditation,
  drowsiness,
  isCalibrated,
) {
  // Update calibration status hint
  const calibStatus = document.getElementById("metricsCalibStatus");
  if (calibStatus) {
    if (isCalibrated) {
      calibStatus.textContent =
        "✓ Calibrated — showing z-score metrics (σ = 1 standard deviation)";
      calibStatus.parentElement.style.borderLeftColor = "#22c55e";
    } else {
      calibStatus.textContent =
        "Uncalibrated — showing raw metrics. Go to 🧠 Brain State tab to calibrate";
      calibStatus.parentElement.style.borderLeftColor = "#f59e0b";
    }
  }

  // Update metric values with calibration status
  const attentionEl = document.getElementById("metricAttention");
  const meditationEl = document.getElementById("metricMeditation");
  const drowsinessEl = document.getElementById("metricDrowsiness");

  const valueDisplay = isCalibrated
    ? (val) => val.toFixed(2)
    : (val) => val.toFixed(1);
  const unit = isCalibrated ? " σ" : "";

  if (attentionEl) attentionEl.textContent = valueDisplay(attention) + unit;
  if (meditationEl) meditationEl.textContent = valueDisplay(meditation) + unit;
  if (drowsinessEl) drowsinessEl.textContent = valueDisplay(drowsiness) + unit;

  // Update status indicators with z-score thresholds if calibrated
  if (isCalibrated) {
    updateZScoreMetricStatus(
      attention,
      document.getElementById("attentionStatus"),
      "Hyperfocused",
      "Normal focus",
      "Low engagement",
    );
    updateZScoreMetricStatus(
      meditation,
      document.getElementById("meditationStatus"),
      "Deep meditation",
      "Balanced",
      "Active thinking",
    );
    updateZScoreMetricStatus(
      drowsiness,
      document.getElementById("drowsinessStatus"),
      "Very alert",
      "Normal alertness",
      "Drowsy",
    );
  } else {
    updateMetricStatus(
      attention,
      document.getElementById("attentionStatus"),
      "Focused Thinking",
      "Low engagement",
      50,
    );
    updateMetricStatus(
      meditation,
      document.getElementById("meditationStatus"),
      "Deep Calm",
      "Active thinking",
      100,
    );
    updateMetricStatus(
      drowsiness,
      document.getElementById("drowsinessStatus"),
      "Alert & Awake",
      "Drowsy",
      30,
    );
  }

  // Update timeline charts
  updateMindMetricsCharts();
}

function updateMetricStatus(value, element, highLabel, lowLabel, threshold) {
  if (!element) return;
  const isHigh = value > threshold;
  element.textContent = isHigh ? `✓ ${highLabel}` : `⚠ ${lowLabel}`;
  element.style.color = isHigh ? "#22c55e" : "#f59e0b";
  element.parentElement.style.borderLeftColor = isHigh ? "#22c55e" : "#f59e0b";
}

function updateZScoreMetricStatus(
  zvalue,
  element,
  highLabel,
  normalLabel,
  lowLabel,
) {
  if (!element) return;
  let text, color, borderColor;

  if (zvalue > 1) {
    // Green: Above baseline
    text = `✓ ${highLabel}`;
    color = "#22c55e";
    borderColor = "#22c55e";
  } else if (zvalue < -1) {
    // Red: Below baseline
    text = `⚠ ${lowLabel}`;
    color = "#ef4444";
    borderColor = "#ef4444";
  } else {
    // Yellow: Normal range
    text = `○ ${normalLabel}`;
    color = "#f59e0b";
    borderColor = "#f59e0b";
  }

  element.textContent = text;
  element.style.color = color;
  element.parentElement.style.borderLeftColor = borderColor;
}

function updateMindMetricsCharts() {
  const maxLen = Math.max(
    mindMetrics.attentionHistory.length,
    mindMetrics.meditationHistory.length,
    mindMetrics.drowsinessHistory.length,
  );

  // Attention chart
  updateMindMetricCanvas(
    "metricsAttentionChart",
    mindMetrics.attentionHistory,
    "#f59e0b",
    "Attention",
  );

  // Meditation chart
  updateMindMetricCanvas(
    "metricsMeditationChart",
    mindMetrics.meditationHistory,
    "#22c55e",
    "Meditation",
  );

  // Drowsiness chart
  updateMindMetricCanvas(
    "metricsDrowsinessChart",
    mindMetrics.drowsinessHistory,
    "#ef4444",
    "Drowsiness",
  );
}

function updateMindMetricCanvas(canvasId, data, color, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || data.length === 0) return;

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // Clear
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const y = (H / 10) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Find min/max
  const min = Math.min(...data);
  const max = Math.max(...data, 1); // At least 1 for scale

  // Draw waveform
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  data.forEach((val, i) => {
    const x = (i / (data.length - 1 || 1)) * W;
    const normalized = (val - min) / (max - min || 1);
    const y = H - normalized * (H - 20) - 10;

    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.stroke();

  // Label
  ctx.fillStyle = color;
  ctx.font = "bold 10px monospace";
  ctx.fillText(label, 10, 18);

  // Scale labels
  ctx.fillStyle = "#666";
  ctx.font = "8px monospace";
  ctx.fillText(max.toFixed(1), W - 40, 12);
  ctx.fillText("0", W - 40, H - 4);
}

// Initialize Mind Metrics updates
function initMindMetrics() {
  // Update mind metrics every second
  setInterval(() => {
    if (state.bandPowers.relative) {
      calculateMindMetrics();
    }
  }, 1000);
}

// ============================================================================
// Color Palette Management
// ============================================================================

function initializeColorPalette() {
  const selector = document.getElementById("colorPaletteSelector");
  if (!selector) return;

  // Load saved palette preference from localStorage
  const savedPalette = localStorage.getItem("colorPalette") || "default";
  selector.value = savedPalette;
  applyColorPalette(savedPalette);

  // Listen for changes
  selector.addEventListener("change", (e) => {
    const paletteName = e.target.value;
    localStorage.setItem("colorPalette", paletteName);
    applyColorPalette(paletteName);
    console.log(`🎨 Color palette switched to: ${paletteName}`);
  });
}

function applyColorPalette(paletteName) {
  const palette = COLOR_PALETTES[paletteName];
  if (!palette) {
    console.warn(`❌ Unknown palette: ${paletteName}`);
    return;
  }

  // Apply CSS variables to root
  const root = document.documentElement;
  root.style.setProperty("--primary", palette.primary);
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--success", palette.success);
  root.style.setProperty("--danger", palette.danger);
  root.style.setProperty("--info", palette.info);

  // Update specific element colors for better visual feedback
  const statusIndicators = document.querySelectorAll(".status .dot");
  statusIndicators.forEach((dot) => {
    dot.style.backgroundColor = palette.success;
  });

  const activeButtons = document.querySelectorAll(".btn-primary, .active");
  activeButtons.forEach((btn) => {
    if (btn.classList.contains("btn-primary")) {
      btn.style.backgroundColor = palette.primary + "20";
      btn.style.color = palette.primary;
      btn.style.borderColor = palette.primary;
    }
  });

  console.log(`✨ Applied palette: ${paletteName}`);
}
