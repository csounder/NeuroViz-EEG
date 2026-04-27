import type { BandPowers } from "./types";

export type ResearchEventSource =
  | "keyboard"
  | "marker"
  | "osc"
  | "api"
  | "ui"
  /** Stimulus-aligned lab: marker tied to decoded audio timeline */
  | "stimulus"
  /** Injected via POST /api/research-event on the Node bridge */
  | "http"
  /** Forwarded from neurovis-server.py or another upstream tool */
  | "bridge";

export type ResearchEventLog = {
  id: string;
  wallMs: number;
  label: string;
  detail?: string;
  source: ResearchEventSource;
  /** Position in loaded stimulus audio (ms), when applicable. */
  audioPositionMs?: number;
};

/** One row of the in-browser research stream (~WebSocket EEG rate + last known bands). */
export type ResearchStreamSample = {
  wallMs: number;
  eeg: [number, number, number, number];
  bandsRel: BandPowers | null;
  bandsAbs: BandPowers | null;
  /** Last optical PPG samples at this EEG tick (vendor layout). */
  ppg?: number[] | null;
  /** Last fNIRS / optical aux samples (e.g. Athena multi-λ). */
  fnirs?: number[] | null;
};

export const RESEARCH_TIMELINE_MAX = 9000;
export const RESEARCH_EVENTS_MAX = 250;

export type ResearchEyesContext = "unspecified" | "open" | "closed";

/** High-rate stimulus clock from WS/HTTP relay (kept separate from `researchEvents` ring). */
export type StimulusClockSnapshot = {
  wallMs: number;
  audioPositionMs: number;
  detail?: string;
  source: ResearchEventSource;
};
