"use client";

import { ExternalLink } from "lucide-react";
import type { ResearchDeviceProfile } from "@/lib/researchDeviceProfile";

/** Steers heavy Cyton/Daisy workflows toward native acquisition; in-browser capture is complementary. */
export function ResearchCytonAcquisitionCallout({ profile }: { profile: ResearchDeviceProfile }) {
  if (profile.family !== "openbci_cyton") return null;
  return (
    <div className="rounded-lg border border-sky-900/50 bg-sky-950/25 px-3 py-2.5 text-[11px] leading-relaxed text-sky-100/90">
      <div className="font-medium text-sky-200/95">Cyton / Daisy users — start here</div>
      <p className="mt-1 text-sky-100/85">
        NeuroVis Research can log{" "}
        <span className="font-mono text-sky-200/95">{profile.capabilities.eegChannels}</span>-channel EEG (Cyton, Daisy
        stack, or Ultra Cortex) in the session recorder when the stream supplies enough samples, and on-page metrics still
        emphasize the first four columns. For publication-grade timing, full montage metadata, and gap-free logs, plan on{" "}
        <strong className="font-medium text-sky-100">native OpenBCI / BrainFlow (or lab recorder) acquisition</strong> and
        use NeuroVis for live QC, markers, and exploratory exports.
      </p>
      <a
        href="https://docs.openbci.com/"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-sky-400/95 hover:text-sky-300"
      >
        OpenBCI docs <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
