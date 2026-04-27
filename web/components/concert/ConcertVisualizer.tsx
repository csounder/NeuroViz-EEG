"use client";

import * as React from "react";
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
  | "limbicNebula";

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

type BandVector = Record<BandName, number>;

export function ConcertVisualizer({
  scene,
  latestBandsAbs,
  latestBandTraces,
  intensity = 1,
  trails = 0.86,
  showHud = true,
}: {
  scene: ConcertScene;
  latestBandsAbs: BandPowers | null;
  latestBandTraces: Record<BandName, number[]> | null;
  intensity?: number;
  trails?: number;
  showHud?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dataRef = React.useRef({
    latestBandsAbs,
    latestBandTraces,
    scene,
    intensity,
    trails,
    showHud,
  });

  React.useEffect(() => {
    dataRef.current = {
      latestBandsAbs,
      latestBandTraces,
      scene,
      intensity,
      trails,
      showHud,
    };
  }, [intensity, latestBandsAbs, latestBandTraces, scene, showHud, trails]);

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
      }

      if (data.showHud) drawHud(ctx, w, h, data.scene, bands);
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

function drawHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: ConcertScene,
  bands: BandVector,
) {
  const spec = CONCERT_SCENES.find((s) => s.id === scene);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.32)";
  roundRect(ctx, 24, 24, Math.min(430, w - 48), 108, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(244,244,245,.92)";
  ctx.font = "600 22px Inter, system-ui, sans-serif";
  ctx.fillText(spec?.title ?? "Concert Visualizer", 46, 62);
  ctx.font = "12px JetBrains Mono, monospace";
  let x = 46;
  for (const band of BAND_ORDER) {
    ctx.fillStyle = rgba(BAND_COLORS[band], 0.9);
    ctx.fillText(`${band.slice(0, 2).toUpperCase()} ${Math.round(bands[band] * 100)}`, x, 98);
    x += 72;
  }
  ctx.fillStyle = "rgba(161,161,170,.75)";
  ctx.fillText("Press F for fullscreen. Hide HUD in controls.", 46, h - 28);
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
