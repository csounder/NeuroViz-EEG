"use client";

import { wsSend, isWsOpen } from "@/lib/useWebSocket";

export type StimulusClockPostBody = {
  label: "stimulus_clock";
  detail: string;
  audioPositionMs: number;
};

export async function postStimulusClockHttp(
  url: string,
  token: string | undefined,
  body: StimulusClockPostBody,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token?.trim()) headers["X-NeuroVis-Research-Token"] = token.trim();
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, error: t || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Args: stimulusMs, wallMs, mode (0 none / 1 file / 2 live), recording 0|1, recElapsedMs */
export function sendStimulusClockOsc(
  address: string,
  stimulusMs: number,
  wallMs: number,
  mode: "none" | "file" | "live",
  recording: boolean,
  recordingElapsedMs: number,
): boolean {
  if (!isWsOpen()) return false;
  const modeN = mode === "live" ? 2 : mode === "file" ? 1 : 0;
  return wsSend({
    type: "osc_send",
    msgs: [
      {
        address: address.startsWith("/") ? address : `/${address}`,
        args: [
          Number(stimulusMs),
          Number(wallMs),
          modeN,
          recording ? 1 : 0,
          Number(recordingElapsedMs),
        ],
      },
    ],
  });
}
