"use client";

import { CLASSES, CLASS_LABEL, rgb, type SiteClass } from "@/lib/classes";
import { compact } from "@/lib/format";

export interface FilterState {
  classes: SiteClass[];
  minConfidence: number;
  activeSince: string; // YYYY-MM-DD or ""
  showDetections: boolean;
  detailMap: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  classes: ["likely_flare", "persistent_industrial", "transient_fire", "unknown"],
  minConfidence: 0,
  activeSince: "",
  showDetections: false,
  detailMap: false,
};

function Switch({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[13px] text-fg">
      <span>{children}</span>
      <span className="relative inline-flex">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-4 w-7 rounded-full border border-line bg-ink-3 transition peer-checked:border-heat-2/70 peer-checked:bg-heat-2/25 peer-focus-visible:outline-2 peer-focus-visible:outline-heat-2" />
        <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-muted transition peer-checked:translate-x-3 peer-checked:bg-heat-1" />
      </span>
    </label>
  );
}

export default function Filters({
  value,
  onChange,
  counts,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  counts: Partial<Record<SiteClass, number>> | null;
}) {
  const toggle = (c: SiteClass) =>
    onChange({
      ...value,
      classes: value.classes.includes(c) ? value.classes.filter((x) => x !== c) : [...value.classes, c],
    });
  const total = counts ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="label mb-2">Classification</legend>
        <div className="space-y-1">
          {CLASSES.map((c) => {
            const on = value.classes.includes(c);
            const n = counts?.[c] ?? 0;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c)}
                className={`group relative flex w-full items-center gap-2.5 overflow-hidden border px-2.5 py-1.5 text-left transition ${
                  on ? "border-line bg-ink-2" : "border-transparent bg-transparent opacity-45 hover:opacity-80"
                }`}
              >
                {/* share of all sites, drawn as a faint bar behind the row */}
                <span
                  className="absolute inset-y-0 left-0"
                  style={{ width: total ? `${(100 * n) / total}%` : 0, background: rgb(c, 0.09) }}
                  aria-hidden
                />
                <span
                  className="relative h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: rgb(c), boxShadow: on ? `0 0 8px ${rgb(c, 0.9)}` : "none" }}
                />
                <span className="relative flex-1 text-[13px]">{CLASS_LABEL[c]}</span>
                <span className="readout relative text-[11px] text-muted">{counts ? compact(n) : "…"}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="minconf" className="label">
            Min. confidence
          </label>
          <span className="readout text-[12px] text-heat-1">{value.minConfidence.toFixed(2)}</span>
        </div>
        <input
          id="minconf"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value.minConfidence}
          onChange={(e) => onChange({ ...value, minConfidence: Number(e.target.value) })}
          className="w-full"
        />
        <div className="readout flex justify-between text-[10px] text-faint" aria-hidden>
          <span>0</span>
          <span>0.4 med</span>
          <span>0.7 high</span>
          <span>1</span>
        </div>
      </div>

      <div>
        <label htmlFor="since" className="label mb-1 block">
          Active since
        </label>
        <input
          id="since"
          type="date"
          value={value.activeSince}
          onChange={(e) => onChange({ ...value, activeSince: e.target.value })}
          className="readout w-full border border-line bg-ink-2 px-2 py-1.5 text-[12px] text-fg [color-scheme:dark]"
        />
      </div>

      <div className="border-t border-line-soft pt-3">
        <div className="label mb-1">Layers</div>
        <Switch id="heat" checked={value.showDetections} onChange={(v) => onChange({ ...value, showDetections: v })}>
          Raw detections, last 48 h
        </Switch>
        <Switch id="detail" checked={value.detailMap} onChange={(v) => onChange({ ...value, detailMap: v })}>
          Detailed street map
        </Switch>
      </div>
    </div>
  );
}
