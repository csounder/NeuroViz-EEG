"use client";

import * as React from "react";
import { Monitor } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { RawEEGChart } from "@/components/charts/RawEEGChart";
import {
  ScaleControl,
  TraceSpeedControl,
  type ScaleState,
} from "@/components/ui/ScaleControl";

export default function OpenBciTimeSeriesPage() {
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 200,
  });
  const [traceWindow, setTraceWindow] = React.useState(256);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Monitor className="h-4 w-4" />}
            description="Inspired by the OpenBCI GUI time-series widget — dark field, numbered channels, high-contrast traces."
          >
            OpenBCI-style time series
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <RawEEGChart
            variant="openbci"
            height={520}
            autoScale={scale.auto}
            scaleValue={scale.value}
            windowSamples={traceWindow}
          />
          <div className="flex flex-col gap-2 px-5 pb-4 lg:flex-row">
            <ScaleControl
              className="flex-1"
              state={scale}
              onChange={setScale}
              label="Y-range"
              unit="µV"
              bipolar
              min={10}
              max={2000}
              helpAuto="Each channel lane auto-scales to its own peak."
              helpManual="Fixed ±µV across all lanes."
            />
            <TraceSpeedControl
              className="flex-1"
              value={traceWindow}
              onChange={setTraceWindow}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
