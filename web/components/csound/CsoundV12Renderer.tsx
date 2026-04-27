"use client";

import * as React from "react";
import { Activity, AlertTriangle, Music2, Power, Square, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import type { BandName, BandPowers, EEGMessage } from "@/lib/types";
import type { CsoundObj } from "@csound/browser";

const BAND_INDEX: Record<BandName, number> = {
  delta: 0,
  theta: 1,
  alpha: 2,
  beta: 3,
  gamma: 4,
};

const MIDI_NOTES = [
  { label: "C2", note: 48 },
  { label: "D2", note: 50 },
  { label: "F2", note: 53 },
  { label: "G2", note: 55 },
  { label: "C3", note: 60 },
];

const LAUNCHKEY_DEFAULT_START_NOTE = 48;
const LAUNCHKEY_KEY_COUNT = 25;
const LAUNCHKEY_CC_NUMBERS = [21, 22, 23, 24, 25, 26, 27, 28];
const ASCII_KEYBOARD_OFFSETS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
  "'": 17,
};
const MIDI_SUSTAIN_INSTR_BASE = 1000;

const SOUND_PRESETS = [
  { id: 0, label: "Mellow Pad", description: "Soft, rounded, slow-release concert pad." },
  { id: 1, label: "Glass Choir", description: "Bright upper partials and airy shimmer." },
  { id: 2, label: "Dark Hybrid", description: "Lower, weightier tone with beta-driven edge." },
  { id: 3, label: "Huge Stage", description: "Wide, dramatic, projection-friendly chord tone." },
  { id: 4, label: "Meditative", description: "Gentle, long envelopes for slow brainwave music." },
  { id: 5, label: "Frenetic", description: "Shorter, brighter articulation for active sections." },
];

const ORCHESTRA_MODELS = [
  {
    id: 0,
    label: "01 Raw EEG Pitch Lab",
    description: "Clear teaching model: raw Muse channels gently bend warm pitches.",
  },
  {
    id: 1,
    label: "02 Band Power Organ",
    description: "Delta through gamma become a slow five-register harmonic organ.",
  },
  {
    id: 2,
    label: "03 Sensor Quartet",
    description: "Raw EEG, band power, accelerometer, and gyro each play a musical role.",
  },
  {
    id: 3,
    label: "04 Heart / Motion Temple",
    description: "PPG and movement shape pulsing resonance and spacious drones.",
  },
  {
    id: 4,
    label: "05 V12 Concert Pad",
    description: "The current MIDI-playable V12-inspired concert sonification.",
  },
  {
    id: 5,
    label: "06 Beyond V12 Generative",
    description: "More autonomous musical texture with EEG-shaped harmony and color.",
  },
];

const SENSOR_STREAMS = [
  { id: "raw", label: "Raw EEG" },
  { id: "bands", label: "Bands" },
  { id: "accel", label: "Accel" },
  { id: "gyro", label: "Gyro" },
  { id: "ppg", label: "Heart / PPG" },
  { id: "fnirs", label: "fNIRS" },
] as const;

type SensorStreamId = (typeof SENSOR_STREAMS)[number]["id"];

type MotionStreams = {
  accel: number[] | null;
  gyro: number[] | null;
  ppg: number[] | null;
  fnirs?: number[] | null;
};

type MidiInputInfo = {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
};

type AudioOutputInfo = {
  id: string;
  label: string;
};

type AudioContextWithSink = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type RuntimeCsound = CsoundObj & {
  compileCSD?: (csd: string, mode?: number) => Promise<number> | number;
  compileCsdText?: (csd: string) => Promise<number> | number;
  perform?: () => Promise<number> | number;
  cleanup?: () => Promise<number> | number;
};

export interface V12RenderControls {
  harmonyBand: BandName;
  bassDriver: BandName;
  melodyDriver: BandName;
  rhythmDriver: BandName;
  registerDriver: BandName;
  responseMode: number;
  orchestration: number;
  motion: number;
  palette: number;
  cc1Mode: "volume" | "complexity";
  melodyVolume: number;
  melodyComplexity: number;
}

export function CsoundV12Renderer({
  controls,
  latestEEG,
  latestBandsAbs,
  latestBandTraces,
  motion,
  batteryPct,
}: {
  controls: V12RenderControls;
  latestEEG?: EEGMessage | null;
  latestBandsAbs: BandPowers | null;
  latestBandTraces: Record<BandName, number[]> | null;
  motion?: MotionStreams | null;
  batteryPct?: number | null;
}) {
  const csoundRef = React.useRef<CsoundObj | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const midiAccessRef = React.useRef<MIDIAccess | null>(null);
  const lastCcLogRef = React.useRef(0);
  const activeSustainedNotesRef = React.useRef<Set<number>>(new Set());
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "compiled" | "running" | "paused" | "error"
  >("idle");
  const [logs, setLogs] = React.useState<string[]>([]);
  const [globalVolume, setGlobalVolume] = React.useState(0.618);
  const [metroScale, setMetroScale] = React.useState(0.25);
  const [chordRange, setChordRange] = React.useState(12);
  const [orchestraModel, setOrchestraModel] = React.useState(4);
  const [soundPreset, setSoundPreset] = React.useState(0);
  const [melodyOn, setMelodyOn] = React.useState(true);
  const [printDashboard, setPrintDashboard] = React.useState(false);
  const [launchkeyStartNote, setLaunchkeyStartNote] = React.useState(LAUNCHKEY_DEFAULT_START_NOTE);
  const [cc1Value, setCc1Value] = React.useState(0.64);
  const [pitchBendValue, setPitchBendValue] = React.useState(0);
  const [launchkeyCcs, setLaunchkeyCcs] = React.useState<Record<number, number>>(() =>
    LAUNCHKEY_CC_NUMBERS.reduce(
      (acc, cc) => {
        acc[cc] = 0;
        return acc;
      },
      {} as Record<number, number>,
    ),
  );
  const [soloSensor, setSoloSensor] = React.useState<SensorStreamId | null>(null);
  const [mutedSensors, setMutedSensors] = React.useState<Set<SensorStreamId>>(() => new Set());
  const [heldNotes, setHeldNotes] = React.useState<Set<number>>(() => new Set());
  const [midiStatus, setMidiStatus] = React.useState<
    "idle" | "unsupported" | "requesting" | "ready" | "error"
  >("idle");
  const [midiInputs, setMidiInputs] = React.useState<MidiInputInfo[]>([]);
  const [selectedMidiInputId, setSelectedMidiInputId] = React.useState("");
  const [audioOutputs, setAudioOutputs] = React.useState<AudioOutputInfo[]>([]);
  const [selectedAudioOutputId, setSelectedAudioOutputId] = React.useState("default");
  const [audioOutputStatus, setAudioOutputStatus] = React.useState<
    "default" | "ready" | "unsupported" | "error"
  >("default");

  const appendLog = React.useCallback((line: string) => {
    const cleaned = line.trimEnd();
    if (!cleaned) return;
    setLogs((prev) => [...prev.slice(-79), cleaned]);
  }, []);

  const sensorGains = React.useMemo(() => {
    return SENSOR_STREAMS.reduce(
      (acc, stream) => {
        acc[stream.id] = soloSensor
          ? soloSensor === stream.id ? 1 : 0
          : mutedSensors.has(stream.id) ? 0 : 1;
        return acc;
      },
      {} as Record<SensorStreamId, number>,
    );
  }, [mutedSensors, soloSensor]);

  const sensorActivity = React.useMemo<Record<SensorStreamId, number>>(() => {
    const raw = latestEEG?.raw ?? [];
    const bands = latestBandsAbs
      ? Math.max(
          ...Object.values(latestBandsAbs).map((value) =>
            clamp(((Number(value) || -2.5) + 2.5) / 4, 0, 1),
          ),
        )
      : 0;
    return {
      raw: clamp(magnitude(raw) / 220, 0, 1),
      bands,
      accel: clamp(magnitude(motion?.accel ?? []) / 2, 0, 1),
      gyro: clamp(magnitude(motion?.gyro ?? []) / 250, 0, 1),
      ppg: clamp(magnitude(motion?.ppg ?? []), 0, 1),
      fnirs: clamp(magnitude(motion?.fnirs ?? []), 0, 1),
    };
  }, [latestBandsAbs, latestEEG, motion]);

  const stop = React.useCallback(async () => {
    const csound = csoundRef.current;
    if (!csound) return;
    try {
      await csound.stop();
      if (hasFunction(csound, "cleanup")) {
        await csound.cleanup();
      }
      await csound.destroy();
      appendLog("Browser Csound stopped.");
    } catch (error) {
      appendLog(`Stop error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      csoundRef.current = null;
      audioContextRef.current = null;
      activeSustainedNotesRef.current.clear();
      setHeldNotes(new Set());
      setStatus("idle");
    }
  }, [appendLog]);

  React.useEffect(() => {
    return () => {
      disconnectMidiInputs();
      void stop();
    };
  }, [stop]);

  React.useEffect(() => {
    const access = midiAccessRef.current;
    if (!access) return;
    for (const input of access.inputs.values()) {
      input.onmidimessage = null;
    }
    const selected = access.inputs.get(selectedMidiInputId);
    if (!selected) return;
    selected.onmidimessage = (event) => {
      if (!event.data) return;
      const [statusByte = 0, data1 = 0, data2 = 0] = Array.from(event.data);
      const csound = csoundRef.current;
      if (!csound) return;

      const kind = statusByte & 0xf0;
      if (kind === 0x90 && data2 > 0) {
        void startSustainedMidiNote(csound, data1, data2 / 127, orchestraModel, activeSustainedNotesRef.current);
        setHeldNotes((prev) => new Set(prev).add(data1));
      } else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) {
        void releaseSustainedMidiNote(csound, data1, activeSustainedNotesRef.current);
        setHeldNotes((prev) => {
          const next = new Set(prev);
          next.delete(data1);
          return next;
        });
      } else if (kind === 0xb0) {
        const value = data2 / 127;
        void csound.setControlChannel(`nv_cc${data1}_value`, value);
        if (LAUNCHKEY_CC_NUMBERS.includes(data1)) {
          setLaunchkeyCcs((prev) => ({ ...prev, [data1]: value }));
        }
        if (data1 === 1) {
          setCc1Value(value);
          void csound.setControlChannel("nv_cc1_value", value);
          void csound.setControlChannel(
            controls.cc1Mode === "volume" ? "nv_melody_volume" : "nv_melody_complexity",
            value,
          );
        }
        const now = performance.now();
        if (now - lastCcLogRef.current > 500) {
          appendLog(`USB MIDI CC${data1}: ${value.toFixed(3)}`);
          lastCcLogRef.current = now;
        }
      } else if (kind === 0xe0) {
        const raw14 = data1 + data2 * 128;
        const value = clamp((raw14 - 8192) / 8192, -1, 1);
        setPitchBendValue(value);
        void csound.setControlChannel("nv_pitch_bend", value);
      }
    };
    appendLog(`USB MIDI input connected: ${selected.name || "MIDI input"}`);
  }, [appendLog, controls.cc1Mode, orchestraModel, selectedMidiInputId]);

  React.useEffect(() => {
    refreshAudioOutputs();
  }, []);

  React.useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    void applyAudioOutput(context, selectedAudioOutputId);
  }, [selectedAudioOutputId]);

  async function start() {
    if (csoundRef.current || status === "loading") return;
    setStatus("loading");
    setLogs([]);
    try {
      const { Csound } = await import("@csound/browser");

      // Use the same safe Csound 6 pattern as the working Etude app:
      // Csound creates its own AudioContext, compile a browser-sized orchestra,
      // then start and feed score/MIDI events.
      const csound = await Csound();
      if (!csound) throw new Error("Csound WASM failed to initialize");
      const audioContext = await csound.getAudioContext();
      if (audioContext) {
        audioContextRef.current = audioContext;
        await applyAudioOutput(audioContext, selectedAudioOutputId);
        await audioContext.resume();
      }

      csound.on("message", (msg: unknown) => appendLog(String(msg)));
      csound.on("realtimePerformanceStarted", () => {
        appendLog("Realtime WebAudio performance started.");
        setStatus("running");
      });
      csound.on("realtimePerformanceEnded", () => {
        appendLog("Realtime WebAudio performance ended.");
        setStatus("idle");
      });

      await csound.setOption("-odac");
      await csound.setOption("-m128");
      const compileResult = await csound.compileOrc(browserNeuroVisOrc());
      if (compileResult !== 0) {
        throw new Error(`Orchestra compilation failed with code ${compileResult}`);
      }
      appendLog("Compiled lightweight NeuroVis browser Csound orchestra.");
      setStatus("compiled");

      csoundRef.current = csound;
      await syncControls(csound, controls, {
        globalVolume,
        metroScale,
        chordRange,
        orchestraModel,
        soundPreset,
        melodyOn,
        printDashboard,
        sensorGains,
      });
      await syncEeg(csound, latestBandsAbs, latestBandTraces);
      await syncSensors(csound, latestEEG, motion, batteryPct);
      await csound.readScore("f 0 86400\ni 999 0 86400\n");
      await csound.start();
      await csound.inputMessage("i 999 0 86400");
      appendLog("Csound keepalive instrument started for live performance.");
      appendLog("Csound WebAudio started. Silent until MIDI, virtual keys, or hold-test buttons.");
      await connectCsoundNode(csound, appendLog);
      await sendCcDefaults(csound, controls, { metroScale, chordRange, globalVolume });
      appendLog("Tip: press Audition Csound Engine, Audition V12 MIDI Chord, or play USB MIDI.");
    } catch (error) {
      appendLog(`Start error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus("error");
      await stop();
    }
  }

  React.useEffect(() => {
    const csound = csoundRef.current;
    if (!csound) return;
    void syncControls(csound, controls, {
      globalVolume,
      metroScale,
      chordRange,
      orchestraModel,
      soundPreset,
      melodyOn,
      printDashboard,
      sensorGains,
    });
    void sendCcDefaults(csound, controls, { metroScale, chordRange, globalVolume });
  }, [
    chordRange,
    controls,
    globalVolume,
    melodyOn,
    metroScale,
    orchestraModel,
    printDashboard,
    sensorGains,
    soundPreset,
  ]);

  React.useEffect(() => {
    if (status !== "running") return;
    let busy = false;
    const timer = window.setInterval(() => {
      const csound = csoundRef.current;
      if (!csound || busy) return;
      busy = true;
      syncEeg(csound, latestBandsAbs, latestBandTraces).finally(() => {
        syncSensors(csound, latestEEG, motion, batteryPct).finally(() => {
          busy = false;
        });
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [batteryPct, latestBandsAbs, latestBandTraces, latestEEG, motion, status]);

  React.useEffect(() => {
    if (status !== "running") return;
    appendLog(`EEG orchestra: ${ORCHESTRA_MODELS[orchestraModel]?.label}`);
    void releaseHeldTest(false);
  }, [appendLog, orchestraModel, status]);

  React.useEffect(() => {
    if (status !== "running") return;
    const csound = csoundRef.current;
    if (!csound) return;
    const mutedList = Array.from(mutedSensors).join(", ");
    appendLog(
      soloSensor
        ? `Sensor solo: ${soloSensor}`
        : mutedList
          ? `Sensor muted: ${mutedList}`
          : "Sensor mix: all streams active",
    );
  }, [appendLog, mutedSensors, soloSensor, status]);

  async function noteOn(note: number) {
    const csound = csoundRef.current;
    if (!csound) return;
    await startSustainedMidiNote(csound, note, 0.82, orchestraModel, activeSustainedNotesRef.current);
    setHeldNotes((prev) => new Set(prev).add(note));
  }

  async function noteOff(note: number) {
    const csound = csoundRef.current;
    if (csound) {
      await releaseSustainedMidiNote(csound, note, activeSustainedNotesRef.current);
    }
    setHeldNotes((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
  }

  async function stopAllNotes() {
    const csound = csoundRef.current;
    if (csound) {
      await releaseAllSustainedNotes(csound, activeSustainedNotesRef.current);
    }
    setHeldNotes(new Set());
  }

  async function holdTestNote() {
    const csound = csoundRef.current;
    if (!csound) {
      appendLog("Start Audio first, then hold a test note.");
      return;
    }
    await releaseHeldTest();
    appendLog("Holding test note C2. Use Release Hold to stop it.");
    await startSustainedMidiNote(csound, 48, 0.72, orchestraModel, activeSustainedNotesRef.current);
    setHeldNotes((prev) => new Set(prev).add(48));
  }

  async function holdTestChord() {
    const csound = csoundRef.current;
    if (!csound) {
      appendLog("Start Audio first, then hold a test chord.");
      return;
    }
    await releaseHeldTest();
    appendLog("Holding test chord. Use Release Hold to stop it.");
    for (const note of [48, 55, 60, 64]) {
      await startSustainedMidiNote(csound, note, 0.68, orchestraModel, activeSustainedNotesRef.current);
    }
    setHeldNotes((prev) => {
      const next = new Set(prev);
      [48, 55, 60, 64].forEach((note) => next.add(note));
      return next;
    });
  }

  async function releaseHeldTest(log = true) {
    const csound = csoundRef.current;
    if (!csound) return;
    await releaseAllSustainedNotes(csound, activeSustainedNotesRef.current);
    setHeldNotes(new Set());
    if (log) appendLog("Released held test notes.");
  }

  async function panicReset() {
    const csound = csoundRef.current;
    if (csound) {
      await releaseAllSustainedNotes(csound, activeSustainedNotesRef.current);
    }
    setHeldNotes(new Set());
    appendLog("Panic/reset requested. Stopping browser Csound engine.");
    await stop();
  }

  async function setVirtualCc(cc: number, value: number) {
    setLaunchkeyCcs((prev) => ({ ...prev, [cc]: value }));
    const csound = csoundRef.current;
    if (!csound) return;
    await csound.setControlChannel(`nv_cc${cc}_value`, value);
    appendLog(`On-screen CC${cc}: ${value.toFixed(3)}`);
  }

  async function setVirtualCc1(value: number) {
    setCc1Value(value);
    const csound = csoundRef.current;
    if (!csound) return;
    await csound.setControlChannel("nv_cc1_value", value);
    await csound.setControlChannel(
      controls.cc1Mode === "volume" ? "nv_melody_volume" : "nv_melody_complexity",
      value,
    );
  }

  async function setVirtualPitchBend(value: number) {
    setPitchBendValue(value);
    const csound = csoundRef.current;
    if (!csound) return;
    await csound.setControlChannel("nv_pitch_bend", value);
  }

  async function auditionCsoundChord() {
    const csound = csoundRef.current;
    if (!csound) {
      appendLog("Start Audio first, then audition the Csound chord.");
      return;
    }
    const notes = [48, 55, 60, 64];
    appendLog("Auditioning browser V12 chord for 1.5 seconds.");
    for (const note of notes) {
      await playBrowserNote(csound, note, 0.9, 1.5, orchestraModel);
    }
    setHeldNotes((prev) => {
      const next = new Set(prev);
      notes.forEach((note) => next.add(note));
      return next;
    });
    window.setTimeout(() => {
      setHeldNotes((prev) => {
        const next = new Set(prev);
        notes.forEach((note) => next.delete(note));
        return next;
      });
    }, 1500);
  }

  async function auditionCsoundEngine() {
    const csound = csoundRef.current;
    if (!csound) {
      appendLog("Start Audio first, then audition the Csound engine.");
      return;
    }
    appendLog("Auditioning browser Csound engine test tone.");
    await csound.inputMessage("i 900 0 1.25 440 0.18");
    await csound.inputMessage("i 900 0.08 1.15 660 0.12");
    await csound.inputMessage("i 900 0.16 1.05 880 0.09");
  }

  async function testBrowserTone() {
    const context = audioContextRef.current ?? new AudioContext({ latencyHint: "interactive" });
    await applyAudioOutput(context, selectedAudioOutputId);
    await context.resume();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.5);
    appendLog("Played browser test tone.");
    if (!audioContextRef.current) {
      window.setTimeout(() => void context.close(), 650);
    }
  }

  async function refreshAudioOutputs() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setAudioOutputStatus("unsupported");
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        .filter((device) => device.kind === "audiooutput")
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || (device.deviceId === "default" ? "System default" : `Audio output ${index + 1}`),
        }));
      setAudioOutputs(outputs.length ? outputs : [{ id: "default", label: "System default" }]);
    } catch (error) {
      setAudioOutputStatus("error");
      appendLog(`Audio output list error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function applyAudioOutput(context: AudioContext, sinkId: string) {
    if (!sinkId || sinkId === "default") {
      setAudioOutputStatus("default");
      return;
    }

    const ctx = context as AudioContextWithSink;
    if (!ctx.setSinkId) {
      setAudioOutputStatus("unsupported");
      appendLog("This browser cannot route AudioContext to a selected output. Use system audio output or Chrome/Edge with AudioContext.setSinkId.");
      return;
    }
    try {
      await ctx.setSinkId(sinkId);
      setAudioOutputStatus(sinkId === "default" ? "default" : "ready");
      appendLog(`Audio output set to ${audioOutputs.find((o) => o.id === sinkId)?.label || sinkId}.`);
    } catch (error) {
      setAudioOutputStatus("error");
      appendLog(`Audio output routing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function enableMidi() {
    if (!navigator.requestMIDIAccess) {
      setMidiStatus("unsupported");
      appendLog("Web MIDI is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    setMidiStatus("requesting");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      access.onstatechange = refreshMidiInputs;
      refreshMidiInputs();
      setMidiStatus("ready");
      appendLog("USB MIDI access enabled.");
    } catch (error) {
      setMidiStatus("error");
      appendLog(`MIDI access error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function refreshMidiInputs() {
    const access = midiAccessRef.current;
    if (!access) return;
    const inputs = Array.from(access.inputs.values()).map((input) => ({
      id: input.id,
      name: input.name || "MIDI input",
      manufacturer: input.manufacturer || "",
      state: input.state || "unknown",
    }));
    setMidiInputs(inputs);
    setSelectedMidiInputId((current) => current || inputs[0]?.id || "");
  }

  function disconnectMidiInputs() {
    const access = midiAccessRef.current;
    if (!access) return;
    for (const input of access.inputs.values()) {
      input.onmidimessage = null;
    }
    access.onstatechange = null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === "running" ? "emerald" : status === "error" ? "rose" : "neutral"} dot>
              Csound WASM {status}
            </Badge>
            <Badge tone="indigo">WebAudio</Badge>
            <Badge tone="amber">Browser EEG bridge</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            Compiles a browser-safe V12-inspired orchestra, replaces desktop OSC with WebAudio
            control channels, streams NeuroVis Muse values into Csound, and uses virtual or USB
            MIDI notes to trigger the chord instrument.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={start}
            disabled={status === "loading" || status === "running" || status === "compiled"}
            leftIcon={<Power className="h-4 w-4" />}
          >
            Start Audio
          </Button>
          <Button
            variant="outline"
            onClick={stop}
            disabled={!csoundRef.current}
            leftIcon={<Square className="h-4 w-4" />}
          >
            Stop
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Volume2 className="h-4 w-4 text-emerald-400" />
            Browser Csound Mix
          </div>
          <Slider
            label="Global volume"
            value={globalVolume}
            min={0}
            max={1}
            step={0.01}
            onChange={setGlobalVolume}
            format={(v) => v.toFixed(3)}
          />
          <Slider
            label="MIDI note pulse scale"
            value={metroScale}
            min={0.01}
            max={3}
            step={0.01}
            onChange={setMetroScale}
            format={(v) => `${v.toFixed(2)}x`}
          />
          <Slider
            label="Chord range"
            value={chordRange}
            min={1}
            max={12}
            step={1}
            onChange={setChordRange}
            format={(v) => String(Math.round(v))}
          />
          <label className="block space-y-1.5">
            <span className="text-xs text-zinc-400">EEG orchestra</span>
            <select
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/70"
              value={orchestraModel}
              onChange={(event) => setOrchestraModel(Number(event.target.value))}
            >
              {ORCHESTRA_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <span className="block text-[11px] leading-4 text-zinc-500">
              {ORCHESTRA_MODELS[orchestraModel]?.description}
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-zinc-400">Sound preset</span>
            <select
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/70"
              value={soundPreset}
              onChange={(event) => setSoundPreset(Number(event.target.value))}
            >
              {SOUND_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="block text-[11px] leading-4 text-zinc-500">
              {SOUND_PRESETS[soundPreset]?.description}
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-zinc-400">Audio output device</span>
            <select
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/70"
              value={selectedAudioOutputId}
              onChange={(event) => setSelectedAudioOutputId(event.target.value)}
              onFocus={refreshAudioOutputs}
            >
              <option value="default">System default</option>
              {audioOutputs
                .filter((output) => output.id !== "default")
                .map((output) => (
                  <option key={output.id} value={output.id}>
                    {output.label}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={testBrowserTone}>
              Test Output Tone
            </Button>
            <Badge
              tone={
                audioOutputStatus === "ready"
                  ? "emerald"
                  : audioOutputStatus === "error"
                    ? "rose"
                    : "neutral"
              }
            >
              {audioOutputStatus}
            </Badge>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Music2 className="h-4 w-4 text-emerald-400" />
            Virtual MIDI Chord Keys
          </div>
          <div className="grid grid-cols-5 gap-2">
            {MIDI_NOTES.map(({ label, note }) => (
              <button
                key={note}
                className="touch-none rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-4 font-mono text-xs text-zinc-100 hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40"
                disabled={!csoundRef.current}
                onMouseDown={() => void noteOn(note)}
                onMouseUp={() => void noteOff(note)}
                onMouseLeave={() => heldNotes.has(note) && void noteOff(note)}
                onTouchStart={() => {
                  void noteOn(note);
                }}
                onTouchEnd={() => {
                  void noteOff(note);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={stopAllNotes} disabled={!heldNotes.size}>
            Stop held notes
          </Button>
          <Button size="sm" variant="outline" onClick={auditionCsoundEngine} disabled={!csoundRef.current}>
            Audition Csound Engine
          </Button>
          <Button size="sm" onClick={auditionCsoundChord} disabled={!csoundRef.current}>
            Audition V12 MIDI Chord
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 lg:col-span-2 xl:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Music2 className="h-4 w-4 text-emerald-400" />
              Launchkey Mini MK4-style Controller
            </div>
            <Badge tone="indigo">25 keys + CC21-28</Badge>
          </div>
          <div className="grid gap-3 xl:grid-cols-[76px_1fr]">
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-2 xl:grid-cols-1">
              <VerticalControl
                label="PB"
                value={pitchBendValue}
                min={-1}
                max={1}
                step={0.01}
                center
                onChange={(value) => void setVirtualPitchBend(value)}
              />
              <VerticalControl
                label="CC1"
                value={cc1Value}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => void setVirtualCc1(value)}
              />
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-1.5">
                {LAUNCHKEY_CC_NUMBERS.map((cc) => (
                  <VirtualKnob
                    key={cc}
                    cc={cc}
                    value={launchkeyCcs[cc] ?? 0}
                    onChange={(value) => void setVirtualCc(cc, value)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
                <div className="font-mono text-[11px] text-zinc-400">
                  Range {midiNoteName(launchkeyStartNote)}-{midiNoteName(launchkeyStartNote + LAUNCHKEY_KEY_COUNT - 1)}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLaunchkeyStartNote((note) => Math.max(0, note - 12))}
                  >
                    Octave Down
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLaunchkeyStartNote((note) =>
                        Math.min(127 - LAUNCHKEY_KEY_COUNT + 1, note + 12),
                      )
                    }
                  >
                    Octave Up
                  </Button>
                </div>
              </div>
              <MiniKeyboard
                startNote={launchkeyStartNote}
                disabled={!csoundRef.current}
                heldNotes={heldNotes}
                onNoteOn={(note) => void noteOn(note)}
                onNoteOff={(note) => void noteOff(note)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Music2 className="h-4 w-4 text-emerald-400" />
            USB MIDI Input
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={enableMidi}>
              Enable USB MIDI
            </Button>
            <Badge
              tone={
                midiStatus === "ready"
                  ? "emerald"
                  : midiStatus === "error" || midiStatus === "unsupported"
                    ? "rose"
                    : "neutral"
              }
              dot={midiStatus === "ready"}
            >
              {midiStatus}
            </Badge>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs text-zinc-400">MIDI keyboard/controller</span>
            <select
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/70"
              value={selectedMidiInputId}
              onChange={(event) => setSelectedMidiInputId(event.target.value)}
              disabled={!midiInputs.length}
            >
              {midiInputs.length ? (
                midiInputs.map((input) => (
                  <option key={input.id} value={input.id}>
                    {input.name}
                    {input.manufacturer ? ` (${input.manufacturer})` : ""}
                  </option>
                ))
              ) : (
                <option value="">No MIDI inputs found</option>
              )}
            </select>
          </label>
          <p className="text-xs leading-5 text-zinc-500">
            Chrome/Edge will ask for permission. Notes and CCs from the selected input are sent
            directly to the browser Csound engine.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Browser Bridge Toggles
          </div>
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
            Melody generator
            <input
              type="checkbox"
              checked={melodyOn}
              onChange={(e) => setMelodyOn(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
            Csound dashboard print
            <input
              type="checkbox"
              checked={printDashboard}
              onChange={(e) => setPrintDashboard(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>
          <p className="text-xs leading-5 text-zinc-500">
            Browser audio starts only after a user click. If Chrome blocks audio, press Stop and
            Start Audio again. By default, Csound stays silent until MIDI or a hold-test button.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={holdTestNote} disabled={!csoundRef.current}>
              Hold Test Note
            </Button>
            <Button size="sm" variant="outline" onClick={holdTestChord} disabled={!csoundRef.current}>
              Hold Test Chord
            </Button>
            <Button size="sm" variant="outline" onClick={() => void releaseHeldTest()} disabled={!csoundRef.current}>
              Release Hold
            </Button>
          </div>
          <Button size="sm" variant="danger" onClick={panicReset} disabled={!csoundRef.current}>
            Panic / Reset Audio
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
          <Activity className="h-4 w-4 text-emerald-400" />
          Sensor Orchestra Mixer
        </div>
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {SENSOR_STREAMS.map((stream) => {
            const muted = mutedSensors.has(stream.id);
            const soloed = soloSensor === stream.id;
            const activity = sensorActivity[stream.id] ?? 0;
            return (
              <div key={stream.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-zinc-200">
                  <span>{stream.label}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{activity.toFixed(2)}</span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.round(activity * 100)}%` }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={soloed ? "primary" : "outline"}
                    onClick={() => {
                      setSoloSensor((current) => (current === stream.id ? null : stream.id));
                      setMutedSensors(new Set());
                    }}
                  >
                    Solo
                  </Button>
                  <Button
                    size="sm"
                    variant={muted ? "danger" : "outline"}
                    onClick={() => {
                      setSoloSensor(null);
                      setMutedSensors((current) => {
                        const next = new Set(current);
                        if (next.has(stream.id)) next.delete(stream.id);
                        else next.add(stream.id);
                        return next;
                      });
                    }}
                  >
                    Mute
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          These gains feed the Csound orchestra models, so simple demos can isolate one sensor
          family and advanced models can blend them into a single musical texture.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Csound Console
          </div>
          <Button size="sm" variant="ghost" onClick={() => setLogs([])}>
            Clear
          </Button>
        </div>
        <pre className="h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-400">
          {logs.length ? logs.join("\n") : "Csound messages will appear here after Start Audio."}
        </pre>
      </div>
    </div>
  );
}

function VirtualKnob({
  cc,
  value,
  onChange,
}: {
  cc: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const angle = -135 + value * 270;
  return (
    <label className="flex flex-col items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1.5">
      <span className="font-mono text-[10px] text-zinc-400">CC{cc}</span>
      <span
        className="relative h-8 w-8 rounded-full border border-zinc-700 bg-zinc-900 shadow-inner"
        style={{
          background: `conic-gradient(from 225deg, rgb(16 185 129) ${value * 270}deg, rgb(39 39 42) 0deg)`,
        }}
      >
        <span
          className="absolute left-1/2 top-1/2 h-3 w-0.5 origin-bottom rounded bg-zinc-100"
          style={{
            transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          }}
        />
      </span>
      <input
        aria-label={`CC ${cc}`}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-emerald-500"
      />
      <span className="font-mono text-[10px] text-zinc-500">{Math.round(value * 127)}</span>
    </label>
  );
}

function VerticalControl({
  label,
  value,
  min,
  max,
  step,
  center,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  center?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 xl:flex-col">
      <span className="w-8 text-center font-mono text-[10px] text-zinc-400">{label}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => center && onChange(0)}
        className="h-16 w-7 -rotate-90 accent-emerald-500 xl:h-20"
      />
      <span className="w-8 text-right font-mono text-[10px] text-zinc-500">
        {center ? value.toFixed(2) : Math.round(value * 127)}
      </span>
    </label>
  );
}

function MiniKeyboard({
  startNote,
  disabled,
  heldNotes,
  onNoteOn,
  onNoteOff,
}: {
  startNote: number;
  disabled: boolean;
  heldNotes: Set<number>;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
}) {
  const [asciiActive, setAsciiActive] = React.useState(false);
  const asciiHeldRef = React.useRef<Map<string, number>>(new Map());
  const keys = Array.from({ length: LAUNCHKEY_KEY_COUNT }, (_, index) => startNote + index);
  const blackOffsets = new Set([1, 3, 6, 8, 10]);
  const whiteKeys = keys.filter((note) => !blackOffsets.has(note % 12));
  const blackKeys = keys.filter((note) => blackOffsets.has(note % 12));
  const asciiLabels = React.useMemo(() => {
    const labels = new Map<number, string>();
    Object.entries(ASCII_KEYBOARD_OFFSETS).forEach(([key, offset]) => {
      labels.set(startNote + offset, key === " " ? "Space" : key.toUpperCase());
    });
    return labels;
  }, [startNote]);
  const releaseAsciiHeldNotes = React.useCallback(() => {
    for (const note of asciiHeldRef.current.values()) {
      onNoteOff(note);
    }
    asciiHeldRef.current.clear();
  }, [onNoteOff]);

  React.useEffect(() => {
    if (!asciiActive || disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const offset = ASCII_KEYBOARD_OFFSETS[event.key.toLowerCase()];
      if (offset === undefined) return;
      const note = startNote + offset;
      if (note > startNote + LAUNCHKEY_KEY_COUNT - 1) return;
      event.preventDefault();
      event.stopPropagation();
      const key = event.key.toLowerCase();
      if (asciiHeldRef.current.has(key)) return;
      asciiHeldRef.current.set(key, note);
      onNoteOn(note);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const note = asciiHeldRef.current.get(key);
      if (note === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      asciiHeldRef.current.delete(key);
      onNoteOff(note);
    };
    const onWindowBlur = () => releaseAsciiHeldNotes();
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        releaseAsciiHeldNotes();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      releaseAsciiHeldNotes();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [asciiActive, disabled, onNoteOff, onNoteOn, releaseAsciiHeldNotes, startNote]);

  return (
    <div
      className={[
        "rounded-xl border bg-zinc-950/70 p-2 transition",
        asciiActive ? "border-emerald-500/70 shadow-[0_0_28px_-18px_rgba(16,185,129,.95)]" : "border-zinc-800",
      ].join(" ")}
      onMouseEnter={() => setAsciiActive(true)}
      onMouseLeave={() => setAsciiActive(false)}
      onFocus={() => setAsciiActive(true)}
      onBlur={() => setAsciiActive(false)}
      tabIndex={0}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
        <span className="text-zinc-500">Hover/focus here for ASCII keyboard notes</span>
        <span className={asciiActive ? "text-emerald-300" : "text-zinc-600"}>
          {asciiActive ? "ASCII notes active" : "ASCII shortcuts active"}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/80 p-2">
        <div className="relative h-36 w-full sm:h-40">
          <div className="absolute inset-x-0 bottom-0 flex h-full gap-0.5">
            {whiteKeys.map((note) => {
              const held = heldNotes.has(note);
              return (
                <button
                  key={note}
                  disabled={disabled}
                  className={[
                    "touch-none flex min-w-0 flex-1 flex-col justify-end rounded-b-md border border-zinc-500 bg-zinc-100 px-0.5 pb-2 text-center font-mono text-[9px] text-zinc-900 transition hover:bg-emerald-100 disabled:opacity-35 sm:text-[10px]",
                    held ? "border-emerald-400 bg-emerald-300 text-zinc-950 shadow-[0_0_20px_-8px_rgba(16,185,129,.95)]" : "",
                  ].join(" ")}
                  onMouseDown={() => onNoteOn(note)}
                  onMouseUp={() => onNoteOff(note)}
                  onMouseLeave={() => held && onNoteOff(note)}
                  onTouchStart={() => onNoteOn(note)}
                  onTouchEnd={() => onNoteOff(note)}
                  title={midiNoteName(note)}
                >
                  <span>{midiNoteName(note)}</span>
                  {asciiLabels.has(note) && (
                    <span className="mt-1 rounded bg-zinc-300/80 px-1 text-[8px] text-zinc-700">
                      {asciiLabels.get(note)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {blackKeys.map((note) => {
            const precedingWhiteIndex = whiteKeys.filter((whiteNote) => whiteNote < note).length - 1;
            const leftPct = ((precedingWhiteIndex + 0.92) / whiteKeys.length) * 100;
          const held = heldNotes.has(note);
          return (
            <button
              key={note}
              disabled={disabled}
              className={[
                "absolute top-0 z-10 touch-none flex h-24 -translate-x-1/2 flex-col items-center justify-end rounded-b-md border border-zinc-950 bg-zinc-950 pb-2 font-mono text-[8px] text-zinc-500 shadow-lg transition hover:bg-zinc-800 disabled:opacity-35 sm:h-28 sm:text-[9px]",
                held ? "border-emerald-400 bg-emerald-300 text-zinc-950 shadow-[0_0_20px_-8px_rgba(16,185,129,.95)]" : "",
              ].join(" ")}
              style={{
                left: `${leftPct}%`,
                width: `min(34px, ${Math.max(4.2, 58 / whiteKeys.length)}%)`,
              }}
              onMouseDown={() => onNoteOn(note)}
              onMouseUp={() => onNoteOff(note)}
              onMouseLeave={() => held && onNoteOff(note)}
              onTouchStart={() => onNoteOn(note)}
              onTouchEnd={() => onNoteOff(note)}
              title={midiNoteName(note)}
            >
              <span className="sr-only">{midiNoteName(note)}</span>
              {asciiLabels.has(note) && <span>{asciiLabels.get(note)}</span>}
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}

async function syncControls(
  csound: CsoundObj,
  controls: V12RenderControls,
  local: {
    globalVolume: number;
    metroScale: number;
    chordRange: number;
    orchestraModel: number;
    soundPreset: number;
    melodyOn: boolean;
    printDashboard: boolean;
    sensorGains: Record<SensorStreamId, number>;
  },
) {
  await Promise.all([
    csound.setControlChannel("nv_web_active", 1),
    csound.setControlChannel("nv_palette", controls.palette),
    csound.setControlChannel("nv_harmony_band", BAND_INDEX[controls.harmonyBand]),
    csound.setControlChannel("nv_bass_driver", BAND_INDEX[controls.bassDriver]),
    csound.setControlChannel("nv_melody_driver", BAND_INDEX[controls.melodyDriver]),
    csound.setControlChannel("nv_rhythm_driver", BAND_INDEX[controls.rhythmDriver]),
    csound.setControlChannel("nv_register_driver", BAND_INDEX[controls.registerDriver]),
    csound.setControlChannel("nv_response_mode", controls.responseMode),
    csound.setControlChannel("nv_orchestra_mode", controls.orchestration),
    csound.setControlChannel("nv_motion_mode", controls.motion),
    csound.setControlChannel("nv_cc1_mode", controls.cc1Mode === "volume" ? 0 : 1),
    csound.setControlChannel("nv_melody_volume", controls.melodyVolume),
    csound.setControlChannel("nv_melody_complexity", controls.melodyComplexity),
    csound.setControlChannel("nv_global_volume", local.globalVolume),
    csound.setControlChannel("nv_metro_scale", local.metroScale),
    csound.setControlChannel("nv_chord_range", local.chordRange),
    csound.setControlChannel("nv_orchestra_model", local.orchestraModel),
    csound.setControlChannel("nv_sound_preset", local.soundPreset),
    csound.setControlChannel("nv_melody_on", local.melodyOn ? 1 : 0),
    csound.setControlChannel("nv_print_toggle", local.printDashboard ? 1 : 0),
    csound.setControlChannel("nv_stream_raw", local.sensorGains.raw),
    csound.setControlChannel("nv_stream_bands", local.sensorGains.bands),
    csound.setControlChannel("nv_stream_accel", local.sensorGains.accel),
    csound.setControlChannel("nv_stream_gyro", local.sensorGains.gyro),
    csound.setControlChannel("nv_stream_ppg", local.sensorGains.ppg),
    csound.setControlChannel("nv_stream_fnirs", local.sensorGains.fnirs),
  ]);
}

async function sendCcDefaults(
  csound: CsoundObj,
  controls: V12RenderControls,
  local: { metroScale: number; chordRange: number; globalVolume: number },
) {
  await Promise.all([
    csound.setControlChannel(
      "nv_cc1_value",
      controls.cc1Mode === "volume" ? controls.melodyVolume : controls.melodyComplexity,
    ),
    csound.setControlChannel("nv_chord_range", local.chordRange),
    csound.setControlChannel("nv_metro_scale", local.metroScale),
    csound.setControlChannel("nv_global_volume", local.globalVolume),
  ]);
}

async function playBrowserNote(
  csound: CsoundObj,
  note: number,
  velocity = 0.75,
  duration = 2.5,
  orchestraModel = 4,
  instrument = 901,
) {
  const amp = clamp(0.06 + velocity * 0.18, 0.05, 0.28);
  const voicing = getOrchestraVoicing(orchestraModel);
  for (let index = 0; index < voicing.length; index += 1) {
    const voice = voicing[index];
    await csound.inputMessage(
      `i ${instrument} ${voice.delay.toFixed(3)} ${duration.toFixed(3)} ${(note + voice.interval).toFixed(3)} ${(amp * voice.amp).toFixed(3)} ${orchestraModel} ${index}`,
    );
  }
}

async function startSustainedMidiNote(
  csound: CsoundObj,
  note: number,
  velocity: number,
  orchestraModel: number,
  activeNotes: Set<number>,
) {
  if (activeNotes.has(note)) return;
  const instrument = sustainInstrumentForNote(note);
  const amp = clamp(0.06 + velocity * 0.18, 0.05, 0.28);
  await csound.inputMessage(
    `i ${instrument} 0 86400 ${note.toFixed(3)} ${amp.toFixed(3)} ${orchestraModel} 0`,
  );
  activeNotes.add(note);
}

async function releaseSustainedMidiNote(
  csound: CsoundObj,
  note: number,
  activeNotes: Set<number>,
) {
  if (!activeNotes.has(note)) return;
  const instrument = sustainInstrumentForNote(note);
  await csound.inputMessage(`i 905 0 0.01 ${instrument}`);
  activeNotes.delete(note);
}

async function releaseAllSustainedNotes(csound: CsoundObj, activeNotes: Set<number>) {
  const instruments = Array.from(
    { length: 128 },
    (_, note) => MIDI_SUSTAIN_INSTR_BASE + note,
  );
  await Promise.all(
    instruments.map((instrument) => csound.inputMessage(`i 905 0 0.01 ${instrument}`)),
  );
  activeNotes.clear();
}

function sustainInstrumentForNote(note: number) {
  return MIDI_SUSTAIN_INSTR_BASE + clamp(Math.round(note), 0, 127);
}

function midiNoteName(note: number) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitch = names[((note % 12) + 12) % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${pitch}${octave}`;
}

function getOrchestraVoicing(orchestraModel: number) {
  const voicings = [
    [
      { interval: 0, amp: 1, delay: 0 },
      { interval: 12, amp: 0.22, delay: 0.018 },
    ],
    [
      { interval: -12, amp: 0.55, delay: 0 },
      { interval: 0, amp: 1, delay: 0 },
      { interval: 12, amp: 0.72, delay: 0.012 },
      { interval: 19, amp: 0.42, delay: 0.024 },
      { interval: 24, amp: 0.24, delay: 0.036 },
    ],
    [
      { interval: -12, amp: 0.48, delay: 0 },
      { interval: 0, amp: 0.92, delay: 0.014 },
      { interval: 6, amp: 0.34, delay: 0.028 },
      { interval: 11, amp: 0.38, delay: 0.042 },
      { interval: 17, amp: 0.24, delay: 0.056 },
    ],
    [
      { interval: -24, amp: 0.52, delay: 0 },
      { interval: -12, amp: 0.72, delay: 0.02 },
      { interval: 0, amp: 0.92, delay: 0.04 },
      { interval: 7, amp: 0.46, delay: 0.06 },
    ],
    [
      { interval: -12, amp: 0.42, delay: 0 },
      { interval: 0, amp: 1, delay: 0 },
      { interval: 7, amp: 0.56, delay: 0.018 },
      { interval: 14, amp: 0.32, delay: 0.036 },
      { interval: 19, amp: 0.22, delay: 0.054 },
    ],
    [
      { interval: -12, amp: 0.40, delay: 0 },
      { interval: 0, amp: 0.90, delay: 0.012 },
      { interval: 4, amp: 0.36, delay: 0.024 },
      { interval: 7, amp: 0.44, delay: 0.036 },
      { interval: 11, amp: 0.30, delay: 0.048 },
      { interval: 16, amp: 0.22, delay: 0.06 },
      { interval: 23, amp: 0.18, delay: 0.072 },
    ],
  ];
  return voicings[clamp(Math.round(orchestraModel), 0, voicings.length - 1)];
}

function sustainInstrumentList() {
  return Array.from({ length: 128 }, (_, note) => String(MIDI_SUSTAIN_INSTR_BASE + note)).join(", ");
}

async function syncEeg(
  csound: CsoundObj,
  latestBandsAbs: BandPowers | null,
  latestBandTraces: Record<BandName, number[]> | null,
) {
  const writes: Promise<unknown>[] = [];
  for (const band of Object.keys(BAND_INDEX) as BandName[]) {
    const base = latestBandsAbs?.[band] ?? -1.25;
    for (let ch = 0; ch < 4; ch += 1) {
      const trace = latestBandTraces?.[band]?.[ch] ?? 0;
      const value = clamp(base + Math.tanh(trace / 20) * 0.35, -2.5, 1.5);
      writes.push(csound.setControlChannel(`nv_${band}_${ch + 1}`, value));
    }
  }
  await Promise.all(writes);
}

async function syncSensors(
  csound: CsoundObj,
  latestEEG: EEGMessage | null | undefined,
  motion: MotionStreams | null | undefined,
  batteryPct: number | null | undefined,
) {
  const raw = latestEEG?.raw ?? [];
  const accel = motion?.accel ?? [];
  const gyro = motion?.gyro ?? [];
  const ppg = motion?.ppg ?? [];
  const fnirs = motion?.fnirs ?? [];
  const writes: Promise<unknown>[] = [];

  for (let ch = 0; ch < 4; ch += 1) {
    writes.push(csound.setControlChannel(`nv_raw_${ch + 1}`, clamp(Number(raw[ch]) || 0, -250, 250)));
  }

  for (let axis = 0; axis < 3; axis += 1) {
    writes.push(csound.setControlChannel(`nv_accel_${axis + 1}`, clamp(Number(accel[axis]) || 0, -4, 4)));
    writes.push(csound.setControlChannel(`nv_gyro_${axis + 1}`, clamp(Number(gyro[axis]) || 0, -500, 500)));
    writes.push(csound.setControlChannel(`nv_ppg_${axis + 1}`, clamp(Number(ppg[axis]) || 0, -1, 1)));
    writes.push(csound.setControlChannel(`nv_fnirs_${axis + 1}`, clamp(Number(fnirs[axis]) || 0, -1, 1)));
  }

  const accelMag = magnitude(accel);
  const gyroMag = magnitude(gyro) / 250;
  const ppgMag = magnitude(ppg);
  const fnirsMag = magnitude(fnirs);
  writes.push(csound.setControlChannel("nv_accel_mag", clamp(accelMag, 0, 4)));
  writes.push(csound.setControlChannel("nv_gyro_mag", clamp(gyroMag, 0, 4)));
  writes.push(csound.setControlChannel("nv_ppg_mag", clamp(ppgMag, 0, 2)));
  writes.push(csound.setControlChannel("nv_fnirs_mag", clamp(fnirsMag, 0, 2)));
  writes.push(csound.setControlChannel("nv_battery_pct", batteryPct ?? 100));

  await Promise.all(writes);
}

function magnitude(values: number[]) {
  if (!values.length) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasFunction<T extends keyof RuntimeCsound>(
  csound: CsoundObj,
  name: T,
): csound is CsoundObj & Pick<Required<RuntimeCsound>, T> {
  return typeof (csound as RuntimeCsound)[name] === "function";
}

function browserNeuroVisOrc() {
  return `
sr = 44100
ksmps = 32
nchnls = 2
0dbfs = 1
seed 0

instr 5 ; Browser MIDI chord voice
  iFreq cpsmidi
  iAmp ampmidi 0.42
  kEnv madsr 0.02, 0.18, 0.62, 0.38
  kVol chnget "nv_global_volume"
  kAlpha chnget "nv_alpha_1"
  kBeta chnget "nv_beta_1"
  kGamma chnget "nv_gamma_1"
  kBright = limit((kBeta + 2.5) / 4, 0, 1)
  kWide = limit((kGamma + 2.5) / 4, 0, 1)
  aFund poscil iAmp * kEnv * kVol * 0.34, iFreq
  aFifth poscil iAmp * kEnv * kVol * (0.08 + kBright * 0.12), iFreq * 1.5
  aOct poscil iAmp * kEnv * kVol * (0.05 + kWide * 0.10), iFreq * 2.01
  aTone = aFund + aFifth + aOct
  aTone tone aTone, 900 + kBright * 4200
  aL, aR pan2 aTone, 0.5 + (kWide - 0.5) * 0.38
  outs aL, aR
endin

instr 999 ; Silent keepalive so browser Csound remains open for live input
  aSilence oscili 0, 20
  outs aSilence, aSilence
endin

instr 900 ; Browser Csound engine smoke test
  iFreq = p4
  iAmp = p5
  aEnv linsegr 0, 0.02, 1, p3 - 0.05, 0.7, 0.03, 0
  aTone poscil iAmp * aEnv, iFreq
  aTone = aTone + poscil(iAmp * 0.35 * aEnv, iFreq * 2.01)
  outs aTone, aTone
endin

instr 901, ${sustainInstrumentList()} ; Browser Csound finite and true MIDI-gated note voices
  iNote = p4
  iAmp = p5
  iModel = p6
  iVoice = p7
  kVol chnget "nv_global_volume"
  kCc1 chnget "nv_cc1_value"
  kPitchBend chnget "nv_pitch_bend"
  kCc21 chnget "nv_cc21_value"
  kCc22 chnget "nv_cc22_value"
  kCc23 chnget "nv_cc23_value"
  kCc24 chnget "nv_cc24_value"
  kMetro chnget "nv_metro_scale"
  kRawGain chnget "nv_stream_raw"
  kBandGain chnget "nv_stream_bands"
  kAccelGain chnget "nv_stream_accel"
  kGyroGain chnget "nv_stream_gyro"
  kPpgGain chnget "nv_stream_ppg"
  kFnirsGain chnget "nv_stream_fnirs"
  kPreset chnget "nv_sound_preset"
  kRaw1 chnget "nv_raw_1"
  kRaw2 chnget "nv_raw_2"
  kDelta chnget "nv_delta_1"
  kTheta chnget "nv_theta_1"
  kAlpha chnget "nv_alpha_1"
  kBeta chnget "nv_beta_1"
  kGamma chnget "nv_gamma_1"
  kAccel chnget "nv_accel_mag"
  kGyro chnget "nv_gyro_mag"
  kPpg chnget "nv_ppg_mag"
  kFnirs chnget "nv_fnirs_mag"
  kAlphaN = limit((kAlpha + 2.5) / 4, 0, 1)
  kBetaN = limit((kBeta + 2.5) / 4, 0, 1)
  kGammaN = limit((kGamma + 2.5) / 4, 0, 1)
  kThetaN = limit((kTheta + 2.5) / 4, 0, 1)
  kDeltaN = limit((kDelta + 2.5) / 4, 0, 1)
  aEnv linsegr 0, 0.025, 1, max(0.05, p3 - 0.65), 0.62, 0.62, 0
  kBright = 0.45 + kBetaN * 0.45 + kCc1 * 0.25 + kCc23 * 0.45
  kWide = 0.45 + kGammaN * 0.4 + kCc24 * 0.35
  kSubMix = 0.04
  kPitchDrift = 0
  kPulseDepth = 0.08
  kModelGain = 1
  kModelFifth = 1
  kModelOct = 1
  if (kPreset == 1) then
    kBright = kBright + 0.55
  elseif (kPreset == 2) then
    kBright = kBright - 0.10
    kSubMix = 0.18
  elseif (kPreset == 3) then
    kWide = kWide + 0.45
  elseif (kPreset == 5) then
    kBright = kBright + 0.50
  endif
  if (iModel == 0) then
    kPitchDrift = limit((kRaw1 + kRaw2) * kRawGain * 0.10, -18, 18)
    kBright = 0.16 + kRawGain * 0.10
    kModelFifth = 0.12
    kModelOct = 0.08
    kPulseDepth = 0.02
  elseif (iModel == 1) then
    kSubMix = kSubMix + kDeltaN * kBandGain * 0.16
    kBright = kBright + kGammaN * kBandGain * 0.28
    kModelOct = 1.6
  elseif (iModel == 2) then
    kPulseDepth = 0.26 + limit(kAccel + kGyro, 0, 2) * 0.16
    kWide = kWide + limit(kGyro, 0, 2) * kGyroGain * 0.30
    kBright = kBright + 0.22
  elseif (iModel == 3) then
    kPulseDepth = 0.24 + limit(kPpg, 0, 2) * kPpgGain * 0.14
    kSubMix = kSubMix + 0.24
    kBright = kBright * 0.55
    kModelOct = 0.35
  elseif (iModel == 4) then
    kBright = kBright + kAlphaN * 0.16
    kWide = kWide + 0.18
  else
    kBright = kBright + (kGammaN * kBandGain + limit(kFnirs, 0, 2) * kFnirsGain) * 0.24
    kModelOct = 1.35
    kWide = kWide + 0.25
  endif
  kPlayVol = kVol * (0.55 + kCc1 * 0.75) * (0.55 + kCc21 * 0.70)
  kMetroLfo lfo 0.5, 0.6 + kMetro * 2.4 + kCc22 * 3.0, 0
  kPulse = 1 - kPulseDepth + kPulseDepth * (0.5 + kMetroLfo)
  kFreq = cpsmidinn(iNote + kPitchBend * 2) + kPitchDrift
  aFund poscil iAmp * aEnv * kPlayVol * kPulse * kModelGain * 0.70, kFreq
  aFifth poscil iAmp * aEnv * kPlayVol * kPulse * (0.08 + kBright * 0.18) * kModelFifth, kFreq * 1.5
  aOct poscil iAmp * aEnv * kPlayVol * kPulse * (0.04 + kGammaN * 0.16) * kModelOct, kFreq * 2.01
  aSub poscil iAmp * aEnv * kPlayVol * kPulse * kSubMix, kFreq * 0.5
  aTone = aFund + aFifth + aOct + aSub
  aTone tone aTone, 900 + kBright * 5200
  aDelay delay aTone, 0.024
  kPan = limit(0.5 + (iVoice - 2) * 0.075 + (kWide - 0.5) * 0.18, 0.05, 0.95)
  aPanL, aPanR pan2 aTone, kPan
  aL = aPanL * (0.90 + kWide * 0.08) + aDelay * (0.08 + kWide * 0.18)
  aR = aPanR * (0.90 + kWide * 0.08) + aDelay * (0.12 + kWide * 0.22)
  aRevL, aRevR reverbsc aL, aR, 0.82, 11000
  outs (aL * 0.72) + (aRevL * 0.28), (aR * 0.72) + (aRevR * 0.28)
endin

instr 905 ; Release one sustained MIDI-key instrument
  iInstr = p4
  turnoff2 iInstr, 0, 1
  turnoff
endin

instr 903 ; Optional warm pulse, reserved for explicit tests
  iFreq = p4
  iAmp = p5
  iModel = p6
  aEnv linsegr 0, 0.006, 1, max(0.03, p3 - 0.06), 0.38, 0.05, 0
  aTone poscil iAmp * aEnv, iFreq
  aTone = aTone + poscil(iAmp * 0.38 * aEnv, iFreq * (1.5 + iModel * 0.01))
  aTone tone aTone, 950 + iModel * 520
  aTap delay aTone, 0.018
  aRevL, aRevR reverbsc aTone, aTap, 0.76, 9000
  outs aTone * 0.72 + aRevL * 0.18, aTap * 0.72 + aRevR * 0.18
endin

instr 902 ; Optional EEG orchestra bed, not scheduled by default
  kModel chnget "nv_orchestra_model"
  kVol chnget "nv_global_volume"
  kRawGain chnget "nv_stream_raw"
  kBandGain chnget "nv_stream_bands"
  kAccelGain chnget "nv_stream_accel"
  kGyroGain chnget "nv_stream_gyro"
  kPpgGain chnget "nv_stream_ppg"
  kFnirsGain chnget "nv_stream_fnirs"
  kRaw1 chnget "nv_raw_1"
  kRaw2 chnget "nv_raw_2"
  kRaw3 chnget "nv_raw_3"
  kRaw4 chnget "nv_raw_4"
  kDelta chnget "nv_delta_1"
  kTheta chnget "nv_theta_1"
  kAlpha chnget "nv_alpha_1"
  kBeta chnget "nv_beta_1"
  kGamma chnget "nv_gamma_1"
  kAccel chnget "nv_accel_mag"
  kGyro chnget "nv_gyro_mag"
  kPpg chnget "nv_ppg_mag"
  kFnirs chnget "nv_fnirs_mag"
  kDeltaN = limit((kDelta + 2.5) / 4, 0, 1)
  kThetaN = limit((kTheta + 2.5) / 4, 0, 1)
  kAlphaN = limit((kAlpha + 2.5) / 4, 0, 1)
  kBetaN = limit((kBeta + 2.5) / 4, 0, 1)
  kGammaN = limit((kGamma + 2.5) / 4, 0, 1)
  kRawPitch = 110 + limit(abs(kRaw1) + abs(kRaw2) + abs(kRaw3) + abs(kRaw4), 0, 420) * 0.72
  kBandRoot = 82.41 + kAlphaN * 55 + kThetaN * 27.5
  kMotionRate = 0.18 + limit(kAccel + kGyro, 0, 3) * 0.22
  kPulseRaw lfo 0.5, 0.7 + limit(kPpg, 0, 2) * 2.2, 0
  kPulse = 0.5 + kPulseRaw
  aRaw poscil kRawGain * (0.018 + kAlphaN * 0.018), kRawPitch
  aRaw2 poscil kRawGain * 0.014, kRawPitch * 1.498
  aBand poscil kBandGain * (0.030 + kDeltaN * 0.030), kBandRoot
  aBand2 poscil kBandGain * (0.018 + kBetaN * 0.018), kBandRoot * 1.5
  aBand3 poscil kBandGain * (0.012 + kGammaN * 0.020), kBandRoot * 2.0
  aMotion poscil kAccelGain * (0.010 + limit(kAccel, 0, 2) * 0.018), 55 + kMotionRate * 90
  aGyro poscil kGyroGain * (0.006 + limit(kGyro, 0, 2) * 0.012), 220 + kGyro * 80
  aHeart poscil kPpgGain * (0.010 + kPulse * 0.026), kBandRoot * 0.5
  aFnirs poscil kFnirsGain * (0.006 + limit(kFnirs, 0, 2) * 0.018), kBandRoot * 0.25
  aModel0 = (aRaw + aRaw2) * 1.20
  aModel1 = (aBand + aBand2 + aBand3) * 1.10
  aModel2 = aRaw * 0.55 + aBand * 0.90 + aMotion * 0.70 + aGyro * 0.35
  aModel3 = aHeart * 1.20 + aBand * 0.62 + aMotion * 0.35 + aFnirs * 0.45
  aModel4 = aBand * 0.75 + aBand2 * 0.60 + aRaw2 * 0.25 + aFnirs * 0.25
  aModel5 = aBand * 0.52 + aBand2 * 0.44 + aBand3 * 0.48 + aHeart * 0.40 + aMotion * 0.25 + aFnirs * 0.30
  aMix = aModel5
  if (kModel == 0) then
    aMix = aModel0
  elseif (kModel == 1) then
    aMix = aModel1
  elseif (kModel == 2) then
    aMix = aModel2
  elseif (kModel == 3) then
    aMix = aModel3
  elseif (kModel == 4) then
    aMix = aModel4
  endif
  aSensorReveal = aRaw * 0.18 + aBand * 0.18 + aMotion * 0.35 + aGyro * 0.18 + aHeart * 0.40 + aFnirs * 0.30
  aMix = aMix + aSensorReveal * 0.45
  aMix tone aMix, 1200 + kBetaN * 3600 + kGammaN * 2800
  aWide delay aMix, 0.031
  aRevL, aRevR reverbsc aMix, aWide, 0.88, 12000
  outs (aMix * 0.42 + aRevL * 0.58) * kVol, (aWide * 0.42 + aRevR * 0.58) * kVol
endin

`;
}

async function compileBrowserOrc(csound: CsoundObj, csd: string) {
  const orc = extractCsInstruments(csd);
  return await csound.compileOrc(orc);
}

function extractCsInstruments(csd: string) {
  const startTag = "<CsInstruments>";
  const endTag = "</CsInstruments>";
  const start = csd.indexOf(startTag);
  const end = csd.indexOf(endTag);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Unable to find CsInstruments in V12 CSD");
  }
  return csd.slice(start + startTag.length, end);
}

async function connectCsoundNode(
  csound: CsoundObj,
  appendLog: (line: string) => void,
) {
  try {
    const [node, audioContext] = await Promise.all([
      csound.getNode(),
      csound.getAudioContext(),
    ]);
    if (node && audioContext) {
      try {
        node.connect(audioContext.destination);
        appendLog("Csound AudioNode connected to browser destination.");
      } catch {
        appendLog("Csound AudioNode already connected or connection was rejected.");
      }
    } else {
      appendLog("Csound AudioNode not available yet after start().");
    }
  } catch (error) {
    appendLog(`Csound node connection check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toBrowserCsd(source: string) {
  const endTag = "</CsoundSynthesizer>";
  const end = source.indexOf(endTag);
  let csd = end >= 0 ? source.slice(0, end + endTag.length) : source;

  if (!csd.includes("<CsOptions>")) {
    csd = csd.replace(
      "<CsoundSynthesizer>",
      `<CsoundSynthesizer>
<CsOptions>
-odac -m128
</CsOptions>`,
    );
  }

  csd = csd.replace(
    /schedule 12, 0, -1 ; V12 EEG control dashboard/,
    `schedule 12, 0, -1 ; V12 EEG control dashboard
schedule 90, 0, -1 ; Browser WebAudio / NeuroVis control bridge`,
  );

  csd = csd.replace(
    /\s*gihandle OSCinit 7400\s*\n\s*kk1 OSClisten[^\n]*\n\s*kk2 OSClisten[^\n]*\n\s*kk3 OSClisten[^\n]*\n\s*kk4 OSClisten[^\n]*\n\s*kk5 OSClisten[^\n]*/m,
    `
	gkDeltaAbs1 chnget "nv_delta_1"
	gkDeltaAbs2 chnget "nv_delta_2"
	gkDeltaAbs3 chnget "nv_delta_3"
	gkDeltaAbs4 chnget "nv_delta_4"
	gkThetaAbs1 chnget "nv_theta_1"
	gkThetaAbs2 chnget "nv_theta_2"
	gkThetaAbs3 chnget "nv_theta_3"
	gkThetaAbs4 chnget "nv_theta_4"
	gkAlphaAbs1 chnget "nv_alpha_1"
	gkAlphaAbs2 chnget "nv_alpha_2"
	gkAlphaAbs3 chnget "nv_alpha_3"
	gkAlphaAbs4 chnget "nv_alpha_4"
	gkBetaAbs1 chnget "nv_beta_1"
	gkBetaAbs2 chnget "nv_beta_2"
	gkBetaAbs3 chnget "nv_beta_3"
	gkBetaAbs4 chnget "nv_beta_4"
	gkGammaAbs1 chnget "nv_gamma_1"
	gkGammaAbs2 chnget "nv_gamma_2"
	gkGammaAbs3 chnget "nv_gamma_3"
	gkGammaAbs4 chnget "nv_gamma_4"`,
  );

  return csd.replace(
    "</CsInstruments>",
    `
instr 901 ; Browser-only Csound engine smoke test
	iFreq = p4
	iAmp = p5
	aEnv linsegr 0, 0.02, 1, p3 - 0.05, 0.7, 0.03, 0
	aTone oscili iAmp * aEnv, iFreq
	aTone = aTone + oscili(iAmp * 0.35 * aEnv, iFreq * 2.01)
	outs aTone, aTone
endin

instr 90 ; Browser WebAudio / NeuroVis control bridge
	kWebActive chnget "nv_web_active"
	if kWebActive < 0.5 goto done

	kPalette chnget "nv_palette"
	kHarmonyBand chnget "nv_harmony_band"
	kBassDriver chnget "nv_bass_driver"
	kMelodyDriver chnget "nv_melody_driver"
	kRhythmDriver chnget "nv_rhythm_driver"
	kRegisterDriver chnget "nv_register_driver"
	kResponseMode chnget "nv_response_mode"
	kOrchestraMode chnget "nv_orchestra_mode"
	kMotionMode chnget "nv_motion_mode"
	kCc1Mode chnget "nv_cc1_mode"
	kMelodyVolume chnget "nv_melody_volume"
	kMelodyComplexity chnget "nv_melody_complexity"
	kGlobalVolume chnget "nv_global_volume"
	kMetroScale chnget "nv_metro_scale"
	kChordRange chnget "nv_chord_range"
	kMelodyOn chnget "nv_melody_on"
	kPrintToggle chnget "nv_print_toggle"

	gkCurrentProgression = limit(int(kPalette) + 1, 1, 10)
	gkBandSelect = limit(int(kHarmonyBand), 0, 4)
	gkBassDriver = limit(int(kBassDriver), 0, 4)
	gkMelodyDriver = limit(int(kMelodyDriver), 0, 4)
	gkRhythmDriver = limit(int(kRhythmDriver), 0, 4)
	gkRegisterDriver = limit(int(kRegisterDriver), 0, 4)
	gkResponseMode = limit(int(kResponseMode), 0, 4)
	gkOrchestraMode = limit(int(kOrchestraMode), 0, 2)
	gkHarmonyMotionMode = limit(int(kMotionMode), 0, 2)
	gkMelodyCC1Mode = limit(int(kCc1Mode), 0, 1)
	gkMelodyVolume = limit(kMelodyVolume, 0, 1)
	gkMelodyComplexity = limit(kMelodyComplexity, 0, 1)
	gkGlobalVolume = limit(kGlobalVolume, 0, 1)
	gkMetroScale = limit(kMetroScale, 0.01, 3)
	gkChordRange = limit(int(kChordRange), 1, 12)
	gkMelodyOn = limit(int(kMelodyOn), 0, 1)
	gkPrintToggle = limit(int(kPrintToggle), 0, 1)
done:
endin

</CsInstruments>`,
  );
}
