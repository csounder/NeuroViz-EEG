import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies research markers to the NeuroVis Node bridge (server-enhanced.js).
 * Next dev runs on 3001 by default; the bridge serves HTTP on WEB_PORT (3000).
 *
 * Set NEUROVIS_HTTP_BRIDGE_URL if your bridge uses another origin.
 */
const BRIDGE =
  process.env.NEUROVIS_HTTP_BRIDGE_URL ?? "http://127.0.0.1:3000";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-NeuroVis-Research-Token",
    },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object") {
    return jsonWithCors({ ok: false, error: "expected_object" }, 400);
  }
  const label = (body as { label?: unknown }).label;
  if (typeof label !== "string" || !label.trim()) {
    return jsonWithCors(
      {
        ok: false,
        error: "label_required",
        hint: "JSON body: { label: string, detail?: string }",
      },
      400,
    );
  }

  const token = req.headers.get("x-neurovis-research-token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["X-NeuroVis-Research-Token"] = token;

  try {
    const r = await fetch(`${BRIDGE.replace(/\/$/, "")}/api/research-event`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return jsonWithCors(data, r.status);
  } catch {
    return jsonWithCors(
      {
        ok: false,
        error: "bridge_unreachable",
        bridge: BRIDGE,
        hint:
          "Start server-enhanced.js (or set NEUROVIS_HTTP_BRIDGE_URL) so markers can reach WebSocket clients.",
      },
      502,
    );
  }
}

function jsonWithCors(data: Record<string, unknown>, status: number) {
  return NextResponse.json(data, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
