import { describe, expect, it } from "vitest";
import { BAND_NAMES } from "./types";
import { buildRecordingExportColumnSchemas, FNIRS_EXPORT_CH } from "./recorder";

describe("buildRecordingExportColumnSchemas", () => {
  it("matches snapshot for default four-channel names", () => {
    const cols = buildRecordingExportColumnSchemas(["TP9", "AF7", "AF8", "TP10"]);
    expect(cols.eeg_csv.join(",")).toMatchInlineSnapshot(
      `"t_ms,wall_ms,eeg_1,eeg_2,eeg_3,eeg_4,artifact"`,
    );
    expect(cols.annotations_csv.join(",")).toMatchInlineSnapshot(
      `"t_ms,wall_time_iso,label,detail"`,
    );
    expect(cols.bands_csv[0]).toBe("t_ms");
    expect(cols.bands_csv).toContain("rel_alpha");
    expect(cols.bands_csv).toContain("abs_gamma");
    expect(cols.bands_csv).toContain("ppg");
    expect(cols.bands_csv.filter((c) => c.startsWith("fnirs_")).length).toBe(FNIRS_EXPORT_CH);
    expect(cols.bands_csv.length).toBe(1 + BAND_NAMES.length * 2 + 1 + 3 + 3 + 1 + FNIRS_EXPORT_CH);
  });

  it("scales eeg columns with Cyton-style sixteen-channel export", () => {
    const names = Array.from({ length: 16 }, (_, i) => `Ch${i + 1}`);
    const cols = buildRecordingExportColumnSchemas(names);
    expect(cols.eeg_csv).toEqual([
      "t_ms",
      "wall_ms",
      ...Array.from({ length: 16 }, (_, i) => `eeg_${i + 1}`),
      "artifact",
    ]);
  });
});
