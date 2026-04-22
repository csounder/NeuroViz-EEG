import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "emerald" | "amber" | "rose" | "indigo" | "violet";

const tones: Record<Tone, string> = {
  neutral: "border-zinc-700/80 bg-zinc-800/60 text-zinc-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "emerald" && "bg-emerald-400 animate-pulse-soft",
            tone === "amber" && "bg-amber-400",
            tone === "rose" && "bg-rose-400",
            tone === "indigo" && "bg-indigo-400",
            tone === "violet" && "bg-violet-400",
            tone === "neutral" && "bg-zinc-400",
          )}
        />
      )}
      {children}
    </span>
  );
}
