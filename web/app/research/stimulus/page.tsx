"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { StimulusAlignedLab } from "@/components/research/StimulusAlignedLab";

export default function ResearchStimulusPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-3 py-4 md:px-4">
      <div className="flex items-center gap-3">
        <Link
          href="/research"
          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          <ChevronLeft className="h-4 w-4" />
          Research Mode
        </Link>
      </div>
      <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Stimulus-aligned EEG</h1>
      <StimulusAlignedLab />
    </div>
  );
}
