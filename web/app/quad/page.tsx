"use client";

import * as React from "react";
import { Grid2x2, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DisplayPanel } from "@/components/display/DisplayPanel";
import { usePersistedLayout } from "@/lib/layouts";
import { DISPLAY_REGISTRY, type DisplayKind } from "@/lib/displays";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "neurovis.layout.quad";
const DEFAULT: DisplayKind[] = ["raw", "fft", "bands", "waterfall"];

export default function QuadPage() {
  const [panes, setPanes] = usePersistedLayout(STORAGE_KEY, DEFAULT);
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
            icon={<Grid2x2 className="h-4 w-4" />}
            description="Four simultaneous visualizations — any combination, any time. Click the expand icon on a pane to focus."
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={reset}
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
              >
                Reset
              </Button>
            }
          >
            Quad View
          </CardTitle>
        </CardHeader>
      </Card>

      <div
        className={cn(
          "grid gap-4",
          maximized !== null
            ? "grid-cols-1"
            : "grid-cols-1 md:grid-cols-2",
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
              bodyHeight={maximized !== null ? 600 : 260}
              onMaximizeToggle={() =>
                setMaximized(maximized === i ? null : i)
              }
              isMaximized={maximized === i}
              className={maximized === i ? "col-span-full" : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
