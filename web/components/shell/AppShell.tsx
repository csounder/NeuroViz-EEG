"use client";

import * as React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MindMonitorSync } from "./MindMonitorSync";
import { useNeuroVisSocket } from "@/lib/useWebSocket";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Opens the WebSocket once for the whole app tree.
  useNeuroVisSocket();

  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="relative mx-auto flex min-h-screen max-w-[1600px]">
      <MindMonitorSync />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
