"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AudioWaveform,
  BarChart3,
  BookOpen,
  Brain,
  Circle,
  Columns2,
  Smartphone,
  Equal,
  Film,
  FlaskConical,
  Gauge,
  Grid2x2,
  Layers,
  Layers3,
  LayoutGrid,
  Monitor,
  PanelTop,
  Radio,
  Rows3,
  Settings,
  Sparkles,
  SlidersHorizontal,
  Music2,
  Waves,
  Waypoints,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: Sparkles, group: "Workspace" },
  {
    href: "/v12",
    label: "V12 Workstation",
    icon: Music2,
    group: "Workspace",
  },
  {
    href: "/concert",
    label: "Concert Mode",
    icon: Film,
    group: "Workspace",
  },
  {
    href: "/teaching",
    label: "Teaching Mode",
    icon: BookOpen,
    group: "Workspace",
  },
  {
    href: "/research",
    label: "Research Mode",
    icon: FlaskConical,
    group: "Workspace",
  },
  { href: "/raw", label: "Raw EEG", icon: Activity, group: "Visualize" },
  {
    href: "/openbci-time-series",
    label: "OpenBCI-style TS",
    icon: Monitor,
    group: "Visualize",
  },
  {
    href: "/butterfly",
    label: "Butterfly EEG",
    icon: Waypoints,
    group: "Visualize",
  },
  {
    href: "/spectrogram",
    label: "Spectrogram",
    icon: LayoutGrid,
    group: "Visualize",
  },
  {
    href: "/muselab",
    label: "MuseLab-style",
    icon: PanelTop,
    group: "Visualize",
  },
  {
    href: "/mind-monitor",
    label: "Mind Monitor",
    icon: Smartphone,
    group: "Visualize",
  },
  {
    href: "/bands-combined",
    label: "Combined Bands",
    icon: Layers,
    group: "Visualize",
  },
  {
    href: "/bands-multichannel",
    label: "Multichannel Bands",
    icon: Rows3,
    group: "Visualize",
  },
  { href: "/bands", label: "Band Powers", icon: BarChart3, group: "Visualize" },
  { href: "/fft", label: "FFT Spectrum", icon: Waves, group: "Visualize" },
  {
    href: "/fft-smoothed",
    label: "Smoothed FFT",
    icon: AudioWaveform,
    group: "Visualize",
  },
  { href: "/fft-bands", label: "FFT + Bands", icon: Equal, group: "Visualize" },
  {
    href: "/waterfall",
    label: "3D Waterfall",
    icon: Layers3,
    group: "Visualize",
  },
  { href: "/dual", label: "Dual View", icon: Columns2, group: "Visualize" },
  { href: "/quad", label: "Quad View", icon: Grid2x2, group: "Visualize" },
  {
    href: "/brain-state",
    label: "Brain State",
    icon: Brain,
    group: "Neurofeedback",
  },
  {
    href: "/dsp",
    label: "DSP Pipeline",
    icon: SlidersHorizontal,
    group: "Signal",
  },
  { href: "/osc", label: "OSC Monitor", icon: Radio, group: "Signal" },
  { href: "/stats", label: "Stats", icon: Gauge, group: "Signal" },
  {
    href: "/recordings",
    label: "Recordings",
    icon: Circle,
    group: "Signal",
  },
  {
    href: "/simulator",
    label: "Simulator",
    icon: FlaskConical,
    group: "Workspace",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    group: "Workspace",
  },
];

const GROUPS = ["Workspace", "Visualize", "Neurofeedback", "Signal"];

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-lg transition-transform lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-zinc-800/80 px-4">
          <Link href="/" className="flex items-center gap-2" onClick={onClose}>
            <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-emerald-400 to-indigo-500 text-zinc-950 shadow-[0_0_20px_-4px_rgba(16,185,129,0.6)]">
              <Brain className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-zinc-100">
                NeuroVis
              </div>
              <div className="-mt-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                EEG Dashboard
              </div>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-4">
          {GROUPS.map((group) => {
            const items = NAV.filter((n) => n.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-6">
                <div className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  {group}
                </div>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    // Avoid `/bands` matching `/bands-combined` and `/bands-multichannel`.
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname === item.href ||
                          (pathname?.startsWith(`${item.href}/`) ?? false);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-zinc-800/80 text-zinc-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                              : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              active ? "text-emerald-400" : "text-zinc-500",
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-zinc-800/80 p-3">
          <div className="rounded-lg border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-3 text-xs leading-snug text-zinc-400">
            <div className="font-medium text-zinc-200">No device?</div>
            <div className="mt-0.5">
              Drive every display and OSC stream from the{" "}
              <Link
                href="/simulator"
                className="text-emerald-400 hover:underline"
                onClick={onClose}
              >
                Simulator
              </Link>
              .
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
