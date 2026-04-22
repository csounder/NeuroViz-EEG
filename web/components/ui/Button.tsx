"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:bg-emerald-500/90 shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_8px_24px_-8px_rgba(16,185,129,0.45)]",
  secondary:
    "bg-zinc-800 text-zinc-100 hover:bg-zinc-700/90 active:bg-zinc-800",
  ghost: "bg-transparent text-zinc-300 hover:bg-zinc-800/60",
  outline:
    "bg-transparent text-zinc-200 border border-zinc-700 hover:bg-zinc-800/60",
  danger: "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-600/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs rounded-md gap-1.5",
  md: "h-9 px-3 text-sm rounded-md gap-2",
  lg: "h-10 px-4 text-sm rounded-lg gap-2",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {leftIcon && <span className="inline-flex">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="inline-flex">{rightIcon}</span>}
      </button>
    );
  },
);
Button.displayName = "Button";
