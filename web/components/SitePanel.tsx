"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CLASS_LABEL, rgb } from "@/lib/classes";
import type { SiteDetail, TimeseriesPoint } from "@/lib/types";
import ChangeItem from "./ChangeItem";

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "—";
}

function confidenceLabel(c: number | null): string {
  if (c === null) return "n/a";
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

export default function SitePanel({ siteId, onClose }: { siteId: number; onClose: () => void }) {
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSite(null);
    setSeries(null);
    setError(null);
    Promise.all([
      fetch(`/api/sites/${siteId}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch(`/api/sites/${siteId}/timeseries`).then((r) =>
        r.ok ? r.json() : Promise.reject(r.status),
      ),
    ])
      .then(([s, ts]) => {
        if (cancelled) return;
        setSite(s);
        setSeries(ts.series);
      })
      .catch(() => !cancelled && setError("Could not load site details."));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{site?.code ?? "…"}</h2>
          {site && (
            <p className="text-xs text-[var(--muted)]">
              {site.lat.toFixed(4)}°N, {site.lon.toFixed(4)}°E
              {site.country ? ` · ${site.country}` : ""}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
          aria-label="Close site panel"
        >
          ✕
        </button>
      </div>

      {error && <p className="text-red-300">{error}</p>}

      {site && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium text-black"
              style={{ background: rgb(site.classification) }}
            >
              {CLASS_LABEL[site.classification]}
            </span>
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
              confidence {site.class_confidence?.toFixed(2) ?? "n/a"} (
              {confidenceLabel(site.class_confidence)})
            </span>
            {site.matches_reference && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                near reference flare location
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-[var(--muted)]">First seen</dt>
            <dd>{fmtDate(site.first_seen)}</dd>
            <dt className="text-[var(--muted)]">Last seen</dt>
            <dd>{fmtDate(site.last_seen)}</dd>
            <dt className="text-[var(--muted)]">Detections (90 d)</dt>
            <dd>{site.observation_count}</dd>
            <dt className="text-[var(--muted)]">Clear-sky observation days (90 d)</dt>
            <dd>{site.observed_days}</dd>
            <dt className="text-[var(--muted)]">Relative thermal intensity (30 d)</dt>
            <dd>{site.frp_30d.toFixed(1)} MW FRP</dd>
          </dl>
        </>
      )}

      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
          Daily relative thermal intensity (MW FRP) &amp; detections
        </h3>
        <div className="h-52 w-full">
          {series === null ? (
            <p className="text-xs text-[var(--muted)]">Loading…</p>
          ) : series.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No detections in the last 90 days.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#2a3142" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9aa3b5" }} minTickGap={24} />
                <YAxis yAxisId="frp" tick={{ fontSize: 10, fill: "#9aa3b5" }} />
                <YAxis yAxisId="n" orientation="right" hide domain={[0, (max: number) => max * 3]} />
                <Tooltip
                  contentStyle={{ background: "#141821", border: "1px solid #2a3142", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="n" dataKey="detections" name="Detections" fill="#3b4560" />
                <Line
                  yAxisId="frp"
                  type="monotone"
                  dataKey="frp_sum"
                  name="MW FRP (daily sum)"
                  stroke="#ffa600"
                  dot={false}
                  strokeWidth={1.5}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {site && (
        <div>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
            Activity changes
          </h3>
          {site.changes.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No activity changes detected.</p>
          ) : (
            <ul className="space-y-1">
              {site.changes.map((c) => (
                <ChangeItem key={c.id} change={c} showSite={false} />
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-auto text-[10px] text-[var(--muted)]">
        Satellite-derived estimate. Cloud cover, overpass gaps and the 375 m pixel size affect what
        is detected.
      </p>
    </div>
  );
}
