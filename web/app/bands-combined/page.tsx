"use client";

import * as React from "react";
import { Layers } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { BandTracesChart } from "@/components/charts/BandTracesChart";
import { BandSelector } from "@/components/widgets/BandSelector";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";
import { BAND_NAMES, type BandName } from "@/lib/types";

export default function BandsCombinedPage() {
  const [bands, setBands] = React.useState<BandName[]>([...BAND_NAMES]);
  const [scale, setScale] = React.useState<ScaleState>({
    auto: true,
    value: 12,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Layers className="h-4 w-4" />}
            description="All selected bands on one time axis — each band shows TP9, AF7, AF8, TP10 overlaid in that band’s color (Mind Monitor–style overlay)"
          >
            Combined bands
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <BandSelector value={bands} onChange={setBands} />
          <BandTracesChart
            layout="overlay"
            bands={bands}
            height={520}
            autoScale={scale.auto}
            scaleValue={scale.value}
          />
          <ScaleControl
            state={scale}
            onChange={setScale}
            label="dB span"
            unit="dB"
            bipolar
            min={3}
            max={40}
            helpAuto="Vertical range fits current Mind Monitor–style dB (10·log10 µV² + offset)."
            helpManual="Fixed ±dB half-span around the frame’s level center — lower = more vertical zoom."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="What you're looking at">
            Reading combined bands
          </CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-zinc-400 space-y-2">
          <p>
            For every band you enable, you get <strong>four</strong>{" "}
            band-pass-filtered traces — one per electrode — drawn in the same
            hue with TP9 boldest and TP10 most transparent so separations stay
            visible when signals diverge.
          </p>
          <p>
            Turn on δ through γ together to see how they move relative to each
            other on a shared timeline. For a <strong>separate row per band</strong>{" "}
            with channel colors (TP9/AF7/AF8/TP10), open{" "}
            <span className="text-zinc-200">Multichannel bands</span>.
          </p>
          <p className="text-zinc-500">
            The vertical scale uses a <strong>Mind Monitor–style dB</strong>{" "}
            mapping (10·log10 of µV² plus a calibration offset) so levels sit in
            a similar range to Mind Monitor’s band readouts — not the closed Muse
            SDK formula, but comparable for practice and A/B listening tests.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
