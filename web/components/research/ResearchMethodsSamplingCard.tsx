"use client";

import * as React from "react";
import { FileText, Check, Copy } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { buildMethodsSamplingParagraph } from "@/lib/researchMethodsLine";
import type { ResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { resolveActiveIngestPath } from "@/lib/researchDeviceProfile";
import type { EegTraceSource } from "@/lib/types";

export function ResearchMethodsSamplingCard({
  profile,
  estimatedEegHz,
  eegTraceSource,
  deviceName,
  live,
  mindMonitorMode,
  mindMonitorOscAddressCount,
}: {
  profile: ResearchDeviceProfile;
  estimatedEegHz: number | null;
  eegTraceSource: EegTraceSource;
  deviceName: string | null;
  live: boolean;
  mindMonitorMode: boolean;
  mindMonitorOscAddressCount: number;
}) {
  const text = React.useMemo(
    () =>
      buildMethodsSamplingParagraph({
        profile,
        estimatedEegHz,
        eegTraceSource,
        deviceName,
        live,
        mindMonitorMode,
        mindMonitorOscAddressCount,
      }),
    [profile, estimatedEegHz, eegTraceSource, deviceName, live, mindMonitorMode, mindMonitorOscAddressCount],
  );
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const nom = profile.nominalEegHz;
  const obs = estimatedEegHz;
  const active = resolveActiveIngestPath({
    profile,
    mindMonitorMode,
    mindMonitorOscAddressCount,
    live,
  });
  const diverge =
    obs != null && obs < nom * 0.78 ? (
      <span className="text-amber-400"> · observed &lt; ~78% nominal — document bridge/throttle</span>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<FileText className="h-4 w-4" />}
          description="One place for nominal vs observed sampling, montage labels, and trace mode — paste into methods or lab notebook."
        >
          Methods line · sampling &amp; montage
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-[11px] text-zinc-400">
        <div className="flex flex-wrap gap-3 font-mono text-[10px] text-zinc-300">
          <span>
            Nominal <span className="text-emerald-300/90">{nom} Hz</span>
          </span>
          <span>
            Observed{" "}
            <span className="text-sky-300/90">
              {obs != null ? `${obs.toFixed(1)} Hz` : "—"}
            </span>
            {diverge}
          </span>
          <span>
            Trace <span className="text-zinc-400">{eegTraceSource}</span>
          </span>
          <span title={active.methodsNote}>
            Ingest <span className="text-violet-300/90">{active.label}</span>
          </span>
        </div>
        <div className="relative rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
          <p className="pr-10 leading-relaxed text-zinc-300">{text}</p>
          <button
            type="button"
            onClick={copy}
            className="absolute right-2 top-2 rounded-md border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title="Copy paragraph"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600">
          Observed rate is estimated in the browser from EEG packet timing (dashboard stream), not a hardware ADC
          counter. For publication, cross-check against raw file timestamps offline.
        </p>
      </CardBody>
    </Card>
  );
}
