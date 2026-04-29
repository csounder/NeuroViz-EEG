"use client";

import * as React from "react";
import { Download, Share2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  applyPerformancePreset,
  buildPerformancePreset,
  downloadPerformancePreset,
  parsePerformancePreset,
  performancePresetLocal,
  type NeuroVisPerformancePresetV1,
  type PerformancePresetCapture,
} from "@/lib/performancePreset";
import { useNeuroStore } from "@/lib/store";

type Props = {
  /** Current V12 + concert (+ optional research) snapshot from the page. */
  capture: () => PerformancePresetCapture;
  /** Apply parsed preset into page state (and optionally global store). */
  onApply: (preset: NeuroVisPerformancePresetV1) => void;
  className?: string;
};

export function PerformancePresetShareCard({ capture, onApply, className }: Props) {
  const setBandEdgePreset = useNeuroStore((s) => s.setBandEdgePreset);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [includeResearch, setIncludeResearch] = React.useState(true);
  const [saved, setSaved] = React.useState(() => performancePresetLocal.list());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refreshSaved = React.useCallback(() => {
    setSaved(performancePresetLocal.list());
  }, []);

  const handleSaveLocal = () => {
    const base = capture();
    const preset = buildPerformancePreset(
      includeResearch ? base : { ...base, research: undefined },
      { name: name.trim() || "Performance preset", description: description.trim() || undefined, author: author.trim() || undefined },
    );
    const entry = performancePresetLocal.save(preset);
    setActiveId(entry.id);
    refreshSaved();
  };

  const handleDownload = () => {
    const base = capture();
    const preset = buildPerformancePreset(
      includeResearch ? base : { ...base, research: undefined },
      { name: name.trim() || "Performance preset", description: description.trim() || undefined, author: author.trim() || undefined },
    );
    downloadPerformancePreset(preset);
  };

  const handleApplyEntry = (preset: NeuroVisPerformancePresetV1) => {
    const parts = applyPerformancePreset(preset);
    if (parts.bandEdgePreset) setBandEdgePreset(parts.bandEdgePreset);
    onApply(preset);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      const preset = parsePerformancePreset(parsed);
      if (!preset) return;
      handleApplyEntry(preset);
      setName(preset.name);
      setDescription(preset.description ?? "");
      setAuthor(preset.author ?? "");
      setIncludeResearch(Boolean(preset.research?.bandEdgePreset));
    };
    reader.readAsText(file);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-950/45 p-4 text-xs leading-5 text-zinc-400",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-zinc-200">
        <Share2 className="h-4 w-4 text-emerald-400" />
        <span className="font-semibold">Share performance preset</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Export a single JSON file with concert visuals, V12 audio mapping, and optionally the Research band-edge
        preset. Send the file to another machine; open Concert and use Import to match your stage setup.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Amy — aurora + gamma lead"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Author (optional)</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
        </label>
      </div>
      <label className="mt-2 block space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Notes (optional)</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description for the file"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />
      </label>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-zinc-300">
        <input
          type="checkbox"
          checked={includeResearch}
          onChange={(e) => setIncludeResearch(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Include band-edge preset (Research → matches Mind Monitor / FFT shading)
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={handleDownload}>
          Download JSON
        </Button>
        <Button type="button" leftIcon={<Upload className="h-4 w-4" />} onClick={handleSaveLocal}>
          Save in this browser
        </Button>
        <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>
          Import file…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleImportFile(f);
          }}
        />
      </div>

      {saved.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Saved on this browser</div>
          <div className="flex flex-wrap gap-2">
            {saved.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
                  activeId === entry.id
                    ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-200"
                    : "border-zinc-700 bg-zinc-900/80 text-zinc-300",
                )}
              >
                <button
                  type="button"
                  className="max-w-[180px] truncate px-1 text-left hover:text-white"
                  onClick={() => {
                    setActiveId(entry.id);
                    handleApplyEntry(entry.preset);
                  }}
                  title={entry.preset.name}
                >
                  {entry.name}
                </button>
                <button
                  type="button"
                  className="p-0.5 text-zinc-500 hover:text-rose-400"
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => {
                    performancePresetLocal.delete(entry.id);
                    if (activeId === entry.id) setActiveId(null);
                    refreshSaved();
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
