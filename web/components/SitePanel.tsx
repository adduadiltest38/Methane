"use client";

import { useEffect, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CLASS_LABEL, rgb } from "@/lib/classes";
import { dms, isoDay } from "@/lib/format";
import type { SiteDetail, TimeseriesPoint } from "@/lib/types";
import ChangeItem from "./ChangeItem";

function confidenceWord(c: number | null): string {
  if (c === null) return "n/a";
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

// Ten-segment meter; filled segments run through the thermal ramp.
function Meter({ value }: { value: number | null }) {
  const filled = Math.round((value ?? 0) * 10);
  const ramp = ["#ffd27a", "#ffc46a", "#ffb65b", "#ffa84d", "#ff9f43", "#fb8a3e", "#f77539", "#f46534", "#f25a30", "#f2542d"];
  return (
    <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value ?? 0}>
      {ramp.map((color, i) => (
        <span
          key={color}
          className="h-2 flex-1"
          style={{ background: i < filled ? color : "var(--color-ink-3)" }}
        />
      ))}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="border border-line-soft bg-ink-2/60 px-2.5 py-2">
      <div className="label text-[10px]!">{label}</div>
      <div className="readout mt-0.5 text-[15px] text-fg">
        {value}
        {unit && <span className="ml-1 text-[11px] text-muted">{unit}</span>}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: TimeseriesPoint }[] }) {
  const p = active && payload?.[0]?.payload;
  if (!p) return null;
  return (
    <div className="readout border border-line bg-ink-1 px-2 py-1 text-[11px]">
      <div className="text-muted">{p.day}</div>
      <div className="text-heat-1">{p.frp_sum.toFixed(1)} MW FRP</div>
      <div className="text-fg/80">
        {p.detections} detections · {p.night_detections} at night
      </div>
    </div>
  );
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
      fetch(`/api/sites/${siteId}/timeseries`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ])
      .then(([s, ts]) => {
        if (cancelled) return;
        setSite(s);
        setSeries(ts.series);
      })
      .catch(() => !cancelled && setError("Could not load this site. Try again in a moment."));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const nightShare =
    series && series.length
      ? series.reduce((a, p) => a + p.night_detections, 0) / Math.max(1, series.reduce((a, p) => a + p.detections, 0))
      : null;

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto">
      {/* header strip, tinted by the site's class */}
      <div
        className="sticky top-0 z-10 border-b border-line bg-ink-1 px-4 pb-3 pt-3"
        style={site ? { boxShadow: `inset 0 3px 0 ${rgb(site.classification)}` } : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="label">Site</div>
            <h2 className="readout text-[26px] font-medium leading-none tracking-tight text-fg">
              {site?.code ?? "FW-····"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center border border-line text-muted hover:border-heat-2 hover:text-fg"
            aria-label="Close site panel"
          >
            ×
          </button>
        </div>
        {site && (
          <div className="readout mt-2 text-[12px] text-muted">
            {dms(site.lat, "N", "S")} {dms(site.lon, "E", "W")}
            {site.country && <span className="ml-2 font-sans text-[13px] text-fg">{site.country}</span>}
          </div>
        )}
      </div>

      <div className="space-y-5 px-4 py-4">
        {error && <p className="text-[13px] text-coral">{error}</p>}

        {site && (
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className="px-2 py-0.5 font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-0"
                style={{ background: rgb(site.classification) }}
              >
                {CLASS_LABEL[site.classification]}
              </span>
              {site.matches_reference && (
                <span className="border border-line px-2 py-0.5 text-[12px] text-muted">
                  within 750 m of a reference flare
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between">
              <span className="label">Classification confidence</span>
              <span className="readout text-[12px] text-fg">
                {site.class_confidence?.toFixed(2) ?? "n/a"}{" "}
                <span className="text-muted">({confidenceWord(site.class_confidence)})</span>
              </span>
            </div>
            <div className="mt-1.5">
              <Meter value={site.class_confidence} />
            </div>
          </section>
        )}

        {site && (
          <section className="grid grid-cols-2 gap-2">
            <Stat label="Thermal intensity, 30 d" value={site.frp_30d.toFixed(1)} unit="MW FRP" />
            <Stat label="Detections, 30 d" value={String(site.detections_30d)} />
            <Stat label="Clear-sky days, 90 d" value={String(site.observed_days)} />
            <Stat label="Detections, 90 d" value={String(site.observation_count)} />
            <Stat label="First seen" value={isoDay(site.first_seen)} />
            <Stat label="Last seen" value={isoDay(site.last_seen)} />
          </section>
        )}

        <section>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="label">Daily intensity, 90 d</span>
            {nightShare !== null && (
              <span className="readout text-[11px] text-muted">{Math.round(nightShare * 100)}% night passes</span>
            )}
          </div>
          <div className="h-44 w-full">
            {series === null ? (
              <div className="h-full animate-pulse bg-ink-2" />
            ) : series.length === 0 ? (
              <p className="pt-4 text-[12px] text-faint">No detections in the last 90 days.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 6, right: 14, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="frpFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f2542d" stopOpacity={0.55} />
                      <stop offset="55%" stopColor="#ff9f43" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#ffd27a" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="frpLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f2542d" />
                      <stop offset="100%" stopColor="#ffd27a" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a2638" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "#5a6880", fontFamily: "JetBrains Mono" }}
                    tickFormatter={(d: string) => d.slice(5)}
                    minTickGap={28}
                    axisLine={{ stroke: "#233149" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="frp"
                    tick={{ fontSize: 10, fill: "#5a6880", fontFamily: "JetBrains Mono" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis yAxisId="n" orientation="right" hide domain={[0, (max: number) => max * 4]} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#8c99b0", strokeDasharray: "2 3" }} />
                  <Bar yAxisId="n" dataKey="detections" fill="#3a4a66" isAnimationActive={false} />
                  <Area
                    yAxisId="frp"
                    type="monotone"
                    dataKey="frp_sum"
                    stroke="url(#frpLine)"
                    strokeWidth={1.5}
                    fill="url(#frpFill)"
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-gradient-to-r from-heat-1 to-heat-3" /> MW FRP, daily sum
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 bg-[#3a4a66]" /> detections
            </span>
          </div>
        </section>

        {site && (
          <section>
            <div className="label mb-1">Activity changes</div>
            {site.changes.length === 0 ? (
              <p className="text-[12px] text-faint">None detected for this site.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {site.changes.map((c) => (
                  <ChangeItem key={c.id} change={c} showSite={false} />
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="border-t border-line-soft pt-3 text-[11px] leading-relaxed text-faint">
          Satellite-derived estimate. Clouds, overpass gaps and the 375 m pixel size affect what is detected.
          FRP is a relative intensity indicator only.
        </p>
      </div>
    </div>
  );
}
