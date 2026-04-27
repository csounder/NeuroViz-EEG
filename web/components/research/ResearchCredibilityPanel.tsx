"use client";

import * as React from "react";
import { BookMarked, Check, Copy } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ResearchMontageFigure } from "@/components/research/ResearchDeviceContextPanel";
import { inferResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { useNeuroStore } from "@/lib/store";
import type { EegTraceSource } from "@/lib/types";

const WEB_APP_VERSION = "0.1.0";

function traceReferenceNote(mode: EegTraceSource): string {
  switch (mode) {
    case "server_dsp":
      return "Traces follow the Node bridge DSP output when available, else raw from device.";
    case "device_raw":
      return "Traces are scaled device raw without the in-browser DSP pipeline.";
    case "browser_dsp":
      return "Traces use the browser DSP pipeline; optional common average reference (CAR) when enabled in DSP settings.";
    default:
      return "See EEG trace source in app settings.";
  }
}

function buildPreregSnippet(traceMode: EegTraceSource): string {
  return `We pre-register the following plan before unblinded analysis. Hypothesis: [state directional prediction, e.g. task condition increases frontal α relative to baseline]. Primary outcome: [one pre-specified scalar per participant or trial, e.g. mean relative α (AF7+AF8)/2 in [t0,t1] ms, or PLV AF7–AF8 in the α band over the same window]. Exclusion / QC: epochs excluded when rule-based flags fire (saturation, flatline, step, motion/contact warnings) at thresholds documented in the NeuroVis Research QC panel and export provenance JSON; manual review [yes/no]. Analysis: software NeuroVis web v${WEB_APP_VERSION}; EEG trace mode "${traceMode}" (${traceReferenceNote(traceMode)}). Data layout: BIDS-inspired filenames in rolling exports; session recorder manifest documents sample rate, wall_ms, and filters snapshot where applicable. Deviations from this paragraph will be noted in the final report.`;
}

export function ResearchCredibilityPanel() {
  const eegTraceSource = useNeuroStore((s) => s.eegTraceSource);
  const deviceName = useNeuroStore((s) => s.deviceName);
  const latestEEG = useNeuroStore((s) => s.latestEEG);
  const settings = useNeuroStore((s) => s.settings);
  const clientSimRunning = useNeuroStore((s) => s.clientSim.running);
  const profile = React.useMemo(
    () =>
      inferResearchDeviceProfile({
        deviceName,
        eegDeviceName: latestEEG?.deviceName,
        settingsSimulator: Boolean(settings.simulatorMode),
        clientSimRunning,
      }),
    [deviceName, latestEEG?.deviceName, settings.simulatorMode, clientSimRunning],
  );
  const snippet = React.useMemo(
    () => buildPreregSnippet(eegTraceSource),
    [eegTraceSource],
  );
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<BookMarked className="h-4 w-4" />}
          description="Lightweight credibility helpers: paste into OSF/AsPredicted-style prereg, show reviewers the montage, and point to community standards."
        >
          Publishing &amp; credibility
        </CardTitle>
      </CardHeader>
      <CardBody className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              1. Pre-registration snippet
            </h3>
            <p className="mb-2 text-[11px] text-zinc-500">
              One paragraph to adapt; bracketed slots are intentional. Trace mode updates from your current setting (
              <span className="text-zinc-300">{eegTraceSource}</span>).
            </p>
            <div className="relative rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
              <p className="pr-10 text-[11px] leading-relaxed text-zinc-300">{snippet}</p>
              <button
                type="button"
                onClick={copy}
                className="absolute right-2 top-2 rounded-md border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                title="Copy to clipboard"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              Prereg workflow:{" "}
              <a
                href="https://www.cos.io/prereg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline hover:text-sky-300"
              >
                COS / prereg
              </a>
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              3. Standards &amp; reporting
            </h3>
            <ul className="space-y-1.5 text-[11px] text-zinc-400">
              <li>
                <a
                  href="https://bids-specification.readthedocs.io/en/stable/04-modality-specific-files/03-electroencephalography.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline hover:text-sky-300"
                >
                  EEG-BIDS (modality spec)
                </a>{" "}
                — align exports and sidecars with community layout; NeuroVis uses BIDS-inspired entity naming in rolling
                bundles.
              </li>
              <li>
                <a
                  href="https://mne.tools/stable/index.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline hover:text-sky-300"
                >
                  MNE-Python
                </a>{" "}
                — typical open toolchain for reading CSV/EDF and epoching; cite your MNE version in methods.
              </li>
              <li>
                <a
                  href="https://www.equator-network.org/reporting-guidelines/consort/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline hover:text-sky-300"
                >
                  CONSORT (reporting checklist)
                </a>{" "}
                — designed for RCTs; use as a{" "}
                <span className="text-zinc-300">structure</span> for transparent methods (eligibility, withdrawals,
                analysis plan) when reporting mobile EEG feasibility or pilot work.
              </li>
            </ul>
          </section>

          <section className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
            <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-200/80">
              Limitations (consumer / mobile EEG)
            </h3>
            <ul className="list-inside list-disc space-y-1 text-[11px] leading-relaxed text-zinc-400">
              <li>Dry electrodes and hair penetration differ from wet lab caps; impedance and motion sensitivity are higher.</li>
              <li>Four frontal–temporal channels are not sufficient for clinical localization or dense-source imaging.</li>
              <li>Movement, EMG, blink, and cardiac signals easily contaminate frontal channels; use QC flags and caveats.</li>
              <li>Sampling and filtering paths depend on device firmware and the trace mode you select; document both.</li>
            </ul>
          </section>
        </div>

        <div className="flex flex-col items-center border-t border-zinc-800 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h3 className="mb-3 w-full font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            2. Montage (4 ch · {profile.displayLabel})
          </h3>
          <ResearchMontageFigure profile={profile} />
          <div className="mt-4 w-full rounded-md border border-zinc-800 bg-zinc-900/40 p-2 text-[10px] leading-relaxed text-zinc-500">
            <span className="font-medium text-zinc-400">Reference: </span>
            Hardware/firmware defines the primary reference (manufacturer implementation). In NeuroVis, the displayed
            trace may additionally use server or browser DSP; with <span className="text-zinc-300">browser_dsp</span> and
            CAR enabled, a common average across the four sites is subtracted per sample. State the mode you used in
            methods (
            <span className="font-mono text-zinc-400">{eegTraceSource}</span>).
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
