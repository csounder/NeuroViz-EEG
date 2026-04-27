"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { computeResearchArtifactFlags } from "@/lib/researchArtifactFlags";
import { inferResearchDeviceProfile } from "@/lib/researchDeviceProfile";
import { useNeuroStore } from "@/lib/store";

export function ResearchRuleQcPanel() {
  const rollingRaw = useNeuroStore((s) => s.rollingRaw);
  const latestBandsRel = useNeuroStore((s) => s.latestBandsRel);
  const motion = useNeuroStore((s) => s.motion);
  const mindMonitor = useNeuroStore((s) => s.mindMonitor);
  const researchEyesContext = useNeuroStore((s) => s.researchEyesContext);
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

  const flags = React.useMemo(
    () =>
      computeResearchArtifactFlags({
        rollingRaw,
        latestBandsRel,
        motionAccel: motion.accel,
        expectImu: profile.capabilities.imu,
        channelLabels: profile.channelLabels,
        mindMonitorBlink: mindMonitor.blink,
        mindMonitorJaw: mindMonitor.jawClench,
        eyesContext: researchEyesContext,
      }),
    [
      rollingRaw,
      latestBandsRel,
      motion.accel,
      profile.capabilities.imu,
      profile.channelLabels,
      mindMonitor.blink,
      mindMonitor.jawClench,
      researchEyesContext,
    ],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<ShieldAlert className="h-4 w-4" />}
          description="Rule-based, explainable flags (no ICA). Motion load is omitted when the device has no IMU (e.g. Ganglion). Channel names follow the active device profile."
        >
          Artifact &amp; context QC
        </CardTitle>
      </CardHeader>
      <CardBody>
        {flags.length === 0 ? (
          <p className="text-sm text-zinc-500">No active flags on current thresholds.</p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => (
              <li
                key={f.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  f.severity === "warn"
                    ? "border-amber-900/60 bg-amber-950/20 text-amber-100"
                    : "border-zinc-800 bg-zinc-950/50 text-zinc-400"
                }`}
              >
                <div className="font-medium text-zinc-200">{f.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{f.detail}</div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
