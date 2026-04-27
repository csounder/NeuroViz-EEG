"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "@/lib/store";
import { bandFilters } from "@/lib/bandFilters";
import { clientSim } from "@/lib/clientSim";

/**
 * Keeps the biquad band-pass bank and browser-simulator OSC in sync with
 * `mindMonitorMode` without importing `clientSim` into the zustand store.
 */
export function MindMonitorSync() {
  const mindMonitorMode = useNeuroStore(
    useShallow((s) => s.mindMonitorMode),
  );

  React.useEffect(() => {
    bandFilters.setEdgeProfile(
      mindMonitorMode ? "mindmonitor" : "neurovis",
    );
    if (clientSim.isRunning()) {
      clientSim.setOptions({ sendMindMonitorRawFft: mindMonitorMode });
    }
  }, [mindMonitorMode]);

  return null;
}
