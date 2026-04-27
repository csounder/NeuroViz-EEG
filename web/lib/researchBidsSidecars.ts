/**
 * Minimal BIDS-EEG–style sidecars for CSV exports (not a full BIDS dataset).
 * https://bids-specification.readthedocs.io/en/stable/04-modality-specific-files/03-electroencephalography.html
 */

export function buildChannelsTsv(channelNames: string[], samplingFrequency: number): string {
  const lines = ["name\ttype\tunits\tsampling_frequency"];
  for (const name of channelNames) {
    lines.push(`${name}\tEEG\tuV\t${samplingFrequency}`);
  }
  return lines.join("\n");
}

export function buildEegJsonBidsStub(input: {
  taskName: string;
  samplingFrequency: number;
  eegChannelCount: number;
  eegReferenceNote: string;
  channelNames: string[];
  softwareNote: string;
  powerLineHz?: 50 | 60;
}): Record<string, unknown> {
  return {
    TaskName: input.taskName,
    SamplingFrequency: input.samplingFrequency,
    EEGChannelCount: input.eegChannelCount,
    EEGReference: input.eegReferenceNote,
    SoftwareFilters: input.softwareNote,
    PowerLineFrequency: input.powerLineHz ?? 60,
    EEGChannelNames: input.channelNames,
    NeuroVisNote:
      "Stub sidecar for alignment with BIDS-EEG. Pair with channels.tsv; complete dataset layout (participants.json, etc.) is the user’s responsibility.",
  };
}
