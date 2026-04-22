"use client";

import * as React from "react";
import { Rows3 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { BandTracesChart } from "@/components/charts/BandTracesChart";
import { BandSelector } from "@/components/widgets/BandSelector";
import { ScaleControl, type ScaleState } from "@/components/ui/ScaleControl";
import { BAND_NAMES, type BandName } from "@/lib/types";

export default function BandsMultichannelPage() {
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
            icon={<Rows3 className="h-4 w-4" />}
            description="One time-domain strip per band (δ θ α β γ). Each strip shows TP9, AF7, AF8, TP10 in distinct colors — select any subset or all five at once"
          >
            Multichannel bands
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <BandSelector value={bands} onChange={setBands} />
          <BandTracesChart
            layout="stacked"
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
            helpAuto="Each strip auto-fits its dB min/max (Mind Monitor–style levels)."
            helpManual="Fixed ±dB half-span per strip; same sensitivity on every band row."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle description="Reading the multichannel view">
            Rows = bands, colors = electrodes
          </CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-zinc-400 space-y-2">
          <p>
            Each horizontal strip is one band’s band-pass output. The four
            traces use consistent colors: TP9 (emerald), AF7 (blue), AF8
            (amber), TP10 (violet) — the same legend in every row.
          </p>
          <p>
            Deselect bands you don’t need to enlarge the rest. With all five
            selected you get a full Mind Monitor–style stack: compare how α
            breathes in the forehead channels while δ–θ stay quieter in the
            temporal leads, and so on.
          </p>
          <p className="text-zinc-500">
            Filtering runs in the browser from streamed four-channel EEG
            (simulator or device). Sample rate is tracked so the biquads stay
            in tune with your stream.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
