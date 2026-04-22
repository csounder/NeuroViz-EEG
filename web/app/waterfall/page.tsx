"use client";

import * as React from "react";
import { Layers3 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";

const CHANNELS = ["TP9", "AF7", "AF8", "TP10"];

export default function WaterfallPage() {
  const [channel, setChannel] = React.useState(0);
  const [rows, setRows] = React.useState(90);
  const [maxFreq, setMaxFreq] = React.useState(60);
  const [depthFrac, setDepthFrac] = React.useState(0.55);
  const [perspective, setPerspective] = React.useState(0.3);
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 60,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Layers3 className="h-4 w-4" />}
            description="IBVA-style temporal view — each line is one FFT snapshot, newer in front, older receding"
            actions={
              <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
                {CHANNELS.map((label, idx) => (
                  <Button
                    key={label}
                    size="sm"
                    variant={channel === idx ? "secondary" : "ghost"}
                    onClick={() => setChannel(idx)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            }
          >
            3D Waterfall
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <WaterfallChart
            height={520}
            channel={channel}
            nRows={rows}
            maxFreq={maxFreq}
            depthFrac={depthFrac}
            perspective={perspective}
            autoScale={scale.auto}
            scaleValue={scale.value}
            showControls
          />
          <ScaleControl
            state={scale}
            onChange={setScale}
            label="dB span"
            unit="dB"
            min={10}
            max={120}
            helpAuto="The dB min/max of each new row smoothly tracks the live signal (EMA)."
            helpManual="Span is zoomed around the current mean — lower value magnifies subtle changes, higher value flattens them."
          />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle description="Shape the waterfall">
              Layout
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <Slider
              label="History depth"
              unit="rows"
              value={rows}
              min={20}
              max={200}
              step={5}
              onChange={setRows}
            />
            <Slider
              label="Frequency range"
              unit="Hz"
              value={maxFreq}
              min={20}
              max={80}
              step={5}
              onChange={setMaxFreq}
            />
            <Slider
              label="Depth budget"
              unit="× height"
              value={depthFrac}
              min={0.25}
              max={0.85}
              step={0.05}
              onChange={setDepthFrac}
              format={(v) => v.toFixed(2)}
            />
            <Slider
              label="Perspective shrink"
              unit="× far row"
              value={perspective}
              min={0}
              max={0.6}
              step={0.05}
              onChange={setPerspective}
              format={(v) => v.toFixed(2)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle description="What you're looking at">
              Reading the waterfall
            </CardTitle>
          </CardHeader>
          <CardBody className="text-sm text-zinc-400 space-y-2">
            <p>
              Each horizontal trace is the FFT power spectrum at one moment in
              time for the selected electrode. The newest trace sits in front
              and fully opaque; older traces recede up-and-back, narrow
              with perspective, and fade.
            </p>
            <p>
              Line color shifts by frequency band — violet δ, indigo θ,
              emerald α, amber β, rose γ — so sustained activity in any band
              appears as a coloured ridge running through time.
            </p>
            <p className="text-zinc-500">
              Use the on-canvas <b>Angle</b>, <b>Tilt</b>, and <b>Zoom</b>{" "}
              controls at the top-right of the chart to rotate the view and
              emphasise ridge height. The side sliders here control how much
              canvas the recede uses and how hard far rows shrink.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
