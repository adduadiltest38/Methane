"""Rule-based site classification (v1).

Features (over the last ``classify_window_days``):

* ``persistence``  = days with >=1 detection / days with satellite coverage
                     (counted from the later of the window start and first_seen)
* ``night_ratio``  = night detections / all detections
* ``ref_match``    = site within ``site_match_radius_m`` of a reference flare
* ``span_days``    = last_seen - first_seen

Rules, first match wins:

1. ref_match AND persistence >= FLARE_MIN_PERSISTENCE           -> likely_flare
2. NOT ref_match AND persistence >= INDUSTRIAL_MIN_PERSISTENCE
   AND span_days >= INDUSTRIAL_MIN_SPAN_DAYS                    -> persistent_industrial
3. span_days < TRANSIENT_MAX_SPAN_DAYS
   AND persistence < TRANSIENT_MAX_PERSISTENCE                  -> transient_fire
4. otherwise                                                    -> unknown

Confidence (0..1):

    confidence = W_EVIDENCE * evidence + W_OBS * obs_score + W_REF * ref_match

    obs_score = min(1, n_obs / CONF_OBS_SATURATION)
    evidence  = min(1, persistence / CONF_PERSISTENCE_SATURATION)    for flare / industrial
              = 1 - persistence / TRANSIENT_MAX_PERSISTENCE           for transient_fire
              = 0                                                     for unknown

With the default weights (0.4 / 0.3 / 0.3) a reference-matched flare can reach
1.0, while classes without a reference match top out at 0.7.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date

import psycopg

from .config import Settings

log = logging.getLogger(__name__)

LIKELY_FLARE = "likely_flare"
PERSISTENT_INDUSTRIAL = "persistent_industrial"
TRANSIENT_FIRE = "transient_fire"
UNKNOWN = "unknown"
CLASSES = (LIKELY_FLARE, PERSISTENT_INDUSTRIAL, TRANSIENT_FIRE, UNKNOWN)


@dataclass(frozen=True)
class SiteFeatures:
    n_obs: int
    observed_days: int
    coverage_days: int
    night_detections: int
    span_days: float
    ref_match: bool

    @property
    def persistence(self) -> float:
        if self.coverage_days <= 0:
            return 0.0
        return min(1.0, self.observed_days / self.coverage_days)

    @property
    def night_ratio(self) -> float:
        return self.night_detections / self.n_obs if self.n_obs else 0.0


@dataclass(frozen=True)
class Classification:
    label: str
    confidence: float


def classify(f: SiteFeatures, s: Settings) -> Classification:
    p = f.persistence
    if f.ref_match and p >= s.flare_min_persistence:
        label = LIKELY_FLARE
    elif (
        not f.ref_match
        and p >= s.industrial_min_persistence
        and f.span_days >= s.industrial_min_span_days
    ):
        label = PERSISTENT_INDUSTRIAL
    elif f.span_days < s.transient_max_span_days and p < s.transient_max_persistence:
        label = TRANSIENT_FIRE
    else:
        label = UNKNOWN
    return Classification(label, confidence(label, f, s))


def confidence(label: str, f: SiteFeatures, s: Settings) -> float:
    obs_score = min(1.0, f.n_obs / s.conf_obs_saturation) if s.conf_obs_saturation else 1.0
    if label in (LIKELY_FLARE, PERSISTENT_INDUSTRIAL):
        evidence = min(1.0, f.persistence / s.conf_persistence_saturation)
    elif label == TRANSIENT_FIRE:
        evidence = max(0.0, 1.0 - f.persistence / s.transient_max_persistence)
    else:
        evidence = 0.0
    score = s.conf_w_evidence * evidence + s.conf_w_obs * obs_score + s.conf_w_ref * f.ref_match
    return round(min(1.0, max(0.0, score)), 3)


def load_features(conn: psycopg.Connection, s: Settings, today: date | None = None
                  ) -> dict[int, SiteFeatures]:
    """Compute :class:`SiteFeatures` for every site from the database."""
    today = today or date.today()
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM coverage_days")
        has_coverage = cur.fetchone()[0] > 0
        cur.execute(
            """
            WITH win AS (SELECT %(today)s::date - (%(days)s - 1) AS start_day)
            SELECT s.id,
                   COALESCE(SUM(sds.detections), 0)::int,
                   COUNT(sds.day)::int,
                   COALESCE(SUM(sds.night_detections), 0)::int,
                   COALESCE(EXTRACT(EPOCH FROM (s.last_seen - s.first_seen)) / 86400.0, 0),
                   EXISTS (SELECT 1 FROM reference_flares r
                            WHERE ST_DWithin(r.geom, s.geom, %(radius)s)),
                   GREATEST((SELECT start_day FROM win),
                            COALESCE((s.first_seen AT TIME ZONE 'UTC')::date,
                                     (SELECT start_day FROM win))) AS denom_start
              FROM sites s
              LEFT JOIN site_daily_stats sds
                     ON sds.site_id = s.id
                    AND sds.day BETWEEN (SELECT start_day FROM win) AND %(today)s
             GROUP BY s.id
            """,
            {"today": today, "days": s.classify_window_days, "radius": s.site_match_radius_m},
        )
        rows = cur.fetchall()

        cur.execute(
            "SELECT day FROM coverage_days WHERE day BETWEEN %s::date - %s AND %s",
            (today, s.classify_window_days, today),
        )
        covered = sorted(r[0] for r in cur.fetchall())

    out: dict[int, SiteFeatures] = {}
    for site_id, n_obs, obs_days, night, span, ref, denom_start in rows:
        if has_coverage:
            cov = sum(1 for d in covered if denom_start <= d <= today)
        else:
            cov = (today - denom_start).days + 1
        out[site_id] = SiteFeatures(
            n_obs=n_obs,
            observed_days=obs_days,
            coverage_days=max(cov, obs_days, 1),
            night_detections=night,
            span_days=float(span),
            ref_match=bool(ref),
        )
    return out


def classify_sites(conn: psycopg.Connection, s: Settings, today: date | None = None
                   ) -> dict[str, int]:
    feats = load_features(conn, s, today)
    counts = dict.fromkeys(CLASSES, 0)
    rows = []
    for site_id, f in feats.items():
        c = classify(f, s)
        counts[c.label] += 1
        rows.append((c.label, c.confidence, f.ref_match, f.n_obs, f.observed_days, site_id))
    with conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE sites
               SET classification = %s, class_confidence = %s, matches_reference = %s,
                   observation_count = %s, observed_days = %s, updated_at = now()
             WHERE id = %s
            """,
            rows,
        )
    log.info("classification: %s", counts)
    return counts
