"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { BandBars } from "@/components/charts/BandBars";
import { BandHistoryChart } from "@/components/charts/BandHistoryChart";
import { Button } from "@/components/ui/Button";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

export default function BandsPage() {
  const [mode, setMode] = React.useState<"relative" | "absolute">("relative");
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 100,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<BarChart3 className="h-4 w-4" />}
            description="Delta · Theta · Alpha · Beta · Gamma"
            actions={
              <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
                <Button
                  size="sm"
                  variant={mode === "relative" ? "secondary" : "ghost"}
                  onClick={() => setMode("relative")}
                >
                  Relative
                </Button>
                <Button
                  size="sm"
                  variant={mode === "absolute" ? "secondary" : "ghost"}
                  onClick={() => setMode("absolute")}
                >
                  Absolute
                </Button>
              </div>
            }
          >
            Band Powers
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <BandBars
            mode={mode}
            autoScale={scale.auto}
            scaleValue={scale.value}
          />
          <ScaleControl
            state={scale}
            onChange={setScale}
            label={mode === "relative" ? "Ceiling" : "Y-range"}
            unit="%"
            min={5}
            max={500}
            helpAuto="Relative mode: 0–100 % always. Absolute mode: bars re-scale so the largest band fills the lane."
            helpManual={
              mode === "relative"
                ? "Caps the ceiling — e.g. 50 % stretches subtle variations."
                : "Fixes the absolute y-max (µV²-ish units) — useful for session-to-session comparison."
            }
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Rolling 60-second history · relative power per band">
            History
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <BandHistoryChart
            height={260}
            autoScale={scale.auto}
            scaleValue={scale.value}
          />
        </CardBody>
      </Card>
    </div>
  );
}
