/**
 * Research-page device heuristics: Ganglion vs Muse/Athena montage, nominal Fs, sensor expectations.
 * Labels are for UX / methods copy — always confirm against your acquisition log.
 */

export type ResearchDeviceFamily =
  | "muse_athena"
  | "muse_other"
  | "openbci_ganglion"
  | "openbci_cyton"
  | "simulator"
  | "unknown";

export type ResearchDataPath = "simulator" | "mind_monitor_osc" | "direct_bridge" | "unknown";

export type ResearchCapabilities = {
  eegChannels: number;
  imu: boolean;
  ppg: boolean;
  fnirs: boolean;
  museContactTiles: boolean;
};

export type ResearchDeviceProfile = {
  family: ResearchDeviceFamily;
  displayLabel: string;
  channelLabels: [string, string, string, string];
  /** Nominal EEG sample rate (Hz) for this device class when not overridden by stream estimate. */
  nominalEegHz: number;
  capabilities: ResearchCapabilities;
  dataPath: ResearchDataPath;
  dataPathDetail: string;
  /** Recorder / PLV / metrics are 4ch-shaped even if hardware has more. */
  fourChannelUiCeiling: boolean;
};

function norm(s: string) {
  return s.toLowerCase();
}

/** True for “Muse 3” product naming — avoids matching `Muse-33C1` (contains `muse-3` as a substring). */
export function nameSuggestsMuse3(name: string): boolean {
  const lower = norm(name);
  return (
    lower.includes("muse 3") ||
    /\bmuse3\b/.test(lower) ||
    /\bmuse[-_\s]?3\b/.test(lower)
  );
}

/**
 * BLE advertisement names like `Muse-33C1` are Muse 2 hardware; LibMuse sometimes mis-reports newer enum codes.
 * Treat as Muse 2 unless the string explicitly names S / 3 / Athena.
 */
export function isMuseTwoSerialStyleName(name: string): boolean {
  const t = name.trim();
  if (!/^muse[-_]/i.test(t)) return false;
  const lower = t.toLowerCase();
  if (lower.includes("athena")) return false;
  if (nameSuggestsMuse3(lower)) return false;
  if (/\bmuse\s*s\b/.test(lower) || lower.includes("muse-s") || lower.includes("muse_s")) return false;
  if (/\bmuse\s*2\b/.test(lower) || lower.includes("muse2") || lower.includes("muse-2")) return true;
  return /^muse[-_][a-z0-9]{3,}$/i.test(t);
}

const MIND_MONITOR_DETAIL =
  "Mind Monitor → NeuroVis over OSC (UDP :5000). Supported sources: Muse 2, Muse 3, Muse S, and Muse S Athena — confirm which OSC addresses your build publishes (EEG, bands, accelerometer, PPG, optional fNIRS on Athena).";

const DIRECT_BRIDGE_DETAIL =
  "NeuroVis direct bridge / WebSocket (MuseBridge, BrainFlow Ganglion, or Cyton-class serial). Supported hardware: Muse 2, Muse 3, Muse S Athena (BLE) — each includes accelerometer, gyroscope, and PPG; fNIRS is Athena-only. Also OpenBCI Ganglion (4ch), Cyton (8ch), and Ultra Cortex / Cyton+Daisy (16ch). Optical streams need firmware + bridge forwarding where applicable.";

export function inferResearchDataPath(
  deviceName?: string | null,
  eegDeviceName?: string | null,
  simulatorMode?: boolean,
  clientSimRunning?: boolean,
): { path: ResearchDataPath; detail: string } {
  const joined = `${deviceName ?? ""} ${eegDeviceName ?? ""}`.toLowerCase();
  if (simulatorMode || clientSimRunning || joined.includes("client sim")) {
    return {
      path: "simulator",
      detail: "Synthetic stream — use for UI tests only, not publication data.",
    };
  }
  if (joined.includes("mind monitor")) {
    return {
      path: "mind_monitor_osc",
      detail: MIND_MONITOR_DETAIL,
    };
  }
  if (
    joined.includes("muse") ||
    joined.includes("openbci") ||
    joined.includes("ganglion") ||
    joined.includes("cyton") ||
    joined.includes("cortex") ||
    joined.includes("ultracortex")
  ) {
    return {
      path: "direct_bridge",
      detail: DIRECT_BRIDGE_DETAIL,
    };
  }
  return {
    path: "unknown",
    detail: "Connect a device or enable simulator to classify the ingest path.",
  };
}

export function inferResearchDeviceProfile(input: {
  deviceName: string | null | undefined;
  eegDeviceName?: string | null;
  settingsSimulator?: boolean;
  clientSimRunning?: boolean;
}): ResearchDeviceProfile {
  const { path: dataPath, detail: dataPathDetail } = inferResearchDataPath(
    input.deviceName,
    input.eegDeviceName,
    input.settingsSimulator,
    input.clientSimRunning,
  );

  const raw = `${input.deviceName ?? ""} ${input.eegDeviceName ?? ""}`;
  const n = norm(raw);

  if (input.clientSimRunning || input.settingsSimulator || n.includes("client sim")) {
    return {
      family: "simulator",
      displayLabel: "Client simulator",
      channelLabels: ["TP9", "AF7", "AF8", "TP10"],
      nominalEegHz: 256,
      capabilities: {
        eegChannels: 4,
        imu: true,
        ppg: true,
        fnirs: false,
        museContactTiles: true,
      },
      dataPath,
      dataPathDetail,
      fourChannelUiCeiling: false,
    };
  }

  if (n.includes("ganglion")) {
    return {
      family: "openbci_ganglion",
      displayLabel: raw.trim() || "OpenBCI Ganglion",
      channelLabels: ["Ch1", "Ch2", "Ch3", "Ch4"],
      nominalEegHz: 200,
      capabilities: {
        eegChannels: 4,
        imu: false,
        ppg: false,
        fnirs: false,
        museContactTiles: false,
      },
      dataPath,
      dataPathDetail,
      fourChannelUiCeiling: false,
    };
  }

  const ultraCortex =
    n.includes("ultracortex") ||
    n.includes("ultra_cortex") ||
    (n.includes("ultra") && n.includes("cortex"));
  const daisyStack = n.includes("daisy");
  const cytonClass =
    n.includes("cyton") || daisyStack || ultraCortex || (n.includes("cortex") && n.includes("openbci"));

  if (cytonClass) {
    const nEeg = ultraCortex || daisyStack ? 16 : 8;
    const defaultLabel = ultraCortex
      ? "OpenBCI Ultra Cortex (16ch)"
      : daisyStack
        ? "OpenBCI Cyton + Daisy (16ch)"
        : "OpenBCI Cyton (8ch)";
    return {
      family: "openbci_cyton",
      displayLabel: raw.trim() || defaultLabel,
      channelLabels: ["Ch1", "Ch2", "Ch3", "Ch4"],
      nominalEegHz: 250,
      capabilities: {
        eegChannels: nEeg,
        imu: false,
        ppg: false,
        fnirs: false,
        museContactTiles: false,
      },
      dataPath,
      dataPathDetail,
      fourChannelUiCeiling: true,
    };
  }

  const primaryAdvertName = (input.deviceName ?? "").trim();
  const eegPacketDeviceName = (input.eegDeviceName ?? "").trim();
  /** BLE names like Muse-33C1 must win over LibMuse / packet strings that wrongly say Athena. */
  if (
    isMuseTwoSerialStyleName(primaryAdvertName) ||
    isMuseTwoSerialStyleName(eegPacketDeviceName)
  ) {
    const displayLabel = isMuseTwoSerialStyleName(primaryAdvertName)
      ? primaryAdvertName
      : eegPacketDeviceName;
    return {
      family: "muse_other",
      displayLabel: displayLabel || "Muse 2",
      channelLabels: ["TP9", "AF7", "AF8", "TP10"],
      nominalEegHz: 256,
      capabilities: {
        eegChannels: 4,
        imu: true,
        ppg: true,
        fnirs: false,
        museContactTiles: true,
      },
      dataPath,
      dataPathDetail,
      fourChannelUiCeiling: false,
    };
  }

  if (n.includes("athena")) {
    return {
      family: "muse_athena",
      displayLabel: "Muse S Athena",
      channelLabels: ["TP9", "AF7", "AF8", "TP10"],
      nominalEegHz: 256,
      capabilities: {
        eegChannels: 4,
        imu: true,
        ppg: true,
        fnirs: true,
        museContactTiles: true,
      },
      dataPath,
      dataPathDetail,
      fourChannelUiCeiling: false,
    };
  }

  if (n.includes("muse")) {
    const serialMuse2 = isMuseTwoSerialStyleName(primaryAdvertName);
    const museS = n.includes("muse s") || n.includes("muse-s") || n.includes("muse_s");
    const muse2 =
      serialMuse2 ||
      n.includes("muse 2") ||
      n.includes("muse2") ||
      n.includes("muse-2");
    const muse3 = nameSuggestsMuse3(n);
    return {
      family: "muse_other",
      displayLabel: raw.trim() || (muse3 ? "Muse 3" : muse2 ? "Muse 2" : "Muse"),
      channelLabels: ["TP9", "AF7", "AF8", "TP10"],
      nominalEegHz: 256,
      capabilities: {
        eegChannels: 4,
        imu: true,
        ppg: muse2 || muse3 || museS,
        fnirs: false,
        museContactTiles: true,
      },
      dataPath,
      dataPathDetail,
      fourChannelUiCeiling: false,
    };
  }

  return {
    family: "unknown",
    displayLabel: raw.trim() || "Unknown device",
    channelLabels: ["Ch1", "Ch2", "Ch3", "Ch4"],
    nominalEegHz: 256,
    capabilities: {
      eegChannels: 4,
      imu: false,
      ppg: false,
      fnirs: false,
      museContactTiles: false,
    },
    dataPath,
    dataPathDetail,
    fourChannelUiCeiling: false,
  };
}

export function sensorRowState(
  expected: boolean,
  hasRecentData: boolean,
): "active" | "unsupported" | "waiting" {
  if (!expected) return "unsupported";
  if (hasRecentData) return "active";
  return "waiting";
}

/** Ganglion-class (and similar): no IMU, PPG, or fNIRS in NeuroVis — collapse non-EEG widgets. */
export function isEegOnlyResearchHardware(profile: ResearchDeviceProfile): boolean {
  return !profile.capabilities.imu && !profile.capabilities.ppg && !profile.capabilities.fnirs;
}

const RECORDER_EEG_MAX = 16;

/**
 * Session recorder column count + labels. Cyton / Daisy / Ultra Cortex uses hardware channel count (8 or 16);
 * all other profiles stay at four columns for UI/band alignment.
 */
export function getRecorderEegLayout(profile: ResearchDeviceProfile): {
  count: number;
  labels: string[];
} {
  if (profile.family === "openbci_cyton") {
    const c = Math.min(RECORDER_EEG_MAX, Math.max(4, profile.capabilities.eegChannels));
    return {
      count: c,
      labels: Array.from({ length: c }, (_, i) => `Ch${i + 1}`),
    };
  }
  return { count: 4, labels: [...profile.channelLabels] };
}

/**
 * Same headset (e.g. Muse S Athena) can feed NeuroVis via direct WebSocket/BLE bridge or Mind Monitor OSC.
 * This resolves what the UI should emphasize for methods-grade clarity.
 */
export type ActiveIngestKind =
  | "simulator"
  | "mind_monitor"
  | "direct_bridge"
  | "hybrid"
  | "osc_mode_waiting"
  | "unknown";

export function resolveActiveIngestPath(input: {
  profile: ResearchDeviceProfile;
  /** App setting: forward Mind Monitor–style OSC into the client. */
  mindMonitorMode: boolean;
  mindMonitorOscAddressCount: number;
  live: boolean;
}): {
  kind: ActiveIngestKind;
  /** Short badge label for the UI */
  label: string;
  badgeTone: "emerald" | "indigo" | "amber" | "neutral";
  /** One sentence for methods / tooltips */
  methodsNote: string;
} {
  const { profile, mindMonitorMode, mindMonitorOscAddressCount: oscN, live } = input;
  if (profile.dataPath === "simulator") {
    return {
      kind: "simulator",
      label: "Simulator",
      badgeTone: "amber",
      methodsNote: "Synthetic stream for UI testing — not a hardware acquisition path.",
    };
  }

  const nameHintsOsc = profile.dataPath === "mind_monitor_osc";
  const nameHintsDirect = profile.dataPath === "direct_bridge";
  const oscReceiving = mindMonitorMode && oscN > 0 && live;

  if (nameHintsOsc && !nameHintsDirect) {
    return {
      kind: "mind_monitor",
      label: "Mind Monitor OSC",
      badgeTone: "indigo",
      methodsNote:
        "Mind Monitor OSC path — typical for Muse 2, Muse 3, Muse S, or Muse S Athena; confirm EEG, bands, motion, PPG, and (Athena) optical streams on the OSC address list.",
    };
  }

  if (nameHintsDirect && mindMonitorMode && oscReceiving) {
    return {
      kind: "hybrid",
      label: "OSC + direct bridge",
      badgeTone: "amber",
      methodsNote:
        "Mind Monitor OSC is receiving packets while a direct WebSocket/bridge path may also be active — state in methods which stack supplied EEG vs PPG/fNIRS for each analysis.",
    };
  }

  if (nameHintsDirect && mindMonitorMode && !oscReceiving) {
    return {
      kind: "osc_mode_waiting",
      label: "OSC mode · no packets yet",
      badgeTone: "indigo",
      methodsNote:
        "Mind Monitor mode is enabled but no OSC addresses have been seen — if you intend OSC-only acquisition, confirm UDP :5000 and firewall routing.",
    };
  }

  if (nameHintsDirect) {
    return {
      kind: "direct_bridge",
      label: "Direct bridge",
      badgeTone: "emerald",
      methodsNote:
        "WebSocket / NeuroVis bridge path — Muse 2/3/S/Athena (BLE), Ganglion (4ch), or Cyton-class boards (8–16ch). Athena PPG/fNIRS need firmware + bridge support on this path (vs Mind Monitor forwarding).",
    };
  }

  return {
    kind: "unknown",
    label: "Path unknown",
    badgeTone: "neutral",
    methodsNote: profile.dataPathDetail,
  };
}
