"use client";

import { Brain } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { BrainStateCard } from "@/components/widgets/BrainStateCard";
import { BandHistoryChart } from "@/components/charts/BandHistoryChart";
import { CalibrationGuide } from "@/components/widgets/CalibrationGuide";

export default function BrainStatePage() {
  return (
    <div className="space-y-6">
      {/* Calibration first — it's the action the user came here to do */}
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Brain className="h-4 w-4" />}
            description="A 90-second guided session that learns YOUR baseline — everything else is measured relative to it"
          >
            Calibration
          </CardTitle>
        </CardHeader>
        <CardBody>
          <CalibrationGuide />
        </CardBody>
      </Card>

      {/* Live brain state + band history keep running through calibration */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle description="Rolling 60-second history — watch your state drift in real time">
                Your brain waves
              </CardTitle>
            </CardHeader>
            <CardBody>
              <BandHistoryChart height={280} />
            </CardBody>
          </Card>
        </div>
        <BrainStateCard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle description="Simple heuristic classifier">
            How states are chosen
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-xs text-zinc-400 md:grid md:grid-cols-5 md:gap-3 md:space-y-0">
          <div>
            <div className="text-band-gamma font-medium">Aroused</div>
            <div>Gamma-dominant — excited / stressed / caffeinated</div>
          </div>
          <div>
            <div className="text-band-beta font-medium">Focused</div>
            <div>Beta-dominant — engaged thinking, problem-solving</div>
          </div>
          <div>
            <div className="text-band-alpha font-medium">Relaxed</div>
            <div>Alpha/theta-dominant — calm, creative, present</div>
          </div>
          <div>
            <div className="text-band-delta font-medium">Drowsy</div>
            <div>Delta-heavy — low arousal, approaching sleep</div>
          </div>
          <div>
            <div className="text-zinc-500 font-medium">Neutral</div>
            <div>No band clearly leading</div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
