import { describe, expect, it } from "vitest";
import {
  getRecorderEegLayout,
  inferResearchDeviceProfile,
  isMuseTwoSerialStyleName,
} from "./researchDeviceProfile";

describe("inferResearchDeviceProfile", () => {
  it("classifies Cyton vs Daisy channel counts from device name", () => {
    const cyton = inferResearchDeviceProfile({
      deviceName: "OpenBCI Cyton",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(cyton.family).toBe("openbci_cyton");
    expect(cyton.capabilities.eegChannels).toBe(8);
    expect(cyton.displayLabel).toContain("Cyton");

    const daisy = inferResearchDeviceProfile({
      deviceName: "OpenBCI Cyton Daisy",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(daisy.family).toBe("openbci_cyton");
    expect(daisy.capabilities.eegChannels).toBe(16);
  });

  it("maps simulator to four EEG channels", () => {
    const sim = inferResearchDeviceProfile({
      deviceName: "anything",
      settingsSimulator: true,
      clientSimRunning: false,
    });
    expect(sim.family).toBe("simulator");
    expect(sim.capabilities.eegChannels).toBe(4);
  });

  it("detects OpenBCI Ultra Cortex as sixteen-channel Cyton class", () => {
    const u = inferResearchDeviceProfile({
      deviceName: "OpenBCI Ultra Cortex",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(u.family).toBe("openbci_cyton");
    expect(u.capabilities.eegChannels).toBe(16);
  });

  it("detects Muse 3 as four-channel Muse with PPG capability", () => {
    const m = inferResearchDeviceProfile({
      deviceName: "Muse 3",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(m.family).toBe("muse_other");
    expect(m.capabilities.eegChannels).toBe(4);
    expect(m.capabilities.ppg).toBe(true);
  });

  it("uses Mind Monitor data path when the device name mentions Mind Monitor", () => {
    const mm = inferResearchDeviceProfile({
      deviceName: "Mind Monitor",
      eegDeviceName: "Muse S Athena",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(mm.dataPath).toBe("mind_monitor_osc");
    expect(mm.family).toBe("muse_athena");
  });

  it("treats Muse-33C1 style BLE names as Muse 2, not Athena", () => {
    expect(isMuseTwoSerialStyleName("Muse-33C1")).toBe(true);
    const p = inferResearchDeviceProfile({
      deviceName: "Muse-33C1",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(p.family).toBe("muse_other");
    expect(p.capabilities.imu).toBe(true);
    expect(p.capabilities.ppg).toBe(true);
    expect(p.capabilities.fnirs).toBe(false);
    expect(p.displayLabel).toBe("Muse-33C1");
  });

  it("accepts server-style displayName with model suffix (BLE + specs)", () => {
    const p = inferResearchDeviceProfile({
      deviceName: "Muse-33C1 (Muse 2)",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(p.family).toBe("muse_other");
    expect(p.capabilities.imu).toBe(true);
    expect(p.capabilities.ppg).toBe(true);
    expect(p.displayLabel).toBe("Muse-33C1 (Muse 2)");
  });

  it("prefers BLE serial Muse 2 when packet/eeg device string wrongly includes Athena", () => {
    const p = inferResearchDeviceProfile({
      deviceName: "Muse-33C1",
      eegDeviceName: "Muse S Athena (2025)",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(p.family).toBe("muse_other");
    expect(p.capabilities.imu).toBe(true);
    expect(p.capabilities.ppg).toBe(true);
    expect(p.capabilities.fnirs).toBe(false);
    expect(p.displayLabel).toBe("Muse-33C1");
  });

  it("still classifies real Muse 3 (not Muse-33xx serial) with PPG", () => {
    const p = inferResearchDeviceProfile({
      deviceName: "Muse 3",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(isMuseTwoSerialStyleName("Muse 3")).toBe(false);
    expect(p.capabilities.ppg).toBe(true);
  });
});

describe("getRecorderEegLayout", () => {
  it("returns eight columns for Cyton and sixteen for Daisy or Ultra Cortex", () => {
    const cyton = inferResearchDeviceProfile({
      deviceName: "Cyton",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(getRecorderEegLayout(cyton)).toEqual({
      count: 8,
      labels: ["Ch1", "Ch2", "Ch3", "Ch4", "Ch5", "Ch6", "Ch7", "Ch8"],
    });

    const daisy = inferResearchDeviceProfile({
      deviceName: "Cyton Daisy",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(getRecorderEegLayout(daisy).count).toBe(16);
    expect(getRecorderEegLayout(daisy).labels[15]).toBe("Ch16");

    const ultra = inferResearchDeviceProfile({
      deviceName: "Ultra Cortex",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(getRecorderEegLayout(ultra).count).toBe(16);
  });

  it("keeps four Muse-style labels for non-Cyton devices", () => {
    const muse = inferResearchDeviceProfile({
      deviceName: "Muse 2",
      settingsSimulator: false,
      clientSimRunning: false,
    });
    expect(muse.capabilities.imu).toBe(true);
    expect(muse.capabilities.ppg).toBe(true);
    expect(muse.capabilities.fnirs).toBe(false);
    expect(getRecorderEegLayout(muse)).toEqual({
      count: 4,
      labels: ["TP9", "AF7", "AF8", "TP10"],
    });
  });
});
