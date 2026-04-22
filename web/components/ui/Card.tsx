import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur-sm",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-start justify-between gap-4 border-b border-zinc-800/60 px-5 py-3.5",
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export function CardTitle({
  children,
  description,
  icon,
  actions,
  className,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-zinc-100">
            {children}
          </h3>
          {description && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export const CardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...props} />
));
CardBody.displayName = "CardBody";
