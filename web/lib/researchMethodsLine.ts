import type { EegTraceSource } from "./types";
import type { ResearchDeviceProfile } from "./researchDeviceProfile";
import { resolveActiveIngestPath } from "./researchDeviceProfile";

/** Single paragraph for methods / README: device, montage, nominal vs observed Fs, trace path. */
export function buildMethodsSamplingParagraph(input: {
  profile: ResearchDeviceProfile;
  estimatedEegHz: number | null;
  eegTraceSource: EegTraceSource;
  deviceName: string | null;
  live: boolean;
  mindMonitorMode?: boolean;
  mindMonitorOscAddressCount?: number;
}): string {
  const {
    profile,
    estimatedEegHz,
    eegTraceSource,
    deviceName,
    live,
    mindMonitorMode = false,
    mindMonitorOscAddressCount = 0,
  } = input;
  const obs =
    estimatedEegHz != null && Number.isFinite(estimatedEegHz)
      ? `${estimatedEegHz.toFixed(1)} Hz (estimated from inter-arrival times in this browser session)`
      : "not yet estimated (start streaming)";
  const nom = profile.nominalEegHz;
  const div =
    estimatedEegHz != null && estimatedEegHz < nom * 0.78
      ? ` Observed rate is below nominal ${nom} Hz — note possible WebSocket throttling, Wi‑Fi, or bridge configuration.`
      : "";
  const ch = profile.channelLabels.join(", ");
  const dev = deviceName || profile.displayLabel;
  const path = profile.dataPath.replace(/_/g, " ");
  const active = resolveActiveIngestPath({
    profile,
    mindMonitorMode,
    mindMonitorOscAddressCount,
    live,
  });
  const cardio =
    profile.capabilities.ppg && profile.capabilities.museContactTiles
      ? " Interval variability metrics are PPG-HRV-style (optical inter-beat timing), not ECG-HRV — label accordingly in methods."
      : "";
  const ganglion =
    profile.family === "openbci_ganglion"
      ? " OpenBCI Ganglion: four EEG columns are labeled Ch1–Ch4 in exports — map each to scalp position and reference in methods; nominal board rate is typically 200 Hz via BrainFlow/OpenBCI stack. No on-board IMU or optical sensors in this UI path."
      : "";
  const cytonGap =
    profile.family === "openbci_cyton"
      ? " Cyton / Daisy / Ultra Cortex: the in-browser session recorder exports eight or sixteen EEG columns when the device name detects an 8ch board, Daisy stack, or Ultra Cortex; most on-page Research metrics still use the first four columns — document full pin mapping in methods."
      : "";
  return (
    `EEG was acquired with ${dev} (${profile.displayLabel}). ` +
    `Montage: four EEG sites labeled ${ch} in software (verify physical placement in lab notes). ` +
    `Nominal sampling rate: ${nom} Hz; observed ingest: ${obs}.${div} ` +
    `NeuroVis EEG trace mode: ${eegTraceSource}. ` +
    `Name-based data path hint: ${path}. ` +
    `Active ingest note: ${active.methodsNote}` +
    cardio +
    ganglion +
    cytonGap +
    ` ` +
    (live ? "Session live at export of this text." : "Stream offline when this text was generated.")
  );
}
