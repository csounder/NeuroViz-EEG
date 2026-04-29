"use client";

import * as React from "react";
import { getConcertAudioLevel } from "@/lib/concertAudioMeter";
import type { BandName, BandPowers } from "@/lib/types";

export type ConcertScene =
  | "auroraBrain"
  | "neuralCathedral"
  | "corticalBloom"
  | "spectralTunnel"
  | "synapticStorm"
  | "dreamOcean"
  | "rotatingBrain"
  | "connectomeGalaxy"
  | "holographicCortex"
  | "limbicNebula"
  | "pulseRingsAudio"
  | "bassBloomAudio"
  | "stereoShearWave"
  | "spectralCathedralAR"
  | "scanlineWavefront"
  | "sparkLatticeAR"
  | "harmonicOrbitsAR"
  | "resonantMeshAR"
  | "corticalLightningAR"
  | "phaseLockLattice";

const BAND_COLORS: Record<BandName, [number, number, number]> = {
  delta: [80, 155, 255],
  theta: [165, 120, 255],
  alpha: [45, 225, 160],
  beta: [255, 180, 60],
  gamma: [255, 90, 185],
};

const BAND_ORDER: BandName[] = ["delta", "theta", "alpha", "beta", "gamma"];

export const CONCERT_SCENES: {
  id: ConcertScene;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "auroraBrain",
    title: "Aurora Brain",
    subtitle: "A luminous head-space, alpha and gamma rippling across a cortical silhouette.",
  },
  {
    id: "neuralCathedral",
    title: "Neural Cathedral",
    subtitle: "Grand architectural columns, beta sparks, and theta arches for large halls.",
  },
  {
    id: "corticalBloom",
    title: "Cortical Bloom",
    subtitle: "Floral radial harmonics, breathing with delta and opening with alpha.",
  },
  {
    id: "spectralTunnel",
    title: "Spectral Tunnel",
    subtitle: "A cinematic flight through EEG bands, ideal behind rhythmic music.",
  },
  {
    id: "synapticStorm",
    title: "Synaptic Storm",
    subtitle: "Particle constellations and lightning paths driven by channel differences.",
  },
  {
    id: "dreamOcean",
    title: "Dream Ocean",
    subtitle: "Slow liquid waves, bioluminescent traces, and meditative stage motion.",
  },
  {
    id: "rotatingBrain",
    title: "Rotating Brain",
    subtitle: "A pseudo-3D human brain model with band-lit cortical regions and orbiting EEG traces.",
  },
  {
    id: "connectomeGalaxy",
    title: "Connectome Galaxy",
    subtitle: "A deep 3D neural starfield with long-range connections and gamma lightning.",
  },
  {
    id: "holographicCortex",
    title: "Holographic Cortex",
    subtitle: "Shader-like scanlines, volumetric meshes, and floating cortical topography.",
  },
  {
    id: "limbicNebula",
    title: "Limbic Nebula",
    subtitle: "Immersive plasma clouds, depth ribbons, and emotional color fields from the EEG bands.",
  },
];

/** EEG + browser Csound RMS (⌥1 … ⌥0). Simulator uses band-sync envelope when audio is silent. */
export const CONCERT_SHIFT_SCENES: {
  id: ConcertScene;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "pulseRingsAudio",
    title: "Pulse Rings (AR)",
    subtitle: "Concentric neural halos: band hues, ring breathe from RMS + γ/β.",
  },
  {
    id: "bassBloomAudio",
    title: "Bass Bloom (AR)",
    subtitle: "Slow δ/θ core swells with audio bursts; meditative low-end focus.",
  },
  {
    id: "stereoShearWave",
    title: "Stereo Shear (AR)",
    subtitle: "Left/right cortical waves: channel asymmetry × live level.",
  },
  {
    id: "spectralCathedralAR",
    title: "Spectral Cathedral (AR)",
    subtitle: "Vertical pillars spike on transients; EEG tints the nave.",
  },
  {
    id: "scanlineWavefront",
    title: "Scanline Wavefront (AR)",
    subtitle: "Raster storm: horizontal fronts velocity-modulated by audio.",
  },
  {
    id: "sparkLatticeAR",
    title: "Spark Lattice (AR)",
    subtitle: "Grid ignites when RMS + band energy cross thresholds.",
  },
  {
    id: "harmonicOrbitsAR",
    title: "Harmonic Orbits (AR)",
    subtitle: "Five band-colored orbits; angular motion kicks with the mix.",
  },
  {
    id: "resonantMeshAR",
    title: "Resonant Mesh (AR)",
    subtitle: "Chord graph in the round; edge glow follows loudness.",
  },
  {
    id: "corticalLightningAR",
    title: "Cortical Lightning (AR)",
    subtitle: "γ-tinted spokes and branches flash on audio peaks.",
  },
  {
    id: "phaseLockLattice",
    title: "Phase Lock Lattice (AR)",
    subtitle: "Interference lattice: phase slips with RMS, colors from bands.",
  },
];

export function concertSceneSpec(
  scene: ConcertScene,
): { id: ConcertScene; title: string; subtitle: string } | undefined {
  return CONCERT_SCENES.find((s) => s.id === scene) ?? CONCERT_SHIFT_SCENES.find((s) => s.id === scene);
}

type BandVector = Record<BandName, number>;

export function ConcertVisualizer({
  scene,
  latestBandsAbs,
  latestBandTraces,
  intensity = 1,
  trails = 0.86,
  showHud = true,
  simAudioReactive = false,
}: {
  scene: ConcertScene;
  latestBandsAbs: BandPowers | null;
  latestBandTraces: Record<BandName, number[]> | null;
  intensity?: number;
  trails?: number;
  showHud?: boolean;
  /** True when server simulator or browser client sim is feeding EEG — enables AR preview without Csound. */
  simAudioReactive?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dataRef = React.useRef({
    latestBandsAbs,
    latestBandTraces,
    scene,
    intensity,
    trails,
    showHud,
    simAudioReactive,
  });

  React.useEffect(() => {
    dataRef.current = {
      latestBandsAbs,
      latestBandTraces,
      scene,
      intensity,
      trails,
      showHud,
      simAudioReactive,
    };
  }, [intensity, latestBandsAbs, latestBandTraces, scene, showHud, trails, simAudioReactive]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let raf = 0;
    const particles = makeParticles(220);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (timeMs: number) => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const now = timeMs / 1000;
      const data = dataRef.current;
      const bands = normalizeBands(data.latestBandsAbs);
      const channels = channelEnergy(data.latestBandTraces);
      const audio = blendConcertAudioLevel(
        getConcertAudioLevel(),
        bands,
        channels,
        now,
        data.simAudioReactive,
      );

      ctx.fillStyle = `rgba(4, 5, 12, ${Math.max(0.04, 1 - data.trails)})`;
      ctx.fillRect(0, 0, w, h);

      paintBackdrop(ctx, w, h, bands, now);

      switch (data.scene) {
        case "auroraBrain":
          drawAuroraBrain(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "neuralCathedral":
          drawNeuralCathedral(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "corticalBloom":
          drawCorticalBloom(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "spectralTunnel":
          drawSpectralTunnel(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "synapticStorm":
          drawSynapticStorm(ctx, w, h, bands, channels, particles, now, data.intensity);
          break;
        case "dreamOcean":
          drawDreamOcean(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "rotatingBrain":
          drawRotatingBrain(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "connectomeGalaxy":
          drawConnectomeGalaxy(ctx, w, h, bands, channels, particles, now, data.intensity);
          break;
        case "holographicCortex":
          drawHolographicCortex(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "limbicNebula":
          drawLimbicNebula(ctx, w, h, bands, channels, now, data.intensity);
          break;
        case "pulseRingsAudio":
          drawPulseRingsAudio(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "bassBloomAudio":
          drawBassBloomAudio(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "stereoShearWave":
          drawStereoShearWave(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "spectralCathedralAR":
          drawSpectralCathedralAR(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "scanlineWavefront":
          drawScanlineWavefront(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "sparkLatticeAR":
          drawSparkLatticeAR(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "harmonicOrbitsAR":
          drawHarmonicOrbitsAR(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "resonantMeshAR":
          drawResonantMeshAR(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "corticalLightningAR":
          drawCorticalLightningAR(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
        case "phaseLockLattice":
          drawPhaseLockLattice(ctx, w, h, bands, channels, now, data.intensity, audio);
          break;
      }

      if (data.showHud) drawHud(ctx, w, h, data.scene, bands, audio);
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full min-h-[620px] w-full rounded-2xl bg-black" />;
}

/** When the simulator is on but Csound is silent, drive AR from band + channel energy. */
function blendConcertAudioLevel(
  rms: number,
  bands: BandVector,
  channels: number[],
  t: number,
  useSimFallback: boolean,
): number {
  if (!useSimFallback) return rms;
  const meanBand =
    (bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma) / 5;
  const ch = (channels[0] + channels[1] + channels[2] + channels[3]) / 4;
  const wobble = Math.sin(t * 5.5 + meanBand * 8) * 0.07;
  const pseudo = clamp(0.14 + meanBand * 0.52 + ch * 0.3 + wobble, 0, 1);
  return Math.max(rms, pseudo);
}

function normalizeBands(abs: BandPowers | null): BandVector {
  const fallback: BandVector = {
    delta: 0.35,
    theta: 0.42,
    alpha: 0.55,
    beta: 0.38,
    gamma: 0.26,
  };
  if (!abs) return fallback;
  return BAND_ORDER.reduce((acc, band) => {
    const value = abs[band];
    acc[band] = Number.isFinite(value) ? clamp((value + 2.5) / 4, 0, 1) : fallback[band];
    return acc;
  }, {} as BandVector);
}

function channelEnergy(traces: Record<BandName, number[]> | null) {
  const out = [0.25, 0.25, 0.25, 0.25];
  if (!traces) return out;
  for (let ch = 0; ch < 4; ch += 1) {
    let sum = 0;
    for (const band of BAND_ORDER) sum += Math.abs(traces[band]?.[ch] ?? 0);
    out[ch] = clamp(sum / 120, 0, 1);
  }
  return out;
}

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  t: number,
) {
  const g = ctx.createRadialGradient(
    w * (0.5 + Math.sin(t * 0.07) * 0.08),
    h * 0.45,
    0,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.75,
  );
  g.addColorStop(0, `rgba(18, 28, 60, ${0.48 + bands.alpha * 0.18})`);
  g.addColorStop(0.45, `rgba(8, 10, 28, ${0.92})`);
  g.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawAuroraBrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  const cx = w / 2;
  const cy = h * 0.52;
  const scale = Math.min(w, h) * 0.34;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowBlur = 28 + bands.gamma * 45 * intensity;
  ctx.shadowColor = "rgba(80, 255, 210, .7)";

  for (let layer = 0; layer < 7; layer += 1) {
    const band = BAND_ORDER[layer % BAND_ORDER.length];
    const color = BAND_COLORS[band];
    ctx.beginPath();
    for (let i = 0; i <= 220; i += 1) {
      const a = (i / 220) * Math.PI * 2;
      const ripple =
        Math.sin(a * 7 + t * (0.7 + bands.beta * 1.5) + layer) *
        scale *
        0.035 *
        intensity;
      const lobe =
        1 +
        Math.sin(a * 2 - 0.8) * 0.12 +
        Math.cos(a * 3 + 0.6) * 0.08 +
        channels[layer % 4] * 0.08;
      const x = Math.cos(a) * (scale * lobe + ripple) * (1.05 + layer * 0.018);
      const y = Math.sin(a) * (scale * 0.72 * lobe + ripple) * (0.9 + layer * 0.018);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.2 + bands[band] * 0.55})`;
    ctx.lineWidth = 1.4 + layer * 0.45;
    ctx.stroke();
  }

  for (let i = 0; i < 56; i += 1) {
    const a = (i / 56) * Math.PI * 2 + t * 0.08;
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const r = scale * (0.28 + bands[band] * 0.68);
    const x = Math.cos(a) * r * 1.08;
    const y = Math.sin(a * 1.15) * r * 0.72;
    const size = 2 + bands[band] * 6 * intensity;
    dot(ctx, x, y, size, rgba(BAND_COLORS[band], 0.4 + bands[band] * 0.6));
  }
  ctx.restore();
}

function drawNeuralCathedral(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  const floor = h * 0.88;
  const columns = 18;
  for (let i = 0; i < columns; i += 1) {
    const p = i / (columns - 1);
    const side = p < 0.5 ? -1 : 1;
    const depth = Math.abs(p - 0.5) * 2;
    const x = w * 0.5 + side * Math.pow(depth, 1.7) * w * 0.48;
    const top = h * (0.14 + depth * 0.18);
    const width = 8 + (1 - depth) * 18;
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const pulse = bands[band] * intensity + channels[i % 4] * 0.5;
    const grad = ctx.createLinearGradient(x, top, x, floor);
    grad.addColorStop(0, rgba(BAND_COLORS[band], 0.05));
    grad.addColorStop(0.45, rgba(BAND_COLORS[band], 0.18 + pulse * 0.42));
    grad.addColorStop(1, rgba(BAND_COLORS[band], 0.02));
    ctx.fillStyle = grad;
    ctx.shadowBlur = 18 + pulse * 35;
    ctx.shadowColor = rgba(BAND_COLORS[band], 0.75);
    roundRect(ctx, x - width / 2, top, width, floor - top, width / 2);
    ctx.fill();
  }

  ctx.shadowBlur = 20 + bands.gamma * 30;
  for (let arch = 0; arch < 7; arch += 1) {
    const band = BAND_ORDER[arch % BAND_ORDER.length];
    ctx.beginPath();
    const y = h * (0.18 + arch * 0.085);
    ctx.ellipse(w / 2, y, w * (0.14 + arch * 0.065), h * (0.16 + arch * 0.025), 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.22 + bands[band] * 0.5);
    ctx.lineWidth = 2 + bands[band] * 6;
    ctx.stroke();
  }

  const beam = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.55, h * 0.7);
  beam.addColorStop(0, `rgba(255,255,255,${0.08 + bands.alpha * 0.15})`);
  beam.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, w, h);
}

function drawCorticalBloom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h) * 0.08;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = "lighter";
  for (let ring = 0; ring < 13; ring += 1) {
    const band = BAND_ORDER[ring % BAND_ORDER.length];
    const petals = 5 + ring;
    const radius = base + ring * Math.min(w, h) * 0.028 + bands[band] * 58 * intensity;
    ctx.beginPath();
    for (let i = 0; i <= 720; i += 1) {
      const a = (i / 720) * Math.PI * 2;
      const petal = Math.sin(a * petals + t * (0.35 + bands.gamma) + ring) * (20 + bands[band] * 80);
      const breath = Math.sin(t * (0.25 + bands.delta) + ring) * 18 * channels[ring % 4];
      const r = radius + petal * 0.18 + breath;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.18 + bands[band] * 0.45);
    ctx.lineWidth = 1.2 + bands[band] * 4;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpectralTunnel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const rings = 34;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.08) * 0.2);
  for (let r = rings; r > 0; r -= 1) {
    const z = r / rings;
    const radius = Math.pow(1 - z, 2.2) * Math.max(w, h) * 0.95 + 16;
    const band = BAND_ORDER[r % BAND_ORDER.length];
    const sides = 7 + Math.round(bands.beta * 9);
    const spin = t * (0.15 + bands.gamma * 0.85) + r * 0.12;
    ctx.beginPath();
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * Math.PI * 2 + spin;
      const wobble = 1 + Math.sin(a * 3 + t + r) * 0.08 * intensity + channels[i % 4] * 0.05;
      const x = Math.cos(a) * radius * wobble;
      const y = Math.sin(a) * radius * wobble * 0.68;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(BAND_COLORS[band], (0.05 + bands[band] * 0.5) * (1 - z * 0.5));
    ctx.lineWidth = 1 + (1 - z) * 5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSynapticStorm(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  particles: Particle[],
  t: number,
  intensity: number,
) {
  ctx.globalCompositeOperation = "lighter";
  const speed = 0.18 + bands.beta * 1.2 + bands.gamma * 1.6;
  for (const p of particles) {
    const band = BAND_ORDER[p.band];
    p.x += Math.cos(p.angle + t * 0.12) * speed * p.speed * intensity;
    p.y += Math.sin(p.angle + t * 0.09) * speed * p.speed * intensity;
    p.angle += (bands.gamma - 0.4) * 0.015;
    if (p.x < -30) p.x = w + 30;
    if (p.x > w + 30) p.x = -30;
    if (p.y < -30) p.y = h + 30;
    if (p.y > h + 30) p.y = -30;
    dot(ctx, p.x, p.y, p.size * (1 + bands[band] * 2.5), rgba(BAND_COLORS[band], 0.22 + bands[band] * 0.75));
  }

  for (let i = 0; i < particles.length; i += 8) {
    const a = particles[i];
    const b = particles[(i + 21) % particles.length];
    const band = BAND_ORDER[a.band];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 180 + channels[i % 4] * 260) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = rgba(BAND_COLORS[band], (1 - d / 420) * bands[band] * 0.55);
      ctx.lineWidth = 0.7 + bands.gamma * 2;
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawDreamOcean(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  const horizon = h * (0.42 + Math.sin(t * 0.08) * 0.03);
  const ocean = ctx.createLinearGradient(0, horizon, 0, h);
  ocean.addColorStop(0, `rgba(20, 70, 120, ${0.25 + bands.theta * 0.25})`);
  ocean.addColorStop(1, `rgba(0, 8, 30, 1)`);
  ctx.fillStyle = ocean;
  ctx.fillRect(0, horizon, w, h - horizon);

  for (let layer = 0; layer < 11; layer += 1) {
    const band = BAND_ORDER[layer % BAND_ORDER.length];
    const y = horizon + layer * h * 0.055;
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 10) {
      const wave =
        Math.sin(x * 0.006 + t * (0.25 + bands.delta) + layer) * (12 + bands[band] * 42) +
        Math.sin(x * 0.017 - t * (0.18 + bands.theta) + channels[layer % 4]) * 10;
      if (x === -20) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.14 + bands[band] * 0.42);
    ctx.lineWidth = 1 + layer * 0.18 + intensity;
    ctx.shadowBlur = 12 + bands[band] * 28;
    ctx.shadowColor = rgba(BAND_COLORS[band], 0.45);
    ctx.stroke();
  }

  for (let i = 0; i < 42; i += 1) {
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const x = ((i * 97.13 + t * (12 + bands.beta * 45)) % (w + 80)) - 40;
    const y = horizon + ((i * 53.7 + Math.sin(t + i) * 30) % (h - horizon));
    dot(ctx, x, y, 1.5 + bands[band] * 7 * intensity, rgba(BAND_COLORS[band], 0.22 + bands[band] * 0.58));
  }
}

function drawRotatingBrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  const cx = w / 2;
  const cy = h * 0.52;
  const scale = Math.min(w, h) * 0.35;
  const rotY = t * (0.18 + bands.gamma * 0.22);
  const rotX = -0.22 + Math.sin(t * 0.17) * 0.12;
  const nodes: { x: number; y: number; z: number; band: BandName; region: number }[] = [];

  for (let lat = -5; lat <= 5; lat += 1) {
    for (let lon = 0; lon < 22; lon += 1) {
      const u = lon / 22;
      const v = lat / 5;
      const a = u * Math.PI * 2;
      const y = v * 0.72;
      const lobe = 1 + Math.sin(a * 2 + y * 3) * 0.12 + Math.cos(a * 3 - y) * 0.08;
      const r = Math.sqrt(Math.max(0.02, 1 - y * y)) * lobe;
      const fissure = Math.sin(a * 8 + t * 0.8 + lat) * 0.025;
      const band = BAND_ORDER[(lon + lat + 10) % BAND_ORDER.length];
      nodes.push({
        x: Math.cos(a) * r * 1.18,
        y: y + fissure,
        z: Math.sin(a) * r * 0.82,
        band,
        region: Math.abs(lat) + (lon % 4),
      });
    }
  }

  const projected = nodes
    .map((node) => ({
      ...node,
      ...project3d(node.x, node.y, node.z, rotX, rotY, scale, cx, cy),
    }))
    .sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < projected.length; i += 1) {
    const a = projected[i];
    for (let j = i + 7; j < projected.length; j += 19) {
      const b = projected[j];
      const dx = a.x2 - b.x2;
      const dy = a.y2 - b.y2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < scale * 0.34) {
        const bandPower = (bands[a.band] + bands[b.band]) * 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x2, a.y2);
        ctx.lineTo(b.x2, b.y2);
        ctx.strokeStyle = rgba(BAND_COLORS[a.band], (1 - d / (scale * 0.34)) * bandPower * 0.38);
        ctx.lineWidth = 0.6 + bandPower * 2.2 * intensity;
        ctx.stroke();
      }
    }
  }

  for (const node of projected) {
    const glow = bands[node.band] * (0.75 + channels[node.region % 4] * 0.7);
    dot(
      ctx,
      node.x2,
      node.y2,
      (1.3 + glow * 5.5 * intensity) * node.depth,
      rgba(BAND_COLORS[node.band], 0.2 + glow * 0.75),
    );
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = `rgba(220,255,245,${0.16 + bands.alpha * 0.24})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, scale * 1.23, scale * 0.78, Math.sin(rotY) * 0.08, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 5; i += 1) {
    const band = BAND_ORDER[i];
    const orbit = scale * (0.78 + i * 0.08);
    const a = t * (0.25 + bands[band]) + i * 1.2;
    const x = cx + Math.cos(a) * orbit * 1.45;
    const y = cy + Math.sin(a) * orbit * 0.48;
    dot(ctx, x, y, 5 + bands[band] * 14, rgba(BAND_COLORS[band], 0.55 + bands[band] * 0.35));
  }
  ctx.restore();
}

function drawConnectomeGalaxy(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  particles: Particle[],
  t: number,
  intensity: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const projected = particles.slice(0, 180).map((p, i) => {
    const band = BAND_ORDER[p.band];
    const radius = 0.22 + ((i * 0.037) % 1.15);
    const arm = i % 5;
    const angle = t * (0.08 + bands.gamma * 0.18) + radius * 5 + arm * 1.26;
    const z = Math.sin(t * 0.22 + i * 0.17) * 0.9;
    const x = Math.cos(angle) * radius * (1 + channels[i % 4] * 0.5);
    const y = Math.sin(angle * 1.14) * radius * 0.62;
    return {
      band,
      ...project3d(x, y, z, 0.42, t * 0.16, Math.min(w, h) * 0.42, cx, cy),
    };
  });

  for (let i = 0; i < projected.length; i += 1) {
    const a = projected[i];
    for (let j = i + 11; j < projected.length; j += 23) {
      const b = projected[j];
      const dx = a.x2 - b.x2;
      const dy = a.y2 - b.y2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const bandPower = (bands[a.band] + bands[b.band]) * 0.5;
      if (d < 240 + bands.theta * 160) {
        ctx.beginPath();
        ctx.moveTo(a.x2, a.y2);
        const mx = (a.x2 + b.x2) / 2 + Math.sin(t + i) * 24 * channels[i % 4];
        const my = (a.y2 + b.y2) / 2 + Math.cos(t + j) * 24 * channels[j % 4];
        ctx.quadraticCurveTo(mx, my, b.x2, b.y2);
        ctx.strokeStyle = rgba(BAND_COLORS[a.band], (1 - d / 420) * bandPower * 0.5);
        ctx.lineWidth = 0.55 + bandPower * 2.8 * intensity;
        ctx.stroke();
      }
    }
  }

  for (const p of projected) {
    dot(ctx, p.x2, p.y2, (1.2 + bands[p.band] * 6.5) * p.depth, rgba(BAND_COLORS[p.band], 0.25 + bands[p.band] * 0.7));
  }
  ctx.restore();
}

function drawHolographicCortex(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  const cx = w / 2;
  const cy = h * 0.55;
  const cols = 44;
  const rows = 24;
  const scale = Math.min(w, h) * 0.035;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let y = 0; y < rows; y += 1) {
    ctx.beginPath();
    for (let x = 0; x < cols; x += 1) {
      const nx = (x / (cols - 1) - 0.5) * 2.4;
      const ny = (y / (rows - 1) - 0.5) * 1.45;
      const band = BAND_ORDER[(x + y) % BAND_ORDER.length];
      const z =
        Math.sin(nx * 4 + t * (0.8 + bands.beta)) * 0.35 +
        Math.cos(ny * 6 - t * (0.4 + bands.theta)) * 0.25 +
        bands[band] * 0.7;
      const p = project3d(nx, ny, z, 0.95, t * 0.1, scale * 15, cx, cy);
      if (x === 0) ctx.moveTo(p.x2, p.y2);
      else ctx.lineTo(p.x2, p.y2);
    }
    const band = BAND_ORDER[y % BAND_ORDER.length];
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.12 + bands[band] * 0.42);
    ctx.lineWidth = 0.8 + bands[band] * 2.2 * intensity;
    ctx.stroke();
  }

  for (let x = 0; x < cols; x += 3) {
    ctx.beginPath();
    for (let y = 0; y < rows; y += 1) {
      const nx = (x / (cols - 1) - 0.5) * 2.4;
      const ny = (y / (rows - 1) - 0.5) * 1.45;
      const band = BAND_ORDER[(x + y) % BAND_ORDER.length];
      const z = Math.sin(nx * 5 + t) * 0.28 + Math.cos(ny * 5 - t * 0.6) * 0.22 + bands[band] * 0.65;
      const p = project3d(nx, ny, z, 0.95, t * 0.1, scale * 15, cx, cy);
      if (y === 0) ctx.moveTo(p.x2, p.y2);
      else ctx.lineTo(p.x2, p.y2);
    }
    ctx.strokeStyle = `rgba(190,255,245,${0.06 + bands.alpha * 0.18})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  for (let y = 0; y < h; y += 9) {
    ctx.fillStyle = `rgba(120,255,230,${0.018 + bands.gamma * 0.018})`;
    ctx.fillRect(0, y + Math.sin(t * 20 + y) * 2, w, 1);
  }

  for (let i = 0; i < 36; i += 1) {
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const x = cx + Math.sin(t * 0.4 + i * 2.13) * w * 0.42;
    const y = cy + Math.cos(t * 0.31 + i * 1.77) * h * 0.23;
    dot(ctx, x, y, 2 + bands[band] * 9 * intensity + channels[i % 4] * 6, rgba(BAND_COLORS[band], 0.35 + bands[band] * 0.55));
  }
  ctx.restore();
}

function drawLimbicNebula(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 18; i += 1) {
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const x = w * (0.5 + Math.sin(t * (0.08 + i * 0.006) + i * 1.7) * 0.42);
    const y = h * (0.5 + Math.cos(t * (0.07 + i * 0.004) + i * 2.1) * 0.34);
    const r = Math.min(w, h) * (0.12 + bands[band] * 0.18 + channels[i % 4] * 0.06) * intensity;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(BAND_COLORS[band], 0.12 + bands[band] * 0.28));
    g.addColorStop(0.34, rgba(BAND_COLORS[band], 0.05 + bands[band] * 0.13));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const ribbons = 9;
  for (let ribbon = 0; ribbon < ribbons; ribbon += 1) {
    const band = BAND_ORDER[ribbon % BAND_ORDER.length];
    ctx.beginPath();
    for (let i = 0; i <= 180; i += 1) {
      const p = i / 180;
      const z = Math.sin(p * Math.PI * 4 + t * (0.4 + bands[band])) * 0.7;
      const x3 = (p - 0.5) * 2.5;
      const y3 =
        Math.sin(p * Math.PI * 2 + ribbon * 0.9 + t * 0.25) * 0.55 +
        (ribbon - ribbons / 2) * 0.08;
      const p2 = project3d(x3, y3, z, 0.5, t * 0.12 + ribbon * 0.08, Math.min(w, h) * 0.42, w / 2, h / 2);
      if (i === 0) ctx.moveTo(p2.x2, p2.y2);
      else ctx.lineTo(p2.x2, p2.y2);
    }
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.16 + bands[band] * 0.48);
    ctx.lineWidth = 1.4 + bands[band] * 5 * intensity;
    ctx.shadowBlur = 18 + bands[band] * 42;
    ctx.shadowColor = rgba(BAND_COLORS[band], 0.65);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPulseRingsAudio(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const mx = Math.min(w, h) * 0.48;
  const rings = 14;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let r = 1; r <= rings; r += 1) {
    const z = r / rings;
    const band = BAND_ORDER[r % BAND_ORDER.length];
    const pulse = z * (0.65 + audio * 1.15 + bands.gamma * 0.35);
    const radius = mx * pulse * (0.35 + bands[band] * 0.5) + r * 6 * (0.4 + audio);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.08 + bands[band] * 0.35 + audio * 0.25);
    ctx.lineWidth = 1.2 + (1 - z) * 5 * intensity + audio * 4;
    ctx.stroke();
  }
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2 + t * (0.2 + audio * 1.2);
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const rr = mx * (0.2 + bands[band] * 0.55 + audio * 0.45);
    dot(
      ctx,
      cx + Math.cos(a) * rr,
      cy + Math.sin(a * 1.1) * rr * 0.82,
      2 + bands[band] * 5 + channels[i % 4] * 4 + audio * 8,
      rgba(BAND_COLORS[band], 0.35 + audio * 0.45),
    );
  }
  ctx.restore();
}

function drawBassBloomAudio(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const cx = w / 2;
  const cy = h * 0.52;
  const low = (bands.delta + bands.theta) * 0.5;
  const r =
    Math.min(w, h) *
    (0.22 + low * 0.38 + audio * 0.42) *
    intensity;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  g.addColorStop(0, rgba(BAND_COLORS.delta, 0.35 + audio * 0.4));
  g.addColorStop(0.35, rgba(BAND_COLORS.theta, 0.12 + low * 0.35));
  g.addColorStop(0.7, rgba(BAND_COLORS.alpha, 0.06 + bands.alpha * 0.2));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 64; i += 1) {
    const a = (i / 64) * Math.PI * 2 + t * 0.11;
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const rad = r * (0.4 + bands[band] * 0.9 + audio * 0.6);
    dot(
      ctx,
      cx + Math.cos(a) * rad,
      cy + Math.sin(a * 1.05) * rad * 0.75,
      1.5 + audio * 12 + channels[i % 4] * 5,
      rgba(BAND_COLORS[band], 0.2 + bands[band] * 0.5),
    );
  }
  ctx.restore();
}

function drawStereoShearWave(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const mid = w / 2;
  const lEnergy = (channels[0] + channels[1]) * 0.5;
  const rEnergy = (channels[2] + channels[3]) * 0.5;
  ctx.save();
  for (let side = 0; side < 2; side += 1) {
    const leftSide = side === 0;
    const chMix = leftSide ? lEnergy : rEnergy;
    const x0 = leftSide ? 0 : mid;
    const ww = leftSide ? mid : w - mid;
    for (let layer = 0; layer < 9; layer += 1) {
      const band = BAND_ORDER[(layer + side * 2) % BAND_ORDER.length];
      ctx.beginPath();
      for (let x = 0; x <= ww; x += 6) {
        const gx = x0 + x;
        const shear =
          Math.sin(x * 0.014 + t * (0.35 + bands.beta * 0.8) + layer) *
            (18 + chMix * 80 + audio * 95) *
            intensity +
          Math.sin(t * (1.2 + audio * 3) + gx * 0.01) * audio * 40;
        const yy = h * (0.12 + layer * 0.095) + shear;
        if (x === 0) ctx.moveTo(gx, yy);
        else ctx.lineTo(gx, yy);
      }
      ctx.strokeStyle = rgba(BAND_COLORS[band], 0.14 + bands[band] * 0.42 + audio * 0.2);
      ctx.lineWidth = 1.2 + bands[band] * 3 + audio * 3;
      ctx.stroke();
    }
  }
  ctx.strokeStyle = `rgba(255,255,255,${0.08 + audio * 0.15})`;
  ctx.beginPath();
  ctx.moveTo(mid, 0);
  ctx.lineTo(mid, h);
  ctx.stroke();
  ctx.restore();
}

function drawSpectralCathedralAR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const floor = h * 0.9;
  const columns = 16;
  for (let i = 0; i < columns; i += 1) {
    const p = i / (columns - 1);
    const side = p < 0.5 ? -1 : 1;
    const depth = Math.abs(p - 0.5) * 2;
    const x = w * 0.5 + side * Math.pow(depth, 1.65) * w * 0.46;
    const top = h * (0.1 + depth * 0.16);
    const width = 6 + (1 - depth) * 16;
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const spike = audio * (90 + bands.gamma * 60) * intensity;
    const grad = ctx.createLinearGradient(x, top - spike, x, floor);
    grad.addColorStop(0, rgba(BAND_COLORS[band], 0.2 + audio * 0.55));
    grad.addColorStop(0.5, rgba(BAND_COLORS[band], 0.12 + bands[band] * 0.35));
    grad.addColorStop(1, rgba(BAND_COLORS[band], 0.02));
    ctx.fillStyle = grad;
    ctx.shadowBlur = 22 + audio * 55 + bands[band] * 30;
    ctx.shadowColor = rgba(BAND_COLORS[band], 0.8);
    roundRect(ctx, x - width / 2, top - spike, width, floor - top + spike, width / 2);
    ctx.fill();
  }
  const beam = ctx.createRadialGradient(w / 2, h * 0.28, 0, w / 2, h * 0.5, h * 0.65);
  beam.addColorStop(0, `rgba(255,255,255,${0.06 + audio * 0.22})`);
  beam.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, w, h);
}

function drawScanlineWavefront(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const lines = Math.floor(h / 5);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < lines; i += 1) {
    const yBase = (i / lines) * h;
    const band = BAND_ORDER[i % BAND_ORDER.length];
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const v =
        Math.sin(x * 0.008 + t * (0.5 + audio * 4 + bands.beta) + i * 0.4) *
          (6 + bands[band] * 28 + audio * 55) *
          intensity +
        channels[i % 4] * 20 * audio;
      if (x === 0) ctx.moveTo(x, yBase + v);
      else ctx.lineTo(x, yBase + v);
    }
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.1 + bands[band] * 0.35 + audio * 0.35);
    ctx.lineWidth = 0.8 + audio * 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSparkLatticeAR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const cols = 18;
  const rows = 12;
  const cellW = w / cols;
  const cellH = h / rows;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const band = BAND_ORDER[(row + col) % BAND_ORDER.length];
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const gate = bands[band] * 0.45 + channels[(row + col) % 4] * 0.35 + audio * 0.5;
      if (gate < 0.25 && audio < 0.08) continue;
      const sz = (1.5 + gate * 10 + audio * 14) * intensity;
      dot(ctx, cx, cy, sz, rgba(BAND_COLORS[band], 0.25 + gate * 0.65));
    }
  }
  ctx.restore();
}

function drawHarmonicOrbitsAR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h) * 0.12;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i += 1) {
    const band = BAND_ORDER[i];
    const orbit = base + i * Math.min(w, h) * 0.09;
    const speed = 0.22 + bands[band] * 0.5 + audio * 1.8;
    const steps = 120;
    ctx.beginPath();
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      const a = u * Math.PI * 2 + t * speed * (1 + i * 0.08) + channels[i] * 2;
      const wob = 1 + Math.sin(u * Math.PI * 8 + t + audio * 10) * 0.06 * intensity;
      const x = cx + Math.cos(a) * orbit * wob * 1.35;
      const y = cy + Math.sin(a * 1.07) * orbit * 0.72 * wob;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.2 + bands[band] * 0.45 + audio * 0.3);
    ctx.lineWidth = 1.5 + bands[band] * 4 + audio * 4;
    ctx.stroke();
  }
  ctx.restore();
}

function drawResonantMeshAR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const n = 22;
  const pts: { x: number; y: number; b: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + t * 0.06;
    const r = Math.min(w, h) * (0.28 + (i % 4) * 0.04 + bands[BAND_ORDER[i % 5]] * 0.12);
    pts.push({
      x: cx + Math.cos(a) * r * 1.2,
      y: cy + Math.sin(a * 1.1) * r * 0.75,
      b: i % BAND_ORDER.length,
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 3) {
      const a = pts[i];
      const b = pts[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < Math.min(w, h) * 0.42) {
        const band = BAND_ORDER[(a.b + b.b) % BAND_ORDER.length];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        const lw = (0.4 + (bands[band] + audio) * 3.5) * intensity * (1 - d / (Math.min(w, h) * 0.42));
        ctx.strokeStyle = rgba(BAND_COLORS[band], (1 - d / (Math.min(w, h) * 0.42)) * (0.15 + audio * 0.55));
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    }
  }
  for (const p of pts) {
    const band = BAND_ORDER[p.b];
    dot(ctx, p.x, p.y, 3 + bands[band] * 6 + audio * 8, rgba(BAND_COLORS[band], 0.5));
  }
  ctx.restore();
}

function drawCorticalLightningAR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const spokes = 16;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let s = 0; s < spokes; s += 1) {
    const a0 = (s / spokes) * Math.PI * 2 + t * 0.04;
    const band = BAND_ORDER[s % BAND_ORDER.length];
    const reach =
      Math.min(w, h) *
      (0.18 + bands.gamma * 0.35 + audio * 0.55 + channels[s % 4] * 0.2) *
      intensity;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let px = cx;
    let py = cy;
    const segs = 5 + Math.floor(audio * 8);
    for (let k = 1; k <= segs; k += 1) {
      const fk = k / segs;
      const jitter = (Math.sin(t * 8 + s + k * 3) * 18 + Math.cos(t * 11 + k)) * audio * intensity;
      px = cx + Math.cos(a0 + fk * 0.4) * reach * fk + jitter;
      py = cy + Math.sin(a0 + fk * 0.35) * reach * fk * 0.82 + jitter * 0.7;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = rgba(BAND_COLORS[band], 0.15 + bands[band] * 0.4 + audio * 0.45);
    ctx.lineWidth = 1.2 + audio * 5;
    ctx.shadowBlur = 12 + audio * 40;
    ctx.shadowColor = rgba(BAND_COLORS.gamma, 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPhaseLockLattice(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: BandVector,
  channels: number[],
  t: number,
  intensity: number,
  audio: number,
) {
  const phase = t * (0.35 + audio * 2.2);
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.018;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let grid = 0; grid < 2; grid += 1) {
    const off = grid * 0.7 + phase * (grid ? 1 : -1);
    for (let line = -14; line <= 14; line += 1) {
      const band = BAND_ORDER[(line + grid * 3 + 20) % BAND_ORDER.length];
      ctx.beginPath();
      for (let u = -80; u <= 80; u += 1) {
        const x3 = u * 0.06;
        const y3 = line * 0.14 + Math.sin(u * 0.12 + off + bands[band] * 3) * 0.35;
        const z = Math.cos(u * 0.09 + phase + audio * 5) * 0.5;
        const p = project3d(x3, y3, z, 0.55, t * 0.08 + grid * 0.4, scale * 14, cx, cy);
        if (u === -80) ctx.moveTo(p.x2, p.y2);
        else ctx.lineTo(p.x2, p.y2);
      }
      ctx.strokeStyle = rgba(BAND_COLORS[band], 0.08 + bands[band] * 0.38 + audio * 0.25);
      ctx.lineWidth = 0.9 + bands[band] * 2.5 + audio * 3;
      ctx.stroke();
    }
  }
  for (let i = 0; i < 40; i += 1) {
    const band = BAND_ORDER[i % BAND_ORDER.length];
    const x = cx + Math.sin(t * 0.3 + i + audio * 6) * w * 0.35;
    const y = cy + Math.cos(t * 0.27 + i * 0.9) * h * 0.28;
    dot(ctx, x, y, 2 + bands[band] * 5 + channels[i % 4] * 4, rgba(BAND_COLORS[band], 0.3 + audio * 0.35));
  }
  ctx.restore();
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: ConcertScene,
  bands: BandVector,
  audio: number,
) {
  const spec = concertSceneSpec(scene);
  const isAr = CONCERT_SHIFT_SCENES.some((s) => s.id === scene);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.32)";
  const hudH = isAr ? 124 : 108;
  roundRect(ctx, 24, 24, Math.min(480, w - 48), hudH, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(244,244,245,.92)";
  ctx.font = "600 22px Inter, system-ui, sans-serif";
  ctx.fillText(spec?.title ?? "Concert Visualizer", 46, 62);
  if (isAr) {
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(167,243,208,.88)";
    ctx.fillText(
      `Drive ${Math.round(audio * 100)}% · Csound RMS or simulator band-sync`,
      46,
      82,
    );
  }
  ctx.font = "12px JetBrains Mono, monospace";
  let x = 46;
  const bandY = isAr ? 106 : 98;
  for (const band of BAND_ORDER) {
    ctx.fillStyle = rgba(BAND_COLORS[band], 0.9);
    ctx.fillText(`${band.slice(0, 2).toUpperCase()} ${Math.round(bands[band] * 100)}`, x, bandY);
    x += 72;
  }
  ctx.fillStyle = "rgba(161,161,170,.75)";
  ctx.fillText("F fullscreen · H HUD · C controls · 1–9,0 scenes · ⌥1–⌥0 audio-reactive", 46, h - 28);
  ctx.restore();
}

type Particle = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  size: number;
  band: number;
};

function project3d(
  x: number,
  y: number,
  z: number,
  rotX: number,
  rotY: number,
  scale: number,
  cx: number,
  cy: number,
) {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  const depth = 1 / (1.9 - z2 * 0.42);

  return {
    x2: cx + x1 * scale * depth,
    y2: cy + y1 * scale * depth,
    depth: clamp(depth, 0.35, 1.85),
  };
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.random() * 1600,
    y: Math.random() * 900,
    angle: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 1.8,
    size: 0.8 + Math.random() * 2.8,
    band: i % BAND_ORDER.length,
  }));
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color.replace(/[\d.]+\)$/u, "0.18)"));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rgba([r, g, b]: [number, number, number], a: number) {
  return `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1)})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
