"use client";

import * as React from "react";

const STORAGE_KEY = "nv_chunk_reload_once";

/**
 * Next.js dev/prod can throw ChunkLoadError when the browser still references
 * an old hashed chunk after `next dev` restarts or `.next` rebuilds. A single
 * hard reload usually fixes it; this recovers automatically once per session.
 */
export function ChunkLoadRecovery() {
  React.useEffect(() => {
    const tryReload = (detail: string) => {
      const d = detail.toLowerCase();
      if (
        !d.includes("chunkloaderror") &&
        !d.includes("loading chunk") &&
        !d.includes("failed to fetch dynamically imported module")
      ) {
        return;
      }
      if (typeof sessionStorage === "undefined") return;
      if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
      sessionStorage.setItem(STORAGE_KEY, "1");
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      tryReload(String(e.message || ""));
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg =
        typeof r === "object" && r !== null && "message" in r
          ? String((r as Error).message)
          : String(r ?? "");
      const name =
        typeof r === "object" && r !== null && "name" in r
          ? String((r as Error).name)
          : "";
      tryReload(`${name} ${msg}`);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
