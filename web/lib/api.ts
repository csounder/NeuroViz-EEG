// Thin wrapper around the server-enhanced.js REST endpoints.
// Next.js rewrites /api/* → NEUROVIS_API_ORIGIN (default http://localhost:3000),
// so client-side code can just hit relative paths.

async function request<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export type BridgeInfo = {
  bridgeMode: string;
  label: string;
  muse2Class: string;
  athenaClass: string;
};

export const api = {
  status: () => request("/api/status"),
  getBridge: () => request<BridgeInfo>("/api/bridge"),
  setBridgeMode: (mode: "swift" | "athena") =>
    request<{ ok: boolean; bridgeMode: string; changed?: boolean }>(
      "/api/bridge/mode",
      { method: "POST", body: JSON.stringify({ mode }) },
    ),
  devices: () => request("/api/devices"),
  ports: () => request("/api/ports"),

  connect: (body?: Record<string, unknown>) =>
    request("/api/connect", { method: "POST", body: JSON.stringify(body ?? {}) }),
  connectIndex: (index: number) =>
    request(`/api/connect/${index}`, { method: "POST" }),
  start: () => request("/api/start", { method: "POST" }),
  disconnect: () => request("/api/disconnect", { method: "POST" }),
  toggleSimulator: () =>
    request("/api/simulator/toggle", { method: "POST" }),
  useSimulator: (enabled: boolean) =>
    request("/api/use_simulator", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  setSimulatorProfile: (profile: string) =>
    request("/api/simulator/profile", {
      method: "POST",
      body: JSON.stringify({ profile }),
    }),
  simulatorStatus: () => request("/api/simulator/status"),

  getSettings: () => request("/api/settings"),
  updateSettings: (patch: Record<string, unknown>) =>
    request("/api/settings", { method: "POST", body: JSON.stringify(patch) }),

  getOscConfig: () => request("/api/osc/config"),
  setOscPrefix: (prefix: string) =>
    request("/api/osc/prefix", {
      method: "POST",
      body: JSON.stringify({ prefix }),
    }),
  getOscGranular: () => request("/api/osc/granular"),
  setOscGranular: (config: Record<string, unknown>) =>
    request("/api/osc/granular", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  getDspConfig: () => request("/api/dsp/config"),
  setDspConfig: (config: Record<string, unknown>) =>
    request("/api/dsp/config", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  getBands: () => request("/api/bands"),
  getFft: () => request("/api/fft"),
  getTimeseries: () => request("/api/timeseries"),

  startRecording: () =>
    request("/api/recording/start", { method: "POST" }),
  stopRecording: () =>
    request("/api/recording/stop", { method: "POST" }),
  downloadRecordingUrl: () => "/api/recording/download",

  resetBaseline: () =>
    request("/api/baseline/reset", { method: "POST" }),
  baselineStatus: () => request("/api/baseline/status"),

  startCalibration: () =>
    request("/api/calibration/start", { method: "POST" }),
  stopCalibration: () =>
    request("/api/calibration/stop", { method: "POST" }),
  resetCalibration: () =>
    request("/api/calibration/reset", { method: "POST" }),
  calibrationStatus: () => request("/api/calibration/status"),

  instruments: () => request("/api/instruments"),
  launchInstrument: (body: Record<string, unknown>) =>
    request("/api/instruments/launch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  stopInstrument: (body: Record<string, unknown>) =>
    request("/api/instruments/stop", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  instrumentStatus: () => request("/api/instruments/status"),

  startGanglion: () =>
    request("/api/ganglion/start", { method: "POST" }),
  stopGanglion: () =>
    request("/api/ganglion/stop", { method: "POST" }),
};
