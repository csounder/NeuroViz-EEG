"use client";

import * as React from "react";
import { Waypoints } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ButterflyEEGChart } from "@/components/charts/ButterflyEEGChart";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

export default function ButterflyPage() {
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 200,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Waypoints className="h-4 w-4" />}
            description="All four electrodes on one amplitude scale with vertical offsets — common in clinical EEG and BCI review tools."
          >
            Butterfly plot
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <ButterflyEEGChart
            height={480}
            autoScale={scale.auto}
            scaleValue={scale.value}
          />
          <div className="px-5 pb-4">
            <ScaleControl
              state={scale}
              onChange={setScale}
              label="Amplitude"
              unit="µV"
              bipolar
              min={10}
              max={2000}
              helpAuto="One gain from the largest excursion across channels."
              helpManual="Fixed ±µV for every trace."
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
