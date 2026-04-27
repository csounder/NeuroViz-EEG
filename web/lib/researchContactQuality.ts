/** Muse-layout contact hints from recent raw EEG rings (exploratory, not impedance). */

const CONTACT_KEYS = ["tp9", "af7", "af8", "tp10"] as const;
export type MuseContactKey = (typeof CONTACT_KEYS)[number];

export type MuseContactMap = Record<MuseContactKey, string>;

export function contactLabelFromSamples(values: number[]): string {
  const recent = values.slice(-128).filter((value) => Number.isFinite(value));
  if (recent.length < 16) return "No data";
  const valueRms = rms(recent) ?? 0;
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const span = max - min;
  if (valueRms < 0.5 || span < 1) return "Flat / weak";
  if (valueRms > 250 || span > 900) return "Noisy / loose";
  if (valueRms > 120 || span > 450) return "Fair";
  return "Good";
}

export function buildContactQuality(rollingRaw: number[][]): MuseContactMap {
  return CONTACT_KEYS.reduce(
    (acc, name, index) => {
      acc[name] = contactLabelFromSamples(rollingRaw[index] ?? []);
      return acc;
    },
    {} as MuseContactMap,
  );
}

/** Ordinal score for trend coloring (higher = better contact hint). */
export function contactQualityScore(label: string): number {
  if (label === "Good") return 3;
  if (label === "Fair") return 2;
  if (label.startsWith("Flat") || label.startsWith("Noisy")) return 1;
  return 0;
}

function rms(values: number[]) {
  if (!values.length) return undefined;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}
