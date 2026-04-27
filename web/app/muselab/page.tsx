"use client";

import * as React from "react";
import { PanelTop } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { MuseLabPanel } from "@/components/charts/MuseLabPanel";

export default function MuseLabPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle
            icon={<PanelTop className="h-4 w-4" />}
            description="Stacked raw EEG and spectrum, similar to the classic MuseLab desktop app layout."
          >
            MuseLab-style view
          </CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="p-4">
            <MuseLabPanel height={560} />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
