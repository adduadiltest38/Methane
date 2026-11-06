import type { Metadata } from "next";
import { BASEMAP_ATTRIBUTION, DISCLAIMER, FIRMS_ATTRIBUTION, ORNL_CITATION } from "@/lib/attribution";
import { CLASS_LABEL, rgb } from "@/lib/classes";
import t from "@/lib/thresholds.json";

export const metadata: Metadata = { title: "Method — FlareWatch" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-x-10 gap-y-3 border-t border-line py-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <h2 className="label pt-1 text-[12px]! text-heat-1!">{title}</h2>
      <div className="min-w-0 max-w-[68ch] space-y-3 text-[15px] leading-relaxed text-fg/85">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="readout bg-ink-2 px-1.5 py-0.5 text-[0.85em] text-heat-1">{children}</code>;
}

const SPEC: [string, string][] = [
  ["Sensor", "VIIRS I-band, 375 m pixels"],
  ["Satellites", "Suomi NPP · NOAA-20 · NOAA-21"],
  ["Region", "34–63°E, 12–38°N"],
  ["Update cadence", "every 3 h (minute 17, UTC)"],
  ["Data latency", "≈ 3 h after overpass"],
  ["Unit shown", "MW FRP (relative intensity)"],
];

const PIPELINE: [string, string][] = [
  ["Ingest", "Fetch the last 2 days from each satellite; duplicates are skipped."],
  ["Cluster", `Group detections within ${t.dbscan_eps_m} m into sites (DBSCAN, haversine).`],
  ["Aggregate", "Daily totals per site: detections, night passes, FRP sum and peak."],
  ["Classify", "Rule-based label and confidence from 90 days of history."],
  ["Compare", `Flag activity changes when |z| ≥ ${t.change_z_threshold}.`],
];

export default function About() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <article className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-8">
        <header className="grid gap-8 pb-8 md:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="label">Method &amp; data</div>
            <h1 className="mt-2 font-display text-[44px] font-semibold uppercase leading-[0.95] tracking-[0.04em] text-fg [text-wrap:balance] sm:text-[56px]">
              How FlareWatch reads <span className="heat-text">heat from orbit</span>
            </h1>
            <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-fg/80">
              An educational, non-commercial map of satellite-detected gas flares and persistent industrial heat in
              the Middle East. Sites carry only a generated code, coordinates and country. FlareWatch does not link
              sites to any operator, does not convert heat to gas volumes or emissions, and does not compare its
              estimates with official figures.
            </p>
          </div>
          <dl className="bezel self-start divide-y divide-line-soft">
            {SPEC.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2">
                <dt className="label text-[10px]!">{k}</dt>
                <dd className="readout text-right text-[12px] text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <Section id="pipeline" title="Pipeline">
          <ol className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-5">
            {PIPELINE.map(([name, text], i) => (
              <li key={name} className="bg-ink-1 p-3">
                <div className="readout text-[11px] text-heat-2">{String(i + 1).padStart(2, "0")}</div>
                <div className="font-display text-[16px] font-semibold uppercase tracking-[0.08em] text-fg">{name}</div>
                <p className="mt-1 text-[12px] leading-snug text-muted">{text}</p>
              </li>
            ))}
          </ol>
          <p>
            Detections come from NASA FIRMS. Each one carries a fire radiative power (FRP) value in megawatts, which
            FlareWatch shows only as a relative intensity indicator. Low-confidence detections are stored but not
            clustered. New detections within {t.site_match_radius_m} m of an existing site join that site; a site&apos;s
            position is the FRP-weighted mean of its detections.
          </p>
        </Section>

        <Section id="classification" title="Classification">
          <p>For each site, over the last 90 days:</p>
          <ul className="space-y-1.5">
            <li>
              <Code>persistence</Code> = days with a detection ÷ days with satellite coverage, counted from the
              site&apos;s first detection
            </li>
            <li>
              <Code>ref_match</Code> = within {t.site_match_radius_m} m of a location in the NASA ORNL DAAC reference
              flare list
            </li>
            <li>
              <Code>span</Code> = last seen − first seen
            </li>
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="label py-2 pr-4">Label</th>
                  <th className="label py-2">Rule (first match wins)</th>
                </tr>
              </thead>
              <tbody className="readout text-[12px]">
                {(
                  [
                    ["likely_flare", `ref_match and persistence ≥ ${t.flare_min_persistence}`],
                    [
                      "persistent_industrial",
                      `no ref_match, persistence ≥ ${t.industrial_min_persistence}, span ≥ ${t.industrial_min_span_days} d`,
                    ],
                    [
                      "transient_fire",
                      `span < ${t.transient_max_span_days} d and persistence < ${t.transient_max_persistence}`,
                    ],
                    ["unknown", "anything else"],
                  ] as const
                ).map(([cls, rule]) => (
                  <tr key={cls} className="border-b border-line-soft">
                    <td className="py-2 pr-4 font-sans text-[13px] text-fg">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: rgb(cls) }} />
                      {CLASS_LABEL[cls]}
                    </td>
                    <td className="py-2 text-muted">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bezel mt-2 px-4 py-3">
            <div className="label mb-1 text-[10px]!">Confidence, 0–1</div>
            <p className="readout text-[13px] leading-relaxed text-fg">
              {t.conf_w_evidence} × evidence + {t.conf_w_obs} × min(1, detections ÷ {t.conf_obs_saturation}) +{" "}
              {t.conf_w_ref} × ref_match
            </p>
            <p className="mt-2 text-[13px] text-muted">
              Evidence is min(1, persistence ÷ {t.conf_persistence_saturation}) for flares and industrial heat, 1 −
              persistence ÷ {t.transient_max_persistence} for transient fires, and 0 for unclassified sites. Without a
              reference match the score tops out at {(t.conf_w_evidence ?? 0) + (t.conf_w_obs ?? 0)}.
            </p>
          </div>
        </Section>

        <Section id="changes" title="Activity changes">
          <p>
            For sites with at least {t.change_min_history_days} days of history, the mean daily FRP of the last{" "}
            {t.change_recent_days} complete days is compared with the preceding {t.change_baseline_days} days:{" "}
            <Code>z = (recent − baseline) ÷ std</Code>, with the spread floored at {t.change_min_std_mw} MW. An event is
            recorded when |z| ≥ {t.change_z_threshold}, at most once per site every {t.change_cooldown_days} days.
            Days without satellite coverage are left out rather than counted as zero.
          </p>
          <p>
            A persistent site with no detections for {t.inactive_after_days} days is marked as having no recent
            detections. A site that appeared within the last {t.new_site_window_days} days and was seen on at least{" "}
            {t.new_site_min_observed_days} days is listed as a new persistent source. An activity change describes
            only what the satellite detected; weather, maintenance or coverage gaps can all cause one.
          </p>
        </Section>

        <Section id="limits" title="Known limits">
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ["Clouds & smoke", "hide heat sources, so cloudy weeks look like low activity."],
              ["375 m pixels", "merge neighbouring sources and miss small ones."],
              ["Latency", "near-real-time data arrive ~3 h late and are reprocessed later."],
              ["Overpasses", "only a few per day; short events between passes are missed."],
              ["False positives", "sun glint, hot surfaces, volcanoes and other industry."],
              ["Reference list", "is annual, so recent changes on the ground lag behind."],
            ].map(([k, v]) => (
              <li key={k} className="border-l-2 border-heat-2/60 bg-ink-1 px-3 py-2 text-[13px]">
                <span className="font-display text-[14px] font-semibold uppercase tracking-[0.06em] text-fg">{k}</span>{" "}
                <span className="text-muted">{v}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="attribution" title="Attribution">
          <ul className="space-y-3 text-[14px]">
            <li>{FIRMS_ATTRIBUTION}</li>
            <li>{ORNL_CITATION}</li>
            <li>Country borders: Natural Earth (public domain). Detailed street map: OpenFreeMap — {BASEMAP_ATTRIBUTION}.</li>
          </ul>
        </Section>

        <Section id="disclaimer" title="Disclaimer">
          <p>{DISCLAIMER}</p>
          <p className="text-muted">No advertising, no paid tiers, no tracking. Source code is MIT-licensed.</p>
        </Section>
      </article>
    </div>
  );
}
