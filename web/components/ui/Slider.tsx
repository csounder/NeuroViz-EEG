"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  unit,
  format,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label?: React.ReactNode;
  unit?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-zinc-400">{label}</span>
          <span className="font-mono tabular-nums text-zinc-200">
            {format ? format(value) : value}
            {unit ? <span className="text-zinc-500"> {unit}</span> : null}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="neurovis-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-500"
      />
      <style jsx>{`
        .neurovis-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: rgb(16 185 129);
          border: 2px solid rgb(4 120 87);
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
          cursor: pointer;
        }
        .neurovis-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: rgb(16 185 129);
          border: 2px solid rgb(4 120 87);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
