"use client";

import * as React from "react";
import { BookOpen, Power, Square } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import type { BandName, BandPowers, EEGMessage } from "@/lib/types";
import type { CsoundObj } from "@csound/browser";

type MotionStreams = {
  accel: number[] | null;
  gyro: number[] | null;
  ppg: number[] | null;
  fnirs?: number[] | null;
};

type TeachingScales = {
  raw: number;
  motion: number;
  ppg: number;
  fnirs: number;
  delta: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
};

type MidiInputInfo = { id: string; name: string; manufacturer?: string };

const TEACHING_KEYBOARD = [
  { label: "C", key: "z", transpose: 0 },
  { label: "D", key: "x", transpose: 2 },
  { label: "E", key: "c", transpose: 4 },
  { label: "F", key: "v", transpose: 5 },
  { label: "G", key: "b", transpose: 7 },
  { label: "A", key: "n", transpose: 9 },
  { label: "B", key: "m", transpose: 11 },
  { label: "C", key: ",", transpose: 12 },
];

const activeToggleClass =
  "rounded-md border border-emerald-400 bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950";
const inactiveToggleClass =
  "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-emerald-400";

const TEACHING_MODELS = [
  {
    id: 0,
    label: "Raw EEG -> Pitch",
    short: "Raw pitch",
    explanation: "Raw TP9/AF7/AF8/TP10 motion bends the pitch of one clean sine-like tone.",
  },
  {
    id: 1,
    label: "PPG / Heart -> Rhythm",
    short: "Heart rhythm",
    explanation: "PPG energy changes the pulse rate and depth of a simple tone.",
  },
  {
    id: 2,
    label: "Gyro -> Filter",
    short: "Gyro filter",
    explanation: "Head rotation opens and closes a low-pass filter.",
  },
  {
    id: 3,
    label: "Accel -> Tremolo",
    short: "Accel tremolo",
    explanation: "Movement controls amplitude tremolo speed and depth.",
  },
  {
    id: 4,
    label: "Alpha -> Melody",
    short: "Alpha melody",
    explanation: "Alpha power chooses the pitch center for a calm melodic tone.",
  },
  {
    id: 5,
    label: "Beta -> Harmony",
    short: "Beta harmony",
    explanation: "Beta power brightens and thickens a three-note harmony.",
  },
  {
    id: 6,
    label: "Gamma -> Brightness",
    short: "Gamma color",
    explanation: "Gamma power opens the timbre and adds upper partials.",
  },
  {
    id: 7,
    label: "Band Compare",
    short: "Band compare",
    explanation: "Delta through gamma each contribute one clear register to the sound.",
  },
  {
    id: 8,
    label: "fNIRS -> Timbre",
    short: "fNIRS color",
    explanation: "Optical/fNIRS movement slowly opens a warm timbre and stereo space.",
  },
  {
    id: 9,
    label: "Four Sensors -> SATB Chord",
    short: "SATB chord",
    explanation: "TP9, AF7, AF8, and TP10 independently bend bass, tenor, alto, and soprano chord tones.",
  },
];

export function TeachingCsoundRenderer({
  latestEEG,
  latestBandsAbs,
  latestBandsRel,
  motion,
}: {
  latestEEG: EEGMessage | null;
  latestBandsAbs: BandPowers | null;
  latestBandsRel: BandPowers | null;
  motion: MotionStreams;
}) {
  const csoundRef = React.useRef<CsoundObj | null>(null);
  const midiAccessRef = React.useRef<any>(null);
  const midiHeldNotesRef = React.useRef<Set<number>>(new Set());
  const lastCcLogRef = React.useRef(0);
  const [status, setStatus] = React.useState<"idle" | "loading" | "running" | "error">("idle");
  const [midiStatus, setMidiStatus] = React.useState<"idle" | "ready" | "unsupported" | "error">("idle");
  const [midiInputs, setMidiInputs] = React.useState<MidiInputInfo[]>([]);
  const [selectedMidiInputId, setSelectedMidiInputId] = React.useState("");
  const [midiCcs, setMidiCcs] = React.useState<Record<number, number>>({});
  const [model, setModel] = React.useState(0);
  const [instrumentOn, setInstrumentOn] = React.useState(false);
  const [volume, setVolume] = React.useState(0.4);
  const [transpose, setTranspose] = React.useState(0);
  const [demoStyle, setDemoStyle] = React.useState<0 | 1>(0);
  const [heldTeachingKey, setHeldTeachingKey] = React.useState<string | null>(null);
  const [scales, setScales] = React.useState<TeachingScales>({
    raw: 1.5,
    motion: 5,
    ppg: 8,
    fnirs: 4,
    delta: 4,
    theta: 4,
    alpha: 5,
    beta: 5,
    gamma: 6,
  });
  const [rollingTrace, setRollingTrace] = React.useState<number[]>([]);
  const [logs, setLogs] = React.useState<string[]>([]);
  const demoSignals = React.useMemo(
    () => buildDemoSignals({ latestEEG, latestBandsAbs, latestBandsRel, motion, scales }),
    [latestEEG, latestBandsAbs, latestBandsRel, motion, scales],
  );
  const selected = React.useMemo(() => selectedSignal(model, demoSignals), [model, demoSignals]);

  const appendLog = React.useCallback((line: string) => {
    const cleaned = line.trim();
    if (!cleaned) return;
    setLogs((prev) => [...prev.slice(-39), cleaned]);
  }, []);

  React.useEffect(() => {
    return () => {
      disconnectMidiInputs();
      void stop();
    };
  }, []);

  React.useEffect(() => {
    const access = midiAccessRef.current;
    if (!access) return;
    for (const input of access.inputs.values()) {
      input.onmidimessage = null;
    }
    const selected = access.inputs.get(selectedMidiInputId);
    if (!selected) return;
    selected.onmidimessage = (event: { data?: Uint8Array }) => {
      if (!event.data) return;
      const [statusByte = 0, data1 = 0, data2 = 0] = Array.from(event.data);
      const kind = statusByte & 0xf0;
      if (kind === 0x90 && data2 > 0) {
        const transposeFromMidi = clamp(data1 - 60, -24, 24);
        midiHeldNotesRef.current.add(data1);
        setTranspose(transposeFromMidi);
        setHeldTeachingKey(`midi-${data1}`);
        setInstrumentOn(true);
      } else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) {
        midiHeldNotesRef.current.delete(data1);
        if (midiHeldNotesRef.current.size === 0) {
          setHeldTeachingKey(null);
          setInstrumentOn(false);
        } else {
          const last = Array.from(midiHeldNotesRef.current).at(-1) ?? 60;
          setTranspose(clamp(last - 60, -24, 24));
          setHeldTeachingKey(`midi-${last}`);
        }
      } else if (kind === 0xb0) {
        const value = data2 / 127;
        setMidiCcs((prev) => ({ ...prev, [data1]: value }));
        applyTeachingCc(data1, value);
        const csound = csoundRef.current;
        if (csound) {
          void csound.setControlChannel(`teach_cc${data1}`, value);
        }
        const now = performance.now();
        if (now - lastCcLogRef.current > 500) {
          appendLog(`Teaching MIDI CC${data1}: ${value.toFixed(3)}`);
          lastCcLogRef.current = now;
        }
      } else if (kind === 0xe0) {
        const raw14 = data1 + data2 * 128;
        const value = clamp((raw14 - 8192) / 8192, -1, 1);
        setTranspose(clamp(Math.round(value * 12), -12, 12));
      }
    };
    appendLog(`Teaching USB MIDI input connected: ${selected.name || "MIDI input"}`);
  }, [appendLog, selectedMidiInputId]);

  React.useEffect(() => {
    const csound = csoundRef.current;
    if (!csound) return;
    void syncTeaching(csound, {
      latestEEG,
      latestBandsAbs,
      latestBandsRel,
      motion,
      model,
      volume,
      transpose,
      demoStyle,
      scales,
      instrumentOn,
    });
  }, [latestEEG, latestBandsAbs, latestBandsRel, motion, model, volume, transpose, demoStyle, scales, instrumentOn]);

  React.useEffect(() => {
    setRollingTrace((prev) => [...prev.slice(-239), selected.normalized]);
  }, [selected.normalized]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if (event.code === "Space") {
        event.preventDefault();
        setInstrumentOn((current) => !current);
        return;
      }
      const key = event.key.toLowerCase();
      const note = TEACHING_KEYBOARD.find((item) => item.key === key);
      if (note) {
        event.preventDefault();
        setTranspose(note.transpose);
        setHeldTeachingKey(note.key);
        setInstrumentOn(true);
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (TEACHING_KEYBOARD.some((item) => item.key === key)) {
        event.preventDefault();
        setHeldTeachingKey((held) => (held === key ? null : held));
        setInstrumentOn(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  async function start() {
    if (csoundRef.current || status === "loading") return;
    setStatus("loading");
    setLogs([]);
    try {
      const { Csound } = await import("@csound/browser");
      const csound = await Csound();
      if (!csound) throw new Error("Csound WASM failed to initialize");

      csound.on("message", (msg: unknown) => appendLog(String(msg)));
      csound.on("realtimePerformanceStarted", () => {
        appendLog("Teaching WebAudio performance started.");
        setStatus("running");
      });
      csound.on("realtimePerformanceEnded", () => {
        appendLog("Teaching WebAudio performance ended.");
        setStatus("idle");
      });

      const audioContext = await csound.getAudioContext();
      await audioContext?.resume();
      await csound.setOption("-odac");
      await csound.setOption("-m128");
      const result = await csound.compileOrc(teachingOrc());
      if (result !== 0) throw new Error(`Teaching orchestra compilation failed: ${result}`);

      csoundRef.current = csound;
      setInstrumentOn(true);
      await syncTeaching(csound, {
        latestEEG,
        latestBandsAbs,
        latestBandsRel,
        motion,
        model,
        volume,
        transpose,
        demoStyle,
        scales,
        instrumentOn: true,
      });
      await csound.readScore("f 0 86400\ni 990 0 86400\ni 910 0 86400\n");
      await csound.start();
      await csound.inputMessage("i 990 0 86400");
      await csound.inputMessage("i 910 0 86400");
      await connectTeachingCsoundNode(csound, appendLog);
      appendLog(`Teaching model: ${TEACHING_MODELS[model].label}`);
      appendLog("Teaching instrument gate opened. Use Instrument Off or Space to mute it.");
    } catch (error) {
      appendLog(`Start error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus("error");
      await stop();
    }
  }

  async function stop() {
    const csound = csoundRef.current;
    if (!csound) return;
    try {
      await csound.stop();
      await csound.destroy();
    } catch (error) {
      appendLog(`Stop error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      csoundRef.current = null;
      setInstrumentOn(false);
      setStatus("idle");
    }
  }

  function selectModel(next: number) {
    setModel(next);
    appendLog(`Teaching model: ${TEACHING_MODELS[next].label}`);
  }

  function applyTeachingCc(cc: number, value: number) {
    if (cc === 1) {
      setVolume(clamp(0.12 + value * 0.85, 0, 1));
    } else if (cc === 21) {
      setScales((s) => ({ ...s, raw: 0.25 + value * 11.75 }));
    } else if (cc === 22) {
      setScales((s) => ({ ...s, motion: 0.25 + value * 11.75 }));
    } else if (cc === 23) {
      setScales((s) => ({ ...s, alpha: 0.25 + value * 11.75 }));
    } else if (cc === 24) {
      setScales((s) => ({ ...s, beta: 0.25 + value * 11.75 }));
    } else if (cc === 25) {
      setScales((s) => ({ ...s, gamma: 0.25 + value * 11.75 }));
    } else if (cc === 26) {
      setDemoStyle(value > 0.5 ? 1 : 0);
    } else if (cc === 27) {
      setScales((s) => ({ ...s, ppg: 0.25 + value * 11.75 }));
    } else if (cc === 28) {
      setScales((s) => ({ ...s, fnirs: 0.25 + value * 11.75 }));
    }
  }

  async function enableMidi() {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      setMidiStatus("unsupported");
      appendLog("Web MIDI is not supported in this browser.");
      return;
    }
    try {
      const access = await (navigator as any).requestMIDIAccess();
      midiAccessRef.current = access;
      setMidiStatus("ready");
      refreshMidiInputs(access);
      access.onstatechange = () => refreshMidiInputs(access);
      appendLog("Teaching USB MIDI access enabled.");
    } catch (error) {
      setMidiStatus("error");
      appendLog(`Teaching MIDI error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function refreshMidiInputs(access = midiAccessRef.current) {
    if (!access) return;
    const inputs = Array.from(access.inputs.values()).map((input: any) => ({
      id: input.id,
      name: input.name || "MIDI input",
      manufacturer: input.manufacturer || "",
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
    midiHeldNotesRef.current.clear();
    access.onstatechange = null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === "running" ? "emerald" : status === "error" ? "rose" : "neutral"} dot>
              Teaching Csound {status}
            </Badge>
            <Badge tone="indigo">One sensor, one sound</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            These demos intentionally avoid complex concert orchestration. Each preset isolates a
            sensor-to-music mapping so students can hear what one stream is doing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={start} disabled={status === "loading" || status === "running"} leftIcon={<Power className="h-4 w-4" />}>
            Start Teaching Audio
          </Button>
          <Button
            variant={instrumentOn ? "primary" : "outline"}
            onClick={() => setInstrumentOn((current) => !current)}
            disabled={status !== "running"}
          >
            {instrumentOn ? "Instrument On" : "Instrument Off"}
          </Button>
          <Button variant="outline" onClick={stop} disabled={!csoundRef.current} leftIcon={<Square className="h-4 w-4" />}>
            Stop
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {TEACHING_MODELS.map((item) => (
          <button
            key={item.id}
            onClick={() => selectModel(item.id)}
            className={[
              "rounded-xl border p-3 text-left transition",
              model === item.id
                ? "border-emerald-400/80 bg-emerald-500/15 shadow-[0_0_28px_-16px_rgba(16,185,129,.95)]"
                : "border-zinc-800 bg-zinc-950/45 hover:border-zinc-600 hover:bg-zinc-900/70",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <BookOpen className="h-4 w-4 text-emerald-300" />
              {item.label}
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{item.explanation}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <Slider
            label="Teaching output volume"
            value={volume}
            min={0}
            max={1}
            step={0.01}
            onChange={setVolume}
            format={(v) => v.toFixed(2)}
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ScaleSlider label="Raw EEG scale" value={scales.raw} onChange={(raw) => setScales((s) => ({ ...s, raw }))} />
            <ScaleSlider label="Motion scale" value={scales.motion} onChange={(motionScale) => setScales((s) => ({ ...s, motion: motionScale }))} />
            <ScaleSlider label="PPG scale" value={scales.ppg} onChange={(ppg) => setScales((s) => ({ ...s, ppg }))} />
            <ScaleSlider label="fNIRS scale" value={scales.fnirs} onChange={(fnirs) => setScales((s) => ({ ...s, fnirs }))} />
            <ScaleSlider label="Delta scale" value={scales.delta} onChange={(delta) => setScales((s) => ({ ...s, delta }))} />
            <ScaleSlider label="Theta scale" value={scales.theta} onChange={(theta) => setScales((s) => ({ ...s, theta }))} />
            <ScaleSlider label="Alpha scale" value={scales.alpha} onChange={(alpha) => setScales((s) => ({ ...s, alpha }))} />
            <ScaleSlider label="Beta scale" value={scales.beta} onChange={(beta) => setScales((s) => ({ ...s, beta }))} />
            <ScaleSlider label="Gamma scale" value={scales.gamma} onChange={(gamma) => setScales((s) => ({ ...s, gamma }))} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
            <button
              className={demoStyle === 0 ? activeToggleClass : inactiveToggleClass}
              onClick={() => setDemoStyle(0)}
            >
              Clear Demo
            </button>
            <button
              className={demoStyle === 1 ? activeToggleClass : inactiveToggleClass}
              onClick={() => setDemoStyle(1)}
            >
              Musical Demo
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">
            <div className="font-semibold text-zinc-200">{TEACHING_MODELS[model].label}</div>
            <div className="mt-1">{TEACHING_MODELS[model].explanation}</div>
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2 font-mono text-[11px] text-zinc-300">
              Press Space to toggle, or Z X C V B N M , to momentarily gate and transpose the current demo.
            </div>
          </div>
        </div>
        <DemoSignalPanel model={model} signals={demoSignals} selected={selected} instrumentOn={instrumentOn} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <WaveformTrace selected={selected} values={rollingTrace} />
        <TeachingKeyboard
          transpose={transpose}
          heldKey={heldTeachingKey}
          onGate={(item) => {
            setTranspose(item.transpose);
            setHeldTeachingKey(item.key);
            setInstrumentOn(true);
          }}
          onRelease={() => {
            setHeldTeachingKey(null);
            setInstrumentOn(false);
          }}
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              USB MIDI Teaching Control
            </div>
            <div className="mt-1 text-sm text-zinc-300">
              Notes gate/transpose the selected demo. CC1 controls volume; CC21-28 tune the teaching scales/style.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={enableMidi}>
              Enable USB MIDI
            </Button>
            <Badge tone={midiStatus === "ready" ? "emerald" : midiStatus === "error" || midiStatus === "unsupported" ? "rose" : "neutral"} dot={midiStatus === "ready"}>
              {midiStatus}
            </Badge>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
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
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MidiCcTile label="CC1 Volume" value={midiCcs[1]} />
            <MidiCcTile label="CC21 Raw" value={midiCcs[21]} />
            <MidiCcTile label="CC22 Motion" value={midiCcs[22]} />
            <MidiCcTile label="CC23 Alpha" value={midiCcs[23]} />
            <MidiCcTile label="CC24 Beta" value={midiCcs[24]} />
            <MidiCcTile label="CC25 Gamma" value={midiCcs[25]} />
            <MidiCcTile label="CC26 Style" value={midiCcs[26]} />
            <MidiCcTile label="CC27 PPG / 28 fNIRS" value={Math.max(midiCcs[27] ?? 0, midiCcs[28] ?? 0)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <SignalTrace label="Raw EEG channels" values={demoSignals.rawChannels} range={250} />
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Teaching Csound Console
          </div>
          <pre className="h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-400">
            {logs.length ? logs.join("\n") : "Teaching Csound messages will appear here."}
          </pre>
        </div>
      </div>
    </div>
  );
}

async function syncTeaching(
  csound: CsoundObj,
  data: {
    latestEEG: EEGMessage | null;
    latestBandsAbs: BandPowers | null;
    latestBandsRel: BandPowers | null;
    motion: MotionStreams;
    model: number;
    volume: number;
    transpose: number;
    demoStyle: 0 | 1;
    scales: TeachingScales;
    instrumentOn: boolean;
  },
) {
  const raw = data.latestEEG?.raw ?? [];
  const accel = data.motion.accel ?? [];
  const gyro = data.motion.gyro ?? [];
  const ppg = data.motion.ppg ?? [];
  const fnirs = data.motion.fnirs ?? [];
  const writes: Promise<unknown>[] = [
    csound.setControlChannel("teach_model", data.model),
    csound.setControlChannel("teach_volume", data.volume),
    csound.setControlChannel("teach_transpose", data.transpose),
    csound.setControlChannel("teach_style", data.demoStyle),
    csound.setControlChannel("teach_raw_scale", data.scales.raw),
    csound.setControlChannel("teach_gate", data.instrumentOn ? 1 : 0),
  ];

  for (let i = 0; i < 4; i += 1) {
    writes.push(csound.setControlChannel(`teach_raw_${i + 1}`, clamp(Number(raw[i]) || 0, -1200, 1200)));
  }

  for (const band of ["delta", "theta", "alpha", "beta", "gamma"] as BandName[]) {
    const abs = data.latestBandsAbs?.[band] ?? -2.5;
    const rel = data.latestBandsRel?.[band];
    writes.push(csound.setControlChannel(`teach_${band}`, abs));
    writes.push(csound.setControlChannel(`teach_${band}_n`, clamp((rel ?? (abs + 2.5) / 4) * data.scales[band], 0, 1)));
  }

  writes.push(csound.setControlChannel("teach_accel_mag", clamp(accelFeature(accel) * data.scales.motion, 0, 8)));
  writes.push(csound.setControlChannel("teach_gyro_mag", clamp(gyroFeature(gyro) * data.scales.motion, 0, 8)));
  writes.push(csound.setControlChannel("teach_ppg_mag", clamp(ppgFeature(ppg) * data.scales.ppg, 0, 8)));
  writes.push(csound.setControlChannel("teach_fnirs_mag", clamp(fnirsFeature(fnirs) * data.scales.fnirs, 0, 8)));

  await Promise.all(writes);
}

function teachingOrc() {
  return `
sr = 44100
ksmps = 32
nchnls = 2
0dbfs = 1
seed 0

instr 990
  aSilence oscili 0, 20
  outs aSilence, aSilence
endin

instr 910
  kModel chnget "teach_model"
  kVol chnget "teach_volume"
  kGate chnget "teach_gate"
  kTranspose chnget "teach_transpose"
  kStyle chnget "teach_style"
  kRawScale chnget "teach_raw_scale"
  kRaw1 chnget "teach_raw_1"
  kRaw2 chnget "teach_raw_2"
  kRaw3 chnget "teach_raw_3"
  kRaw4 chnget "teach_raw_4"
  kDelta chnget "teach_delta"
  kTheta chnget "teach_theta"
  kAlpha chnget "teach_alpha"
  kBeta chnget "teach_beta"
  kGamma chnget "teach_gamma"
  kDeltaN chnget "teach_delta_n"
  kThetaN chnget "teach_theta_n"
  kAlphaN chnget "teach_alpha_n"
  kBetaN chnget "teach_beta_n"
  kGammaN chnget "teach_gamma_n"
  kAccel chnget "teach_accel_mag"
  kGyro chnget "teach_gyro_mag"
  kPpg chnget "teach_ppg_mag"
  kFnirs chnget "teach_fnirs_mag"
  kGate portk kGate, 0.02
  kRawShape = (kRaw1 - kRaw2 + kRaw3 - kRaw4) / 4
  kRawMotion = limit(kRawShape * kRawScale * 0.018, -36, 36)
  kRawNote = 60 + kTranspose + kRawMotion
  kRawFreq = cpsmidinn(kRawNote)
  kRawFreq portk kRawFreq, 0.025
  kPpgRate = 0.7 + limit(kPpg, 0, 8) * 2.5
  kPpgLfo lfo 0.85, kPpgRate, 0
  kGyroCutoff = 180 + limit(kGyro, 0, 8) * 1800
  kGyroCutoff portk kGyroCutoff, 0.03
  kTremRate = 0.8 + limit(kAccel, 0, 8) * 1.8
  kTrem lfo 0.48, kTremRate, 0
  kAlphaNote = 55 + kTranspose + int(kAlphaN * 12)
  kAlphaFreq = cpsmidinn(kAlphaNote)
  aRawFund poscil 0.24, kRawFreq
  aRawHarm poscil 0.035, kRawFreq * 2
  aRaw = aRawFund + aRawHarm
  aRaw tone aRaw, 2200
  aPpg poscil 0.26 * (0.45 + kPpgLfo), 220
  aGyro vco2 0.42, cpsmidinn(43 + kTranspose)
  aGyro moogladder aGyro, kGyroCutoff, 0.82
  aAccel poscil 0.24 * (0.72 + kTrem), cpsmidinn(48 + kTranspose)
  aAlpha poscil 0.20, kAlphaFreq
  aAlpha = aAlpha + poscil(0.05, cpsmidinn(kAlphaNote + 7))
  kBetaRoot = cpsmidinn(45 + kTranspose)
  aBeta poscil 0.10 + kBetaN * 0.24, kBetaRoot
  aBeta = aBeta + poscil(0.06 + kBetaN * 0.20, kBetaRoot * 1.25)
  aBeta = aBeta + poscil(0.04 + kBetaN * 0.18, kBetaRoot * 1.5)
  aGamma vco2 0.18, cpsmidinn(50 + kTranspose)
  aGamma tone aGamma, 500 + kGammaN * 9500
  aGamma = aGamma + poscil(0.03 + kGammaN * 0.20, cpsmidinn(74 + kTranspose))
  aFnirs vco2 0.20 + limit(kFnirs, 0, 8) * 0.025, cpsmidinn(38 + kTranspose)
  aFnirs tone aFnirs, 700 + limit(kFnirs, 0, 8) * 1300
  aFnirs = aFnirs + poscil(0.05 + limit(kFnirs, 0, 8) * 0.025, cpsmidinn(50 + kTranspose))
  aCompare = poscil(0.02 + kDeltaN * 0.24, cpsmidinn(36 + kTranspose))
  aCompare = aCompare + poscil(0.02 + kThetaN * 0.22, cpsmidinn(43 + kTranspose))
  aCompare = aCompare + poscil(0.02 + kAlphaN * 0.20, cpsmidinn(50 + kTranspose))
  aCompare = aCompare + poscil(0.02 + kBetaN * 0.18, cpsmidinn(57 + kTranspose))
  aCompare = aCompare + poscil(0.02 + kGammaN * 0.16, cpsmidinn(69 + kTranspose))
  kBassNote = 36 + kTranspose + limit(kRaw1 * kRawScale * 0.018, -7, 7)
  kTenorNote = 48 + kTranspose + limit(kRaw2 * kRawScale * 0.018, -7, 7)
  kAltoNote = 55 + kTranspose + limit(kRaw3 * kRawScale * 0.018, -7, 7)
  kSopranoNote = 64 + kTranspose + limit(kRaw4 * kRawScale * 0.018, -7, 7)
  aSatb = poscil(0.12, cpsmidinn(kBassNote))
  aSatb = aSatb + poscil(0.10, cpsmidinn(kTenorNote))
  aSatb = aSatb + poscil(0.09, cpsmidinn(kAltoNote))
  aSatb = aSatb + poscil(0.08, cpsmidinn(kSopranoNote))
  aSatb tone aSatb, 1100 + kBetaN * 5200
  aMix = aRaw
  if (kModel == 1) then
    aMix = aPpg
  elseif (kModel == 2) then
    aMix = aGyro
  elseif (kModel == 3) then
    aMix = aAccel
  elseif (kModel == 4) then
    aMix = aAlpha
  elseif (kModel == 5) then
    aMix = aBeta
  elseif (kModel == 6) then
    aMix = aGamma
  elseif (kModel == 7) then
    aMix = aCompare
  elseif (kModel == 8) then
    aMix = aFnirs
  elseif (kModel == 9) then
    aMix = aSatb
  endif
  if (kStyle == 1) then
    aColor poscil 0.06 + kGammaN * 0.08, cpsmidinn(74 + kTranspose)
    aMix = (aMix * 0.82) + (aColor * 0.22)
  endif
  aWide delay aMix, 0.018
  kRev = 0.60 + kStyle * 0.25
  aRevL, aRevR reverbsc aMix, aWide, kRev, 9000
  outs (aMix * (0.82 - kStyle * 0.12) + aRevL * (0.14 + kStyle * 0.20)) * kVol * kGate, (aWide * (0.82 - kStyle * 0.12) + aRevR * (0.14 + kStyle * 0.20)) * kVol * kGate
endin
`;
}

type DemoSignals = {
  rawChannels: number[];
  rawPitchHz: number;
  ppgPulseRate: number;
  gyroCutoffHz: number;
  accelTremoloHz: number;
  fnirsTimbreHz: number;
  satbMotionSemitones: number;
  bands: Record<BandName, number>;
};

function buildDemoSignals({
  latestEEG,
  latestBandsAbs,
  latestBandsRel,
  motion,
  scales,
}: {
  latestEEG: EEGMessage | null;
  latestBandsAbs: BandPowers | null;
  latestBandsRel: BandPowers | null;
  motion: MotionStreams;
  scales: TeachingScales;
}): DemoSignals {
  const rawChannels = [0, 1, 2, 3].map((i) => Number(latestEEG?.raw?.[i]) || 0);
  const rawShape = (rawChannels[0] - rawChannels[1] + rawChannels[2] - rawChannels[3]) / 4;
  const rawMotionSemis = clamp(rawShape * scales.raw * 0.018, -36, 36);
  const satbMotionSemitones =
    rawChannels.reduce((sum, value) => sum + Math.abs(clamp(value * scales.raw * 0.018, -7, 7)), 0) /
    Math.max(1, rawChannels.length);
  const accelMag = accelFeature(motion.accel ?? []) * scales.motion;
  const gyroMag = gyroFeature(motion.gyro ?? []) * scales.motion;
  const ppgMag = ppgFeature(motion.ppg ?? []) * scales.ppg;
  const fnirsMag = fnirsFeature(motion.fnirs ?? []) * scales.fnirs;
  const bands = {
    delta: clamp(normalizedBand("delta", latestBandsAbs, latestBandsRel) * scales.delta, 0, 1),
    theta: clamp(normalizedBand("theta", latestBandsAbs, latestBandsRel) * scales.theta, 0, 1),
    alpha: clamp(normalizedBand("alpha", latestBandsAbs, latestBandsRel) * scales.alpha, 0, 1),
    beta: clamp(normalizedBand("beta", latestBandsAbs, latestBandsRel) * scales.beta, 0, 1),
    gamma: clamp(normalizedBand("gamma", latestBandsAbs, latestBandsRel) * scales.gamma, 0, 1),
  };
  return {
    rawChannels,
    rawPitchHz: midiToHz(60 + rawMotionSemis),
    ppgPulseRate: 0.7 + clamp(ppgMag, 0, 8) * 2.5,
    gyroCutoffHz: 180 + clamp(gyroMag, 0, 8) * 1800,
    accelTremoloHz: 0.8 + clamp(accelMag, 0, 8) * 1.8,
    fnirsTimbreHz: 700 + clamp(fnirsMag, 0, 8) * 1300,
    satbMotionSemitones,
    bands,
  };
}

function normalizedBand(
  band: BandName,
  latestBandsAbs: BandPowers | null,
  latestBandsRel: BandPowers | null,
) {
  const rel = latestBandsRel?.[band];
  if (typeof rel === "number" && Number.isFinite(rel)) return clamp(rel, 0, 1);
  return clamp(((latestBandsAbs?.[band] ?? -2.5) + 2.5) / 4, 0, 1);
}

function midiToHz(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function DemoSignalPanel({
  model,
  signals,
  selected,
  instrumentOn,
}: {
  model: number;
  signals: DemoSignals;
  selected: ReturnType<typeof selectedSignal>;
  instrumentOn: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Visible Control Signal
          </div>
          <div className="mt-1 text-sm font-semibold text-zinc-100">{selected.label}</div>
        </div>
        <Badge tone={instrumentOn ? "emerald" : "neutral"} dot>
          {instrumentOn ? "Sounding" : "Muted"}
        </Badge>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between font-mono text-xs">
          <span className="text-zinc-500">{selected.units}</span>
          <span className="text-emerald-200">{selected.display}</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width]"
            style={{ width: `${Math.round(selected.normalized * 100)}%` }}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {(["delta", "theta", "alpha", "beta", "gamma"] as BandName[]).map((band) => (
          <div key={band} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
            <div className="text-[10px] uppercase text-zinc-500">{band}</div>
            <div className="mt-1 h-16 overflow-hidden rounded bg-zinc-900">
              <div
                className="mt-auto h-full origin-bottom rounded bg-cyan-400/80"
                style={{
                  transform: `scaleY(${signals.bands[band]})`,
                }}
              />
            </div>
            <div className="mt-1 font-mono text-[10px] text-zinc-400">{signals.bands[band].toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScaleSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Slider
      label={label}
      value={value}
      min={0.25}
      max={12}
      step={0.25}
      onChange={onChange}
      format={(v) => `${v.toFixed(2)}x`}
    />
  );
}

function WaveformTrace({
  selected,
  values,
}: {
  selected: ReturnType<typeof selectedSignal>;
  values: number[];
}) {
  const points = values.length
    ? values
        .map((value, index) => {
          const x = (index / Math.max(1, values.length - 1)) * 100;
          const y = 92 - clamp(value, 0, 1) * 84;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ")
    : "";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Time-Domain Control Stream
          </div>
          <div className="mt-1 text-sm font-semibold text-zinc-100">{selected.label}</div>
        </div>
        <div className="font-mono text-xs text-emerald-200">{selected.display}</div>
      </div>
      <svg className="h-36 w-full rounded-lg border border-zinc-800 bg-zinc-950" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(113,113,122,.45)" strokeWidth="0.5" />
        <polyline fill="none" stroke="rgb(45,212,191)" strokeWidth="1.8" points={points} />
      </svg>
      <div className="mt-2 text-xs leading-5 text-zinc-500">
        This is the live control value after exaggeration scaling, not audio output.
      </div>
    </div>
  );
}

function TeachingKeyboard({
  transpose,
  heldKey,
  onGate,
  onRelease,
}: {
  transpose: number;
  heldKey: string | null;
  onGate: (item: (typeof TEACHING_KEYBOARD)[number]) => void;
  onRelease: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Gate / Transpose Keyboard
          </div>
          <div className="mt-1 text-sm font-semibold text-zinc-100">
            Current transpose: +{transpose} semitones
          </div>
        </div>
        <Badge tone={heldKey ? "emerald" : "neutral"} dot>
          {heldKey ? "Key held" : "Momentary"}
        </Badge>
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {TEACHING_KEYBOARD.map((item) => (
          <button
            key={item.key}
            className={[
              "touch-none rounded-lg border px-2 py-5 text-center transition",
              heldKey === item.key
                ? "border-emerald-300 bg-emerald-300 text-zinc-950"
                : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-emerald-400 hover:bg-emerald-500/10",
            ].join(" ")}
            onMouseDown={() => onGate(item)}
            onMouseUp={onRelease}
            onMouseLeave={() => heldKey === item.key && onRelease()}
            onTouchStart={() => onGate(item)}
            onTouchEnd={onRelease}
          >
            <div className="text-sm font-semibold">{item.label}</div>
            <div className="mt-1 font-mono text-[10px] opacity-70">{item.key.toUpperCase()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MidiCcTile({ label, value }: { label: string; value: number | undefined }) {
  const normalized = clamp(value ?? 0, 0, 1);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-zinc-400">{label}</span>
        <span className="font-mono text-[10px] text-zinc-300">{normalized.toFixed(2)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(normalized * 100)}%` }} />
      </div>
    </div>
  );
}

function selectedSignal(model: number, signals: DemoSignals) {
  if (model === 1) {
    return {
      label: "PPG magnitude controls pulse rate",
      units: "pulse rate",
      display: `${signals.ppgPulseRate.toFixed(2)} Hz`,
      normalized: clamp((signals.ppgPulseRate - 1.2) / 14, 0, 1),
    };
  }
  if (model === 2) {
    return {
      label: "Gyroscope magnitude controls filter cutoff",
      units: "low-pass cutoff",
      display: `${Math.round(signals.gyroCutoffHz)} Hz`,
      normalized: clamp(signals.gyroCutoffHz / 16000, 0, 1),
    };
  }
  if (model === 3) {
    return {
      label: "Accelerometer magnitude controls tremolo",
      units: "tremolo rate",
      display: `${signals.accelTremoloHz.toFixed(2)} Hz`,
      normalized: clamp(signals.accelTremoloHz / 25, 0, 1),
    };
  }
  if (model === 4) {
    return {
      label: "Alpha relative power controls melody pitch",
      units: "alpha power",
      display: signals.bands.alpha.toFixed(3),
      normalized: signals.bands.alpha,
    };
  }
  if (model === 5) {
    return {
      label: "Beta relative power controls harmony brightness",
      units: "beta power",
      display: signals.bands.beta.toFixed(3),
      normalized: signals.bands.beta,
    };
  }
  if (model === 6) {
    return {
      label: "Gamma relative power controls upper partials",
      units: "gamma power",
      display: signals.bands.gamma.toFixed(3),
      normalized: signals.bands.gamma,
    };
  }
  if (model === 7) {
    const total = Object.values(signals.bands).reduce((sum, value) => sum + value, 0);
    return {
      label: "All five bands control five audible registers",
      units: "combined band activity",
      display: total.toFixed(3),
      normalized: clamp(total / 2, 0, 1),
    };
  }
  if (model === 8) {
    return {
      label: "fNIRS / optical activity controls timbre and space",
      units: "fNIRS timbre",
      display: `${Math.round(signals.fnirsTimbreHz)} Hz`,
      normalized: clamp((signals.fnirsTimbreHz - 700) / 10400, 0, 1),
    };
  }
  if (model === 9) {
    return {
      label: "Four EEG sensors bend bass, tenor, alto, soprano",
      units: "average voice motion",
      display: `${signals.satbMotionSemitones.toFixed(2)} semitones`,
      normalized: clamp(signals.satbMotionSemitones / 7, 0, 1),
    };
  }
  return {
    label: "Raw EEG channel difference controls oscillator pitch",
    units: "oscillator pitch",
    display: `${Math.round(signals.rawPitchHz)} Hz`,
    normalized: clamp((Math.log2(signals.rawPitchHz / midiToHz(60)) + 3) / 6, 0, 1),
  };
}

function SignalTrace({ label, values, range }: { label: string; values: number[]; range: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="grid gap-2">
        {values.map((value, index) => {
          const normalized = clamp((value + range) / (range * 2), 0, 1);
          return (
            <div key={index}>
              <div className="mb-1 flex justify-between font-mono text-[11px] text-zinc-400">
                <span>CH {index + 1}</span>
                <span>{value.toFixed(2)} uV</span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
                <div className="absolute left-1/2 top-0 h-full w-px bg-zinc-600" />
                <div
                  className="h-full rounded-full bg-cyan-400"
                  style={{
                    marginLeft: value >= 0 ? "50%" : `${normalized * 100}%`,
                    width: `${Math.abs(normalized - 0.5) * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function connectTeachingCsoundNode(
  csound: CsoundObj,
  appendLog: (line: string) => void,
) {
  try {
    const [node, audioContext] = await Promise.all([
      csound.getNode(),
      csound.getAudioContext(),
    ]);
    if (!node || !audioContext) {
      appendLog("Teaching Csound AudioNode not available yet after start().");
      return;
    }
    try {
      node.connect(audioContext.destination);
      appendLog("Teaching Csound AudioNode connected to browser destination.");
    } catch {
      appendLog("Teaching Csound AudioNode already connected or connection was rejected.");
    }
  } catch (error) {
    appendLog(`Teaching Csound node connection check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function magnitude(values: number[]) {
  if (!values.length) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function accelFeature(values: number[]) {
  if (!values.length) return 0;
  const x = Number(values[0]) || 0;
  const y = Number(values[1]) || 0;
  const z = (Number(values[2]) || 0) - 1;
  return Math.sqrt(x * x + y * y + z * z);
}

function gyroFeature(values: number[]) {
  return magnitude(values) / 12;
}

function ppgFeature(values: number[]) {
  if (!values.length) return 0;
  const avg = values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length;
  if (Math.abs(avg) > 1000) {
    return clamp((avg - 60000) / 7000, 0, 2);
  }
  return clamp(Math.abs(avg), 0, 2);
}

function fnirsFeature(values: number[]) {
  if (!values.length) return 0;
  return clamp(values.reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0) / values.length, 0, 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

