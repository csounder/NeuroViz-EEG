"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Toggle({
  checked,
  onCheckedChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group flex items-start gap-3",
        disabled && "cursor-not-allowed opacity-60",
        !disabled && "cursor-pointer",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          checked ? "bg-emerald-500" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-1",
          )}
        />
      </button>
      {(label || hint) && (
        <div className="min-w-0">
          {label && (
            <div className="text-sm text-zinc-200 leading-snug">{label}</div>
          )}
          {hint && (
            <div className="mt-0.5 text-xs text-zinc-500 leading-snug">
              {hint}
            </div>
          )}
        </div>
      )}
    </label>
  );
}
