"use client";

import * as React from "react";
import { Stethoscope } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ResearchDeviceProfile } from "@/lib/researchDeviceProfile";

type ContactMap = Record<string, string> | undefined;

export function ResearchElectrodeQualityCard({
  profile,
  contact,
  channelLabels,
}: {
  profile: ResearchDeviceProfile;
  contact?: ContactMap;
  channelLabels: [string, string, string, string];
}) {
  const keys = ["tp9", "af7", "af8", "tp10"] as const;
  const museStyle = profile.capabilities.museContactTiles;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Stethoscope className="h-4 w-4" />}
          description="What NeuroVis can show for electrode quality vs what you must log manually (impedance)."
        >
          Electrode quality &amp; impedance
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[11px] leading-relaxed text-zinc-400">
        {museStyle ? (
          <>
            <p>
              <span className="text-zinc-300">Muse / Athena: </span>
              Consumer headsets expose <span className="text-zinc-300">contact / fit hints</span> (not kΩ impedance).
              Use the decoded contact tiles below and manufacturer guidance. For papers, describe “contact quality per
              channel” rather than impedance unless you measured it externally.
            </p>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-zinc-800 font-mono text-[10px] uppercase text-zinc-500">
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Hint</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k, i) => (
                    <tr key={k} className="border-b border-zinc-800/70">
                      <td className="px-3 py-2 font-mono text-zinc-300">{channelLabels[i]}</td>
                      <td className="px-3 py-2 text-zinc-400">{contact?.[k] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <p>
              <span className="text-zinc-300">OpenBCI Ganglion / Cyton: </span>
              NeuroVis does not stream a standard <span className="text-zinc-300">impedance matrix</span> in this UI.
              Log pre-session impedance in your lab notebook or acquisition software (OpenBCI GUI / BrainFlow). Cite
              values and threshold rules in methods.
            </p>
            <p>
              The <span className="text-zinc-300">flatline / saturation</span> QC flags below act as coarse online
              checks; they do not replace impedance testing.
            </p>
            {profile.family === "openbci_cyton" ? (
              <p className="rounded-md border border-amber-900/40 bg-amber-950/15 px-2 py-1.5 text-amber-100/90">
                Cyton can exceed four EEG channels; this Research UI and in-browser recorder still emphasize the first
                four — document which pins map to exported columns.
              </p>
            ) : null}

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Lab setup checklist (static)
              </div>
              <ul className="list-inside list-disc space-y-1.5 text-zinc-500">
                <li>
                  Record <span className="text-zinc-400">pre-session impedance</span> per channel (OpenBCI GUI, BrainFlow,
                  or notebook) — NeuroVis does not stream a full impedance matrix today; optional BrainFlow wiring could
                  surface this later.
                </li>
                <li>
                  Confirm <span className="text-zinc-400">reference / SRB / bias</span> configuration matches your montage
                  diagram.
                </li>
                <li>
                  For Ganglion: verify <span className="text-zinc-400">~200 Hz</span> and USB power; note cable movement as
                  motion artifact (no headset IMU).
                </li>
                <li>
                  For ERP-style blocks: plan <span className="text-zinc-400">hardware trigger or photodiode</span> if you
                  need sample-accurate stim alignment; software markers alone are not enough for publication ERP without
                  offline sync.
                </li>
                <li>
                  Paste a short impedance summary into{" "}
                  <span className="text-zinc-400">Research → Event Lab → Impedance log</span> so rolling{" "}
                  <span className="font-mono text-zinc-500">provenance.json</span> carries it (not live impedance in UI
                  yet).
                </li>
              </ul>
            </div>
          </>
        )}

        <p className="text-[10px] text-zinc-600">
          Unified rule: state in methods whether quality came from <span className="text-zinc-500">device hints</span>,{" "}
          <span className="text-zinc-500">manual impedance log</span>, or both.
        </p>
      </CardBody>
    </Card>
  );
}
