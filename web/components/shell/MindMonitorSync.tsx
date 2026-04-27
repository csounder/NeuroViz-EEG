"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "@/lib/store";
import { clientSim } from "@/lib/clientSim";

/**
 * Keeps the browser-simulator Mind Monitor OSC options in sync with
 * `mindMonitorMode`. Band integration edges use `bandEdgePreset` (see AppShell).
 */
export function MindMonitorSync() {
  const mindMonitorMode = useNeuroStore(
    useShallow((s) => s.mindMonitorMode),
  );

  React.useEffect(() => {
    if (clientSim.isRunning()) {
      clientSim.setOptions({ sendMindMonitorRawFft: mindMonitorMode });
    }
  }, [mindMonitorMode]);

  return null;
}
