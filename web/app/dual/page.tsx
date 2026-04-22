"use client";

import * as React from "react";
import { Columns2, RotateCcw } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DisplayPanel } from "@/components/display/DisplayPanel";
import { usePersistedLayout } from "@/lib/layouts";
import { DISPLAY_REGISTRY, type DisplayKind } from "@/lib/displays";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "neurovis.layout.dual";
const DEFAULT: DisplayKind[] = ["raw", "fft"];

export default function DualPage() {
  const [panes, setPanes] = usePersistedLayout(STORAGE_KEY, DEFAULT);
  const [orientation, setOrientation] = React.useState<"horizontal" | "vertical">(
    "horizontal",
  );
  const [maximized, setMaximized] = React.useState<number | null>(null);

  const setPaneKind = (i: number, kind: DisplayKind) =>
    setPanes((prev) =>
      prev.map((p, idx) =>
        idx === i
          ? { kind, scale: DISPLAY_REGISTRY[kind].defaultScale }
          : p,
      ),
    );

  const setPaneScale = (i: number, scale: any) =>
    setPanes((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, scale } : p)),
    );

  const reset = () =>
    setPanes(() =>
      DEFAULT.map((kind) => ({
        kind,
        scale: DISPLAY_REGISTRY[kind].defaultScale,
      })),
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Columns2 className="h-4 w-4" />}
            description="Two simultaneous visualizations — pick anything in either pane. Layout persists."
            actions={
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
                  <Button
                    size="sm"
                    variant={
                      orientation === "horizontal" ? "secondary" : "ghost"
                    }
                    onClick={() => setOrientation("horizontal")}
                  >
                    Side-by-side
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      orientation === "vertical" ? "secondary" : "ghost"
                    }
                    onClick={() => setOrientation("vertical")}
                  >
                    Stacked
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={reset}
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  Reset
                </Button>
              </div>
            }
          >
            Dual View
          </CardTitle>
        </CardHeader>
      </Card>

      <div
        className={cn(
          "grid gap-4",
          // User explicitly picked side-by-side → honor it at every width.
          // Only stack automatically on very narrow screens (<640px).
          orientation === "horizontal"
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1",
        )}
        style={{ minHeight: "calc(100vh - 220px)" }}
      >
        {panes.map((p, i) => {
          if (maximized !== null && maximized !== i) return null;
          return (
            <DisplayPanel
              key={i}
              kind={p.kind}
              scale={p.scale}
              onKindChange={(k) => setPaneKind(i, k)}
              onScaleChange={(s) => setPaneScale(i, s)}
              bodyHeight={maximized !== null ? 640 : 420}
              onMaximizeToggle={() =>
                setMaximized(maximized === i ? null : i)
              }
              isMaximized={maximized === i}
              className={
                maximized === i
                  ? "col-span-full"
                  : orientation === "vertical"
                    ? "col-span-full"
                    : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
