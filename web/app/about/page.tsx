import type { Metadata } from "next";
import {
  BASEMAP_ATTRIBUTION,
  DISCLAIMER,
  FIRMS_ATTRIBUTION,
  ORNL_CITATION,
} from "@/lib/attribution";
import t from "@/lib/thresholds.json";

export const metadata: Metadata = { title: "About & methodology — FlareWatch" };

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-lg font-semibold text-[var(--text)]">{children}</h2>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--panel-2)] px-1 py-0.5 text-[0.85em] text-[var(--text)]">
      {children}
    </code>
  );
}

export default function About() {
  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-[var(--muted)]">
        <h1 className="text-2xl font-semibold text-[var(--text)]">About FlareWatch</h1>
        <p className="mt-2">
          FlareWatch is an educational, non-commercial map of satellite-detected gas flares and
          persistent industrial heat sources in the Middle East. It groups NASA VIIRS thermal
          detections into sites, estimates what kind of heat source each site is likely to be, and
          highlights activity changes over time.
        </p>
        <p className="mt-2">
          Sites are identified only by an auto-generated code (e.g. <Code>FW-0001</Code>),
          coordinates and country. FlareWatch does not link sites to any operator or company, does
          not convert thermal intensity to gas volumes or emissions, and does not compare its
          estimates with any official figures.
        </p>

        <H2>The data</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-[var(--text)]">Detections</strong> — NASA FIRMS VIIRS 375 m
            active fire / thermal anomaly product from three satellites (Suomi NPP, NOAA-20,
            NOAA-21), ingested every 3 hours. Historical backfill uses the Standard Processing
            archive.
          </li>
          <li>
            <strong className="text-[var(--text)]">Relative thermal intensity</strong> — each
            detection carries a fire radiative power (FRP) value in megawatts. FlareWatch shows FRP
            only as a relative intensity indicator (&quot;MW FRP&quot;).
          </li>
          <li>
            <strong className="text-[var(--text)]">Reference flare list</strong> — the NASA ORNL
            DAAC &quot;Methane Flaring Sites VIIRS&quot; dataset, used only as reference labels when
            classifying sites.
          </li>
        </ul>

        <H2>From detections to sites</H2>
        <p>
          Detections with nominal or high confidence from the last 90 days are clustered with
          DBSCAN (haversine distance, <Code>eps = {t.dbscan_eps_m} m</Code>,{" "}
          <Code>min_samples = {t.dbscan_min_samples}</Code>). New detections or clusters within{" "}
          {t.site_match_radius_m} m of an existing site are attached to that site; otherwise a new
          site is created. A site&apos;s position is the FRP-weighted mean of its detections.
        </p>

        <H2>Classification (rule-based v1)</H2>
        <p>Over the last 90 days, for each site:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Code>persistence</Code> = days with ≥1 detection ÷ days with satellite data coverage
            (counted from the site&apos;s first detection)
          </li>
          <li>
            <Code>ref_match</Code> = site within {t.site_match_radius_m} m of a reference flare
            location
          </li>
          <li>
            <Code>span_days</Code> = last seen − first seen
          </li>
        </ul>
        <p className="mt-2">Rules, applied in order:</p>
        <table className="mt-2 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text)]">
              <th className="py-1 pr-2">Class</th>
              <th className="py-1">Rule</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--border)]">
              <td className="py-1 pr-2">Likely gas flare</td>
              <td>ref_match and persistence ≥ {t.flare_min_persistence}</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <td className="py-1 pr-2">Persistent industrial heat</td>
              <td>
                no ref_match, persistence ≥ {t.industrial_min_persistence} and span ≥{" "}
                {t.industrial_min_span_days} days
              </td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <td className="py-1 pr-2">Transient fire</td>
              <td>
                span &lt; {t.transient_max_span_days} days and persistence &lt;{" "}
                {t.transient_max_persistence}
              </td>
            </tr>
            <tr>
              <td className="py-1 pr-2">Unclassified</td>
              <td>anything else</td>
            </tr>
          </tbody>
        </table>

        <H3Confidence t={t} />

        <H2>Activity changes</H2>
        <p>
          For sites with at least {t.change_min_history_days} days of history, FlareWatch compares
          the mean daily FRP of the last {t.change_recent_days} complete days (<Code>recent</Code>)
          with the mean over the preceding {t.change_baseline_days} days (<Code>baseline</Code>):{" "}
          <Code>z = (recent − baseline) / std(baseline)</Code>, with the standard deviation floored
          at {t.change_min_std_mw} MW. When |z| ≥ {t.change_z_threshold} an &quot;activity
          change detected&quot; event is recorded (at most one per site every{" "}
          {t.change_cooldown_days} days). Days without satellite coverage are excluded rather than
          counted as zero. A persistent site with no detections for {t.inactive_after_days} days is
          marked as having no recent detections, and a site that appeared in the last{" "}
          {t.new_site_window_days} days and was detected on at least{" "}
          {t.new_site_min_observed_days} days is listed as a new persistent heat source.
        </p>
        <p className="mt-2">
          An activity change only describes what the satellite detected. It can reflect weather,
          maintenance, changes in satellite coverage or processing, and says nothing about the
          reasons behind it.
        </p>

        <H2>Known limitations</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Clouds and smoke hide heat sources; cloudy periods look like low activity.</li>
          <li>
            VIIRS pixels are ~375 m, so nearby sources merge and small sources can be missed.
          </li>
          <li>Near-real-time data arrive with ~3 hours latency and are later reprocessed.</li>
          <li>
            Polar-orbiting satellites pass only a few times per day; short events between passes
            are not observed.
          </li>
          <li>
            False positives occur (sun glint, hot surfaces, volcanoes, other industrial heat), and
            the reference list is updated only annually.
          </li>
          <li>FRP is a relative indicator and is not converted to gas volumes or emissions.</li>
        </ul>

        <H2>Attribution</H2>
        <ul className="list-disc space-y-2 pl-5">
          <li>{FIRMS_ATTRIBUTION}</li>
          <li>{ORNL_CITATION}</li>
          <li>Basemap: OpenFreeMap — {BASEMAP_ATTRIBUTION}.</li>
        </ul>

        <H2>Disclaimer</H2>
        <p>{DISCLAIMER}</p>
        <p className="mt-2">
          No advertising, no paid tiers, no tracking. Source code is MIT-licensed.
        </p>
      </article>
    </div>
  );
}

function H3Confidence({ t }: { t: Record<string, number> }) {
  return (
    <>
      <h3 className="mt-6 mb-1 font-semibold text-[var(--text)]">Confidence score (0–1)</h3>
      <p>
        <Code>
          confidence = {t.conf_w_evidence} × evidence + {t.conf_w_obs} × min(1, detections ÷{" "}
          {t.conf_obs_saturation}) + {t.conf_w_ref} × ref_match
        </Code>
      </p>
      <p className="mt-1">
        where <Code>evidence = min(1, persistence ÷ {t.conf_persistence_saturation})</Code> for
        likely flares and persistent industrial heat,{" "}
        <Code>evidence = 1 − persistence ÷ {t.transient_max_persistence}</Code> for transient fires
        and 0 for unclassified sites. Sites without a reference match therefore score at most{" "}
        {(t.conf_w_evidence ?? 0) + (t.conf_w_obs ?? 0)}. Each site panel also shows the number of
        detections and of clear-sky observation days behind the estimate.
      </p>
    </>
  );
}
