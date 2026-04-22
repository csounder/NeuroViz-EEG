"use client";

import * as React from "react";
import {
  Bookmark,
  Check,
  Download,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  presetStore,
  usePresets,
  type Preset,
  type PresetScope,
} from "@/lib/presets";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Reusable preset picker: a pill row of named presets plus Save / Delete /
 * Import / Export controls. Scope-aware so the OSC page doesn't see DSP-only
 * presets and vice-versa (full-scope presets appear in both).
 */
export function PresetPicker({
  scope,
  /** Build the preset payload to save — called when the user clicks Save. */
  capture,
  /** Apply a loaded preset — called when the user clicks a preset pill. */
  apply,
  label = "Presets",
  className,
}: {
  scope: Exclude<PresetScope, "full">;
  capture: () => Partial<Preset>;
  apply: (preset: Preset) => void;
  label?: string;
  className?: string;
}) {
  const presets = usePresets(scope);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [showSave, setShowSave] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [draftDescription, setDraftDescription] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const payload = capture();
    const p = presetStore.save({
      id: undefined,
      name: draftName.trim() || `Preset ${presets.length + 1}`,
      description: draftDescription.trim() || undefined,
      scope,
      ...payload,
    });
    setActiveId(p.id);
    setShowSave(false);
    setDraftName("");
    setDraftDescription("");
  };

  const handleUpdate = () => {
    if (!activeId) return;
    const existing = presetStore.get(activeId);
    if (!existing) return;
    const payload = capture();
    presetStore.save({
      id: activeId,
      name: existing.name,
      description: existing.description,
      scope: existing.scope,
      ...payload,
    });
  };

  const handleApply = (p: Preset) => {
    setActiveId(p.id);
    apply(p);
  };

  const handleDelete = (id: string) => {
    presetStore.delete(id);
    if (activeId === id) setActiveId(null);
  };

  const handleExport = () => {
    const json = presetStore.exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neurovis-presets-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => fileRef.current?.click();
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const result = presetStore.import(text);
      console.info(
        `[presets] imported — added ${result.added}, updated ${result.updated}`,
      );
    };
    reader.readAsText(file);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 pr-1">
          <Bookmark className="h-3.5 w-3.5 text-zinc-500" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {label}
          </span>
        </div>

        {presets.length === 0 ? (
          <span className="text-xs text-zinc-500">
            None yet — save current settings to reuse later.
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <div key={p.id} className="group relative inline-flex">
                <button
                  onClick={() => handleApply(p)}
                  title={p.description ?? p.name}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                    activeId === p.id
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900",
                  )}
                >
                  {activeId === p.id && <Check className="h-3 w-3" />}
                  {p.name}
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  title={`Delete "${p.name}"`}
                  className="invisible absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 opacity-0 transition-opacity hover:border-rose-500/50 hover:text-rose-400 group-hover:visible group-hover:opacity-100"
                  aria-label={`Delete ${p.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {activeId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleUpdate}
              leftIcon={<Save className="h-3.5 w-3.5" />}
              title="Overwrite the currently loaded preset with current settings"
            >
              Update
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSave((v) => !v)}
            leftIcon={<Save className="h-3.5 w-3.5" />}
          >
            Save as
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleExport}
            leftIcon={<Download className="h-3.5 w-3.5" />}
            title="Export all presets as a JSON file"
          >
            Export
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleImportClick}
            leftIcon={<Upload className="h-3.5 w-3.5" />}
            title="Import a JSON file of presets"
          >
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {showSave && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Name
              </span>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g. Csound — alpha harp"
                className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Description (optional)
              </span>
              <input
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="What this preset is for"
                className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowSave(false);
                setDraftName("");
                setDraftDescription("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              leftIcon={<Save className="h-3.5 w-3.5" />}
            >
              Save preset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Utility hook — the list of presets can be used in read-only contexts too.
 */
export { usePresets };
