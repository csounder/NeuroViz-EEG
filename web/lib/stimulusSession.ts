"use client";

/**
 * Stimulus-aligned session: file decode + transport, live line-in (USB interface),
 * timeline events, optional archive recording — shares wall clock with session recorder.
 */

export type StimulusTransportKind =
  | "file_load"
  | "live_input_start"
  | "live_input_stop"
  | "play"
  | "pause"
  | "stop"
  | "seek"
  | "recording_bind";

export type StimulusTimelineEvent = {
  wallMs: number;
  kind: StimulusTransportKind;
  /** File: offset in decoded audio (ms). Live: monotonic ms since live_input_start (wall). */
  audioPositionMs: number;
  contextTime?: number;
  detail?: string;
};

export type StimulusManifestSlice = {
  reference?: {
    mode?: "file" | "live_line_in";
    fileName?: string;
    durationSec?: number;
    sampleRate?: number;
    numberOfChannels?: number;
    byteLength?: number;
    liveDeviceId?: string;
    liveDeviceLabel?: string;
  };
  timeline: StimulusTimelineEvent[];
  mic?: {
    recorded: boolean;
    mimeType: string;
    wallMsStarted?: number;
    wallMsStopped?: number;
    note: string;
  };
};

type Listener = () => void;

const TRANSPORT_TICK_KINDS = new Set<StimulusTransportKind>([
  "play",
  "pause",
  "seek",
  "stop",
]);

function pushEvent(
  events: StimulusTimelineEvent[],
  e: Omit<StimulusTimelineEvent, "wallMs"> & { wallMs?: number },
) {
  events.push({
    wallMs: e.wallMs ?? Date.now(),
    kind: e.kind,
    audioPositionMs: e.audioPositionMs,
    contextTime: e.contextTime,
    detail: e.detail,
  });
}

export class StimulusSessionController {
  private listeners = new Set<Listener>();
  private audioContext: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private fileName: string | null = null;
  private fileByteLength: number | undefined;
  private peaks: Float32Array = new Float32Array(0);

  private source: AudioBufferSourceNode | null = null;
  private pausedAtSec = 0;
  private playStartedCtxTime = 0;
  private playing = false;

  private events: StimulusTimelineEvent[] = [];
  private recordingAnchorWallMs: number | null = null;
  /** Stimulus clock (ms) at last `recording_bind` — for live readout Δ. */
  private stimulusPositionAtRecordingBind: number | null = null;

  /** Live line-in */
  private liveStream: MediaStream | null = null;
  private liveSourceNode: MediaStreamAudioSourceNode | null = null;
  private liveAnalyser: AnalyserNode | null = null;
  private liveGain: GainNode | null = null;
  private liveDeviceId: string | null = null;
  private liveDeviceLabel: string | null = null;
  /** Kept after monitor stops so `exportManifestSlice()` still names the interface. */
  private manifestLiveRef: { id: string; label: string } | null = null;
  /** Wall ms when live monitoring started; stimulus clock = Date.now() - anchor. */
  private liveWallAnchorMs: number | null = null;
  private liveMonitorToSpeakers = true;

  private micStreamOwned: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private micChunks: BlobPart[] = [];
  private micMime = "";
  private micWallStart: number | null = null;
  private micWallStop: number | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn();
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  getPeaks(): Float32Array {
    return this.peaks;
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  getFileName(): string | null {
    return this.fileName;
  }

  getDurationSec(): number {
    return this.buffer?.duration ?? 0;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isLiveMonitorActive(): boolean {
    return this.liveStream != null && this.liveAnalyser != null;
  }

  getMode(): "none" | "file" | "live" {
    if (this.liveWallAnchorMs != null) return "live";
    if (this.buffer) return "file";
    return "none";
  }

  getLiveDeviceInfo(): { id: string; label: string } | null {
    if (!this.liveDeviceId) return null;
    return { id: this.liveDeviceId, label: this.liveDeviceLabel ?? this.liveDeviceId };
  }

  /** Max abs sample per column for live waveform (0..1 typical). */
  sampleLiveWaveform(columns: number): Float32Array {
    if (!this.liveAnalyser || columns < 2) return new Float32Array(0);
    const n = this.liveAnalyser.fftSize;
    const td = new Float32Array(n);
    this.liveAnalyser.getFloatTimeDomainData(td);
    const out = new Float32Array(columns);
    const block = Math.max(1, Math.floor(n / columns));
    for (let c = 0; c < columns; c++) {
      let p = 0;
      const start = c * block;
      const end = Math.min(n, start + block);
      for (let i = start; i < end; i++) {
        const v = Math.abs(td[i] ?? 0);
        if (v > p) p = v;
      }
      out[c] = p;
    }
    return out;
  }

  static async enumerateAudioInputs(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audioinput");
  }

  /** Request permission + refresh labels (call after user gesture). */
  static async ensureAudioInputPermission(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  }

  getEvents(): StimulusTimelineEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  getTransportTickEvents(): StimulusTimelineEvent[] {
    return this.events.filter((e) => TRANSPORT_TICK_KINDS.has(e.kind));
  }

  getCurrentAudioPositionMs(): number {
    if (this.liveWallAnchorMs != null) {
      return Math.max(0, Date.now() - this.liveWallAnchorMs);
    }
    if (!this.buffer) return 0;
    const dur = this.buffer.duration * 1000;
    if (this.playing && this.audioContext) {
      const elapsed = (this.audioContext.currentTime - this.playStartedCtxTime) * 1000;
      return Math.min(dur, this.pausedAtSec * 1000 + elapsed);
    }
    return Math.min(dur, this.pausedAtSec * 1000);
  }

  /** ms since stimulus clock at recording_bind (null if not bound). */
  getStimulusOffsetSinceRecordingBind(): number | null {
    if (this.stimulusPositionAtRecordingBind == null) return null;
    return this.getCurrentAudioPositionMs() - this.stimulusPositionAtRecordingBind;
  }

  getRecordingAnchorWallMs(): number | null {
    return this.recordingAnchorWallMs;
  }

  setRecordingAnchorWallMs(ms: number | null) {
    this.recordingAnchorWallMs = ms;
    if (ms != null) {
      this.stimulusPositionAtRecordingBind = this.getCurrentAudioPositionMs();
      pushEvent(this.events, {
        kind: "recording_bind",
        audioPositionMs: this.stimulusPositionAtRecordingBind,
        detail: `recording_anchor_wall_ms=${ms}`,
      });
      this.emit();
    }
  }

  async ensureContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  private stopLiveInternal(logStop: boolean) {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
      this.mediaRecorder = null;
    }
    if (this.liveSourceNode) {
      try {
        this.liveSourceNode.disconnect();
      } catch {
        /* ignore */
      }
      this.liveSourceNode = null;
    }
    if (this.liveAnalyser) {
      try {
        this.liveAnalyser.disconnect();
      } catch {
        /* ignore */
      }
      this.liveAnalyser = null;
    }
    if (this.liveGain) {
      try {
        this.liveGain.disconnect();
      } catch {
        /* ignore */
      }
      this.liveGain = null;
    }
    if (this.liveStream) {
      this.liveStream.getTracks().forEach((t) => t.stop());
      this.liveStream = null;
    }
    const pos = this.liveWallAnchorMs != null ? this.getCurrentAudioPositionMs() : 0;
    this.liveWallAnchorMs = null;
    this.liveDeviceId = null;
    this.liveDeviceLabel = null;
    /* manifestLiveRef retained for export */
    if (logStop) {
      pushEvent(this.events, {
        kind: "live_input_stop",
        audioPositionMs: pos,
        detail: "monitor_stopped",
      });
    }
    this.emit();
  }

  /**
   * Live line-in / USB interface: opens selected device, optional monitor to speakers, rolling waveform via analyser.
   */
  async startLiveInput(deviceId: string | undefined, opts?: { monitorToSpeakers?: boolean }): Promise<void> {
    await this.stopPlaybackInternal(false);
    this.clearFileInternal();
    if (this.liveStream) this.stopLiveInternal(false);

    const ctx = await this.ensureContext();
    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        : {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getAudioTracks()[0];
    const devId = track?.getSettings?.().deviceId ?? deviceId ?? "";
    const label = track?.label ?? devId ?? "Audio input";

    this.liveStream = stream;
    this.liveDeviceId = devId || null;
    this.liveDeviceLabel = label;
    this.manifestLiveRef = { id: devId || "unknown", label };
    this.liveWallAnchorMs = Date.now();
    this.liveMonitorToSpeakers = opts?.monitorToSpeakers !== false;

    this.liveSourceNode = ctx.createMediaStreamSource(stream);
    this.liveAnalyser = ctx.createAnalyser();
    this.liveAnalyser.fftSize = 2048;
    this.liveAnalyser.smoothingTimeConstant = 0.35;
    this.liveGain = ctx.createGain();
    this.liveGain.gain.value = this.liveMonitorToSpeakers ? 1 : 0;

    this.liveSourceNode.connect(this.liveAnalyser);
    this.liveAnalyser.connect(this.liveGain);
    this.liveGain.connect(ctx.destination);

    this.events = [];
    pushEvent(this.events, {
      kind: "live_input_start",
      audioPositionMs: 0,
      detail: label,
    });
    this.emit();
  }

  setLiveMonitorMuted(muted: boolean) {
    if (this.liveGain) {
      this.liveGain.gain.value = muted ? 0 : 1;
      this.liveMonitorToSpeakers = !muted;
    }
  }

  stopLiveInput() {
    if (!this.liveStream) return;
    this.stopLiveInternal(true);
  }

  async loadFile(file: File): Promise<void> {
    this.manifestLiveRef = null;
    this.stopLiveInternal(false);
    await this.stopPlaybackInternal(false);
    const ctx = await this.ensureContext();
    const ab = await file.arrayBuffer();
    this.fileByteLength = ab.byteLength;
    this.buffer = await ctx.decodeAudioData(ab.slice(0));
    this.fileName = file.name;
    this.pausedAtSec = 0;
    this.peaks = computePeaks(this.buffer, 4000);
    this.events = [];
    pushEvent(this.events, {
      kind: "file_load",
      audioPositionMs: 0,
      detail: file.name,
    });
    this.emit();
  }

  clearFile() {
    this.stopLiveInternal(false);
    this.clearFileInternal();
  }

  private clearFileInternal() {
    this.stopPlaybackInternal(false);
    this.buffer = null;
    this.fileName = null;
    this.fileByteLength = undefined;
    this.peaks = new Float32Array(0);
    this.pausedAtSec = 0;
    this.manifestLiveRef = null;
    this.events = [];
    this.emit();
  }

  async play(): Promise<void> {
    if (!this.buffer) return;
    const ctx = await this.ensureContext();
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* ignore */
      }
      this.source.disconnect();
      this.source = null;
    }
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(ctx.destination);
    this.playStartedCtxTime = ctx.currentTime;
    this.source.start(0, this.pausedAtSec);
    this.playing = true;
    this.source.onended = () => {
      if (!this.playing || !this.buffer) return;
      this.pausedAtSec = this.buffer.duration;
      this.playing = false;
      this.source = null;
      pushEvent(this.events, {
        kind: "stop",
        audioPositionMs: this.buffer.duration * 1000,
        contextTime: ctx.currentTime,
        detail: "ended",
      });
      this.emit();
    };
    pushEvent(this.events, {
      kind: "play",
      audioPositionMs: this.pausedAtSec * 1000,
      contextTime: ctx.currentTime,
    });
    this.emit();
  }

  pause(): void {
    if (!this.audioContext || !this.buffer || !this.playing) return;
    const ctx = this.audioContext;
    const add = ctx.currentTime - this.playStartedCtxTime;
    this.pausedAtSec += add;
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* ignore */
      }
      this.source.disconnect();
      this.source = null;
    }
    this.playing = false;
    pushEvent(this.events, {
      kind: "pause",
      audioPositionMs: Math.min(this.buffer.duration * 1000, this.pausedAtSec * 1000),
      contextTime: ctx.currentTime,
    });
    this.emit();
  }

  stop(): void {
    this.stopPlaybackInternal(true);
  }

  private stopPlaybackInternal(logStop: boolean) {
    if (this.source && this.audioContext) {
      try {
        this.source.stop();
      } catch {
        /* ignore */
      }
      this.source.disconnect();
      this.source = null;
    }
    this.playing = false;
    this.pausedAtSec = 0;
    if (logStop && this.buffer) {
      pushEvent(this.events, {
        kind: "stop",
        audioPositionMs: 0,
        detail: "user_stop",
      });
      this.emit();
    }
  }

  setPositionRatioSilent(r: number): void {
    if (!this.buffer) return;
    const ratio = Math.max(0, Math.min(1, r));
    this.pausedAtSec = ratio * this.buffer.duration;
    this.emit();
  }

  logSeekCommit(detail = "scrub"): void {
    if (!this.buffer) return;
    pushEvent(this.events, {
      kind: "seek",
      audioPositionMs: this.pausedAtSec * 1000,
      detail,
    });
    this.emit();
  }

  seekRatio(r: number, opts?: { log?: boolean }): void {
    if (!this.buffer) return;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    const ratio = Math.max(0, Math.min(1, r));
    this.pausedAtSec = ratio * this.buffer.duration;
    if (opts?.log !== false) {
      pushEvent(this.events, {
        kind: "seek",
        audioPositionMs: this.pausedAtSec * 1000,
        detail: `ratio=${ratio.toFixed(4)}`,
      });
    }
    this.emit();
  }

  exportManifestSlice(): StimulusManifestSlice | undefined {
    if (!this.buffer && this.events.length === 0 && this.micWallStart == null) return undefined;
    const slice: StimulusManifestSlice = {
      timeline: this.getEvents(),
    };
    if (this.buffer && this.fileName) {
      slice.reference = {
        mode: "file",
        fileName: this.fileName,
        durationSec: this.buffer.duration,
        sampleRate: this.buffer.sampleRate,
        numberOfChannels: this.buffer.numberOfChannels,
        byteLength: this.fileByteLength,
      };
    } else if (this.manifestLiveRef) {
      slice.reference = {
        mode: "live_line_in",
        liveDeviceId: this.manifestLiveRef.id,
        liveDeviceLabel: this.manifestLiveRef.label,
        sampleRate: this.audioContext?.sampleRate,
      };
    }
    if (this.micWallStart != null) {
      slice.mic = {
        recorded: this.micChunks.length > 0,
        mimeType: this.micMime || "audio/webm",
        wallMsStarted: this.micWallStart,
        wallMsStopped: this.micWallStop ?? undefined,
        note:
          "Performance / line-in archive (or room mic) is a separate download. For live monitor, archive uses the same MediaStream as the selected USB / interface input when monitoring is active.",
      };
    }
    return slice;
  }

  clearTimelineForNewSession() {
    this.events = [];
    this.recordingAnchorWallMs = null;
    this.stimulusPositionAtRecordingBind = null;
    this.emit();
  }

  trimEventsForNewRecording() {
    this.events = this.events.filter(
      (e) => e.kind === "file_load" || e.kind === "live_input_start",
    );
    this.recordingAnchorWallMs = null;
    this.stimulusPositionAtRecordingBind = null;
    this.emit();
  }

  /**
   * Record performance audio: uses the live monitor stream if active; otherwise opens the default mic (legacy).
   */
  async startLineArchiveRecording(deviceId?: string): Promise<void> {
    if (this.mediaRecorder?.state === "recording") return;

    let stream = this.liveStream;
    if (!stream) {
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? {
              deviceId: { exact: deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : true,
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micStreamOwned = stream;
    }

    this.micChunks = [];
    let recOpts: MediaRecorderOptions | undefined;
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      this.micMime = "audio/webm;codecs=opus";
      recOpts = { mimeType: this.micMime };
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      this.micMime = "audio/webm";
      recOpts = { mimeType: this.micMime };
    } else {
      this.micMime = "audio/webm";
      recOpts = undefined;
    }
    this.mediaRecorder = recOpts ? new MediaRecorder(stream, recOpts) : new MediaRecorder(stream);
    if (!recOpts) this.micMime = this.mediaRecorder.mimeType || "audio/webm";
    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size) this.micChunks.push(ev.data);
    };
    this.micWallStart = Date.now();
    this.micWallStop = null;
    this.mediaRecorder.start(250);
    this.emit();
  }

  stopLineArchiveRecording(): Blob | null {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      if (this.micStreamOwned) {
        this.micStreamOwned.getTracks().forEach((t) => t.stop());
        this.micStreamOwned = null;
      }
      return null;
    }
    this.micWallStop = Date.now();
    this.mediaRecorder.stop();
    this.mediaRecorder = null;
    if (this.micStreamOwned) {
      this.micStreamOwned.getTracks().forEach((t) => t.stop());
      this.micStreamOwned = null;
    }
    const blob = new Blob(this.micChunks, { type: this.micMime });
    this.micChunks = [];
    this.emit();
    return blob.size ? blob : null;
  }

  /** @deprecated Use startLineArchiveRecording */
  async startMic(): Promise<void> {
    return this.startLineArchiveRecording();
  }

  /** @deprecated Use stopLineArchiveRecording */
  stopMic(): Blob | null {
    return this.stopLineArchiveRecording();
  }

  getLineArchiveActive(): boolean {
    return this.mediaRecorder != null && this.mediaRecorder.state === "recording";
  }

  getMicActive(): boolean {
    return this.getLineArchiveActive();
  }
}

function computePeaks(buf: AudioBuffer, segments: number): Float32Array {
  const ch0 = buf.getChannelData(0);
  const n = ch0.length;
  const out = new Float32Array(segments);
  const block = Math.max(1, Math.floor(n / segments));
  for (let s = 0; s < segments; s++) {
    const start = s * block;
    const end = Math.min(n, start + block);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(ch0[i] ?? 0);
      if (v > peak) peak = v;
    }
    out[s] = peak;
  }
  return out;
}

export const stimulusSession = new StimulusSessionController();
