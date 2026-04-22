import * as React from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-4 py-3",
        className,
      )}
    >
      {icon && (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">
          {label}
        </div>
        <div className="mt-0.5 font-mono text-lg tabular-nums text-zinc-100">
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 text-xs text-zinc-500 leading-snug">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
