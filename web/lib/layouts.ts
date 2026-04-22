"use client";

import { useEffect, useState } from "react";
import type { ScaleState } from "@/components/ui/ScaleControl";
import {
  DISPLAY_REGISTRY,
  type DisplayKind,
} from "@/lib/displays";

export interface PaneState {
  kind: DisplayKind;
  scale: ScaleState;
}

/**
 * Small hook that persists an array of panes (each kind + scale) under a
 * given localStorage key. If parsing fails or the key is missing, `fallback`
 * is used.
 */
export function usePersistedLayout(
  key: string,
  fallbackKinds: DisplayKind[],
): [PaneState[], (updater: (prev: PaneState[]) => PaneState[]) => void] {
  const fallback: PaneState[] = fallbackKinds.map((kind) => ({
    kind,
    scale: DISPLAY_REGISTRY[kind].defaultScale,
  }));

  const [panes, setPanes] = useState<PaneState[]>(fallback);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PaneState[];
      if (
        Array.isArray(parsed) &&
        parsed.length === fallbackKinds.length &&
        parsed.every((p) => p && typeof p.kind === "string" && p.scale)
      ) {
        // Ensure every kind is still valid
        const cleaned: PaneState[] = parsed.map((p, i) => ({
          kind:
            (DISPLAY_REGISTRY as any)[p.kind] !== undefined
              ? (p.kind as DisplayKind)
              : fallbackKinds[i],
          scale: p.scale,
        }));
        setPanes(cleaned);
      }
    } catch {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (updater: (prev: PaneState[]) => PaneState[]) => {
    setPanes((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return [panes, update];
}
