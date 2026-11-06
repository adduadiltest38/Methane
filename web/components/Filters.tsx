"use client";

import { CLASSES, CLASS_LABEL, rgb, type SiteClass } from "@/lib/classes";

export interface FilterState {
  classes: SiteClass[];
  minConfidence: number;
  activeSince: string; // YYYY-MM-DD or ""
  showDetections: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  classes: ["likely_flare", "persistent_industrial", "transient_fire", "unknown"],
  minConfidence: 0,
  activeSince: "",
  showDetections: false,
};

export default function Filters({
  value,
  onChange,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
}) {
  const toggle = (c: SiteClass) =>
    onChange({
      ...value,
      classes: value.classes.includes(c)
        ? value.classes.filter((x) => x !== c)
        : [...value.classes, c],
    });

  return (
    <div className="space-y-3 text-sm">
      <fieldset>
        <legend className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
          Classification
        </legend>
        {CLASSES.map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={value.classes.includes(c)}
              onChange={() => toggle(c)}
              className="accent-[var(--accent)]"
            />
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: rgb(c) }} />
            {CLASS_LABEL[c]}
          </label>
        ))}
      </fieldset>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Min. confidence: {value.minConfidence.toFixed(2)}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value.minConfidence}
          onChange={(e) => onChange({ ...value, minConfidence: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Active since</span>
        <input
          type="date"
          value={value.activeSince}
          onChange={(e) => onChange({ ...value, activeSince: e.target.value })}
          className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm [color-scheme:dark]"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={value.showDetections}
          onChange={(e) => onChange({ ...value, showDetections: e.target.checked })}
          className="accent-[var(--accent)]"
        />
        Raw detections heatmap (last 48 h)
      </label>
    </div>
  );
}
