"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SiteClass } from "@/lib/classes";
import type { ActivityChange, Meta, RawDetection, SiteCollection } from "@/lib/types";
import ChangesFeed from "./ChangesFeed";
import Filters, { DEFAULT_FILTERS, type FilterState } from "./Filters";
import Legend from "./Legend";
import type { FlyTarget } from "./MapView";
import SitePanel from "./SitePanel";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="label absolute inset-0 grid place-items-center bg-[#070d17]">Loading chart…</div>
  ),
});

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-3 py-1.5">
      <div className="label text-[10px]!">{label}</div>
      <div className={`readout text-[15px] ${tone ?? "text-fg"}`}>{value}</div>
    </div>
  );
}

export default function MapApp() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sites, setSites] = useState<SiteCollection | null>(null);
  const [changes, setChanges] = useState<ActivityChange[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [detections, setDetections] = useState<RawDetection[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [drawer, setDrawer] = useState(false);
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
        if (e?.name !== "AbortError") setError("Sites could not be loaded. Reload the page to try again.");
      });
    return () => ctrl.abort();
  }, [query, filters.classes.length]);

  useEffect(() => {
    fetch("/api/changes?limit=60")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setChanges(d.changes))
      .catch(() => setChanges([]));
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setMeta)
      .catch(() => setMeta(null));
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
    setDrawer(false);
  }, []);

  const shown = sites?.features.length ?? 0;
  const frpShown = useMemo(
    () => (sites ? sites.features.reduce((a, f) => a + f.properties.frp_30d, 0) : 0),
    [sites],
  );
  const counts = (meta?.class_counts ?? null) as Partial<Record<SiteClass, number>> | null;

  return (
    <div className="absolute inset-0 flex">
      {/* instrument rail: filters + activity log */}
      <aside
        className={`${drawer ? "flex" : "hidden"} scroll-thin absolute inset-y-0 left-0 z-30 w-[300px] flex-col overflow-y-auto border-r border-line bg-ink-1 md:static md:flex`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
          <span className="label">Filters &amp; activity</span>
          <button onClick={() => setDrawer(false)} aria-label="Close filters" className="text-muted">
            ×
          </button>
        </div>
        <div className="px-4 py-4">
          <Filters value={filters} onChange={setFilters} counts={counts} />
          {error && <p className="mt-3 text-[12px] text-coral">{error}</p>}
        </div>
        <section className="border-t border-line">
          <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
            <h2 className="label">Activity log</h2>
            <span className="readout text-[10px] text-faint">last 30 d</span>
          </div>
          <ChangesFeed changes={changes} selectedSite={selected} onPick={pickChange} />
        </section>
      </aside>

      <div className="relative min-w-0 flex-1">
        <MapView
          sites={sites?.features ?? []}
          detections={detections}
          selectedId={selected}
          flyTo={flyTo}
          detailMap={filters.detailMap}
          onSelect={setSelected}
        />

        {/* readout strip over the chart */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
          <button
            className="bezel pointer-events-auto self-start px-3 py-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-fg md:hidden"
            onClick={() => setDrawer(true)}
          >
            Filters &amp; activity
          </button>
          <div className="bezel pointer-events-auto hidden divide-x divide-line-soft sm:flex">
            <Readout label="Sites shown" value={sites ? shown.toLocaleString("en-US") : "…"} />
            <Readout
              label="Thermal intensity, 30 d"
              value={sites ? `${Math.round(frpShown).toLocaleString("en-US")} MW` : "…"}
              tone="heat-text"
            />
            <Readout
              label="Detections, 24 h"
              value={meta ? meta.detections_24h.toLocaleString("en-US") : "…"}
            />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-9 left-3 z-10 max-w-[calc(100%-4rem)]">
          <div className="pointer-events-auto">
            <Legend />
          </div>
        </div>
      </div>

      {selected !== null && (
        <aside className="absolute inset-x-0 bottom-0 z-40 h-[62%] border-t border-line bg-ink-1 md:static md:h-auto md:w-[380px] md:border-l md:border-t-0">
          <SitePanel siteId={selected} onClose={() => setSelected(null)} />
        </aside>
      )}
    </div>
  );
}
