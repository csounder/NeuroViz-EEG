"use client";

import * as React from "react";
import { Radio, Send } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { recorder } from "@/lib/recorder";
import { postStimulusClockHttp, sendStimulusClockOsc } from "@/lib/stimulusClockRelay";
import { stimulusSession } from "@/lib/stimulusSession";

const LS_KEY = "neurovis.stimulusClockRelay.v1";

type Persisted = {
  enabled: boolean;
  hz: number;
  httpUrl: string;
  httpToken: string;
  sendHttp: boolean;
  sendOsc: boolean;
  oscAddress: string;
};

function readPersisted(): Persisted {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      hz: 10,
      httpUrl: "/api/research-event",
      httpToken: "",
      sendHttp: true,
      sendOsc: true,
      oscAddress: "/neurovis/stimulus_clock",
    };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error("empty");
    const j = JSON.parse(raw) as Partial<Persisted>;
    return {
      enabled: Boolean(j.enabled),
      hz: Math.min(20, Math.max(1, Number(j.hz) || 10)),
      httpUrl: typeof j.httpUrl === "string" ? j.httpUrl : "/api/research-event",
      httpToken: typeof j.httpToken === "string" ? j.httpToken : "",
      sendHttp: j.sendHttp !== false,
      sendOsc: j.sendOsc !== false,
      oscAddress:
        typeof j.oscAddress === "string" && j.oscAddress.trim()
          ? j.oscAddress.trim()
          : "/neurovis/stimulus_clock",
    };
  } catch {
    return {
      enabled: false,
      hz: 10,
      httpUrl: "/api/research-event",
      httpToken: "",
      sendHttp: true,
      sendOsc: true,
      oscAddress: "/neurovis/stimulus_clock",
    };
  }
}

function writePersisted(p: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function StimulusClockRelayCard() {
  const [enabled, setEnabled] = React.useState(false);
  const [hz, setHz] = React.useState(10);
  const [httpUrl, setHttpUrl] = React.useState("/api/research-event");
  const [httpToken, setHttpToken] = React.useState("");
  const [sendHttp, setSendHttp] = React.useState(true);
  const [sendOsc, setSendOsc] = React.useState(true);
  const [oscAddress, setOscAddress] = React.useState("/neurovis/stimulus_clock");
  const [lastErr, setLastErr] = React.useState<string | null>(null);
  const [lastOkAt, setLastOkAt] = React.useState<number | null>(null);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    const p = readPersisted();
    setEnabled(p.enabled);
    setHz(p.hz);
    setHttpUrl(p.httpUrl);
    setHttpToken(p.httpToken);
    setSendHttp(p.sendHttp);
    setSendOsc(p.sendOsc);
    setOscAddress(p.oscAddress);
    hydrated.current = true;
  }, []);

  React.useEffect(() => {
    if (!hydrated.current) return;
    writePersisted({
      enabled,
      hz,
      httpUrl,
      httpToken,
      sendHttp,
      sendOsc,
      oscAddress,
    });
  }, [enabled, hz, httpUrl, httpToken, sendHttp, sendOsc, oscAddress]);

  React.useEffect(() => {
    if (!enabled) return;
    const interval = Math.round(1000 / Math.max(1, Math.min(20, hz)));
    const id = window.setInterval(async () => {
      const mode = stimulusSession.getMode();
      const rec = recorder.status();
      const active =
        mode !== "none" || rec.recording || stimulusSession.isLiveMonitorActive();
      if (!active) return;

      const stimulusMs = stimulusSession.getCurrentAudioPositionMs();
      const wallMs = Date.now();
      const detail = `mode=${mode};rec=${rec.recording ? 1 : 0};elapsed=${Math.round(rec.elapsedMs)}`;

      if (sendHttp && httpUrl.trim()) {
        const out = await postStimulusClockHttp(httpUrl.trim(), httpToken.trim() || undefined, {
          label: "stimulus_clock",
          detail,
          audioPositionMs: stimulusMs,
        });
        if (!out.ok) setLastErr(out.error ?? "HTTP failed");
        else {
          setLastErr(null);
          setLastOkAt(Date.now());
        }
      }

      if (sendOsc) {
        const ok = sendStimulusClockOsc(
          oscAddress,
          stimulusMs,
          wallMs,
          mode,
          rec.recording,
          rec.elapsedMs,
        );
        if (!ok && sendOsc && !sendHttp) setLastErr("WebSocket closed (OSC not sent)");
        if (ok) {
          setLastErr(null);
          setLastOkAt(Date.now());
        }
      }
    }, interval);
    return () => window.clearInterval(id);
  }, [enabled, hz, sendHttp, sendOsc, httpUrl, httpToken, oscAddress]);

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Send className="h-4 w-4" />}
          description="Push stimulus clock to HTTP (→ bridge → all WS clients) and/or UDP OSC via the app WebSocket osc_send relay. Uses label stimulus_clock so Concert Observer can read lastStimulusClock without flooding the marker ring."
        >
          External stimulus clock
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500"
          />
          <Radio className="h-3.5 w-3.5 text-zinc-500" />
          Enable streaming (only ticks while live monitor, file loaded, and/or capture running)
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] text-zinc-400">
            Rate (Hz)
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={hz}
              onChange={(e) => setHz(Number(e.target.value))}
              className="mt-0.5 block w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs"
            />
          </label>
        </div>

        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={sendHttp}
              onChange={(e) => setSendHttp(e.target.checked)}
              className="accent-emerald-500"
            />
            HTTP POST (research-event compatible)
          </label>
          <label className="block text-[11px] text-zinc-400">
            URL
            <input
              value={httpUrl}
              onChange={(e) => setHttpUrl(e.target.value)}
              placeholder="/api/research-event"
              className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-200"
            />
          </label>
          <label className="block text-[11px] text-zinc-400">
            Token (optional · X-NeuroVis-Research-Token)
            <input
              value={httpToken}
              onChange={(e) => setHttpToken(e.target.value)}
              type="password"
              autoComplete="off"
              className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-200"
            />
          </label>
        </div>

        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={sendOsc}
              onChange={(e) => setSendOsc(e.target.checked)}
              className="accent-emerald-500"
            />
            OSC via WebSocket relay (requires Node bridge + UDP targets)
          </label>
          <label className="block text-[11px] text-zinc-400">
            Address
            <input
              value={oscAddress}
              onChange={(e) => setOscAddress(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-200"
            />
          </label>
          <p className="text-[10px] leading-relaxed text-zinc-600">
            OSC args:{" "}
            <span className="font-mono text-zinc-500">
              stimulusMs, wallMs, mode (0|1|2), recording (0|1), recElapsedMs
            </span>
          </p>
        </div>

        <div className="text-[10px] text-zinc-500">
          {lastErr ? (
            <span className="text-rose-400/90">Last error: {lastErr}</span>
          ) : lastOkAt ? (
            <span className="text-emerald-600/90">Last send OK · {new Date(lastOkAt).toLocaleTimeString()}</span>
          ) : (
            <span>Idle</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
