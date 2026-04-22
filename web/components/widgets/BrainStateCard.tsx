"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { useNeuroStore } from "@/lib/store";
import { BAND_COLORS, BAND_LABELS, STATE_COPY } from "@/lib/utils";

export function BrainStateCard() {
  const { state, bands } = useNeuroStore(
    useShallow((s) => ({
      state: s.brainState,
      bands: s.latestBandsRel,
    })),
  );

  const meta = state ? STATE_COPY[state.state] : STATE_COPY.neutral;
  const label = state ? meta.label : "Standby";
  const confidence = state ? state.confidence : 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6">
      {/* Aurora backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50 blur-2xl"
        style={{
          background: state
            ? `radial-gradient(600px 200px at 20% 0%, ${
                BAND_COLORS[state.dominant]
              }40, transparent 70%)`
            : "radial-gradient(600px 200px at 20% 0%, rgba(16,185,129,0.2), transparent 70%)",
        }}
      />

      <div className="relative flex flex-col gap-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Current state
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-1 flex items-baseline gap-3"
            >
              <div className={`text-4xl font-semibold ${meta.color}`}>
                {label}
              </div>
              {state && (
                <div className="font-mono text-xs text-zinc-500">
                  {Math.round(confidence * 100)}% conf
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <p className="mt-1 text-sm text-zinc-400">{meta.hint}</p>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-xs text-zinc-400">Dominant band</div>
            <div className="font-mono text-xs text-zinc-500">
              {state
                ? `${BAND_LABELS[state.dominant]} leading`
                : "—"}
            </div>
          </div>
          <div className="space-y-1.5">
            {(["delta", "theta", "alpha", "beta", "gamma"] as const).map(
              (b) => {
                const v = bands?.[b] ?? 0;
                return (
                  <div key={b} className="flex items-center gap-3">
                    <span className="w-12 text-xs text-zinc-400">
                      {BAND_LABELS[b]}
                    </span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <motion.div
                        className="absolute inset-y-0 left-0"
                        style={{ background: BAND_COLORS[b] }}
                        animate={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }}
                        transition={{
                          type: "spring",
                          stiffness: 160,
                          damping: 24,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-[11px] tabular-nums text-zinc-400">
                      {(v * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
