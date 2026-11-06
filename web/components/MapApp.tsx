"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityChange, RawDetection, SiteCollection } from "@/lib/types";
import ChangesFeed from "./ChangesFeed";
import Filters, { DEFAULT_FILTERS, type FilterState } from "./Filters";
import Legend from "./Legend";
import type { FlyTarget } from "./MapView";
import SitePanel from "./SitePanel";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm">Loading map…</div>,
});

export default function MapApp() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sites, setSites] = useState<SiteCollection | null>(null);
  const [changes, setChanges] = useState<ActivityChange[] | null>(null);
  const [detections, setDetections] = useState<RawDetection[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.classes.length) p.set("class", filters.classes.join(","));
    if (filters.minConfidence > 0) p.set("minConfidence", String(filters.minConfidence));
    if (filters.activeSince) p.set("activeSince", filters.activeSince);
    return p.toString();
  }, [filters.classes, filters.minConfidence, filters.activeSince]);

  useEffect(() => {
    if (filters.classes.length === 0) {
      setSites({ type: "FeatureCollection", features: [] });
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/sites?${query}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SiteCollection) => {
        setSites(d);
        setError(null);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError("Could not load sites.");
      });
    return () => ctrl.abort();
  }, [query, filters.classes.length]);

  useEffect(() => {
    fetch("/api/changes?limit=50")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setChanges(d.changes))
      .catch(() => setChanges([]));
  }, []);

  useEffect(() => {
    if (!filters.showDetections) {
      setDetections(null);
      return;
    }
    fetch("/api/detections?hours=48")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setDetections(d.detections))
      .catch(() => setDetections([]));
  }, [filters.showDetections]);

  const pickChange = useCallback((c: ActivityChange) => {
    setSelected(c.site_id);
    setFlyTo({ lon: c.lon, lat: c.lat, key: Date.now() });
    setSidebarOpen(false);
  }, []);

  const count = sites?.features.length ?? 0;

  return (
    <div className="absolute inset-0 flex">
      {/* sidebar: filters + changes feed */}
      <aside
        className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-20 w-72 flex-col gap-4 overflow-y-auto border-r border-[var(--border)] bg-[var(--panel)] p-4 md:static md:flex`}
      >
        <div className="flex items-center justify-between md:hidden">
          <span className="font-medium">Filters</span>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close filters">
            ✕
          </button>
        </div>
        <Filters value={filters} onChange={setFilters} />
        <p className="text-xs text-[var(--muted)]">
          {sites === null ? "Loading sites…" : `${count} site${count === 1 ? "" : "s"} shown`}
        </p>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
            Recent activity changes
          </h2>
          <ChangesFeed changes={changes} onPick={pickChange} />
        </section>
      </aside>

      <div className="relative min-w-0 flex-1">
        <MapView
          sites={sites?.features ?? []}
          detections={detections}
          selectedId={selected}
          flyTo={flyTo}
          onSelect={setSelected}
        />
        <button
          className="absolute left-3 top-3 z-10 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm md:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          Filters &amp; changes
        </button>
        <div className="pointer-events-none absolute left-3 top-14 z-10 md:top-3">
          <div className="pointer-events-auto">
            <Legend />
          </div>
        </div>
      </div>

      {selected !== null && (
        <aside className="absolute inset-x-0 bottom-0 z-30 h-[60%] border-t border-[var(--border)] bg-[var(--panel)] md:static md:h-auto md:w-96 md:border-l md:border-t-0">
          <SitePanel siteId={selected} onClose={() => setSelected(null)} />
        </aside>
      )}
    </div>
  );
}
