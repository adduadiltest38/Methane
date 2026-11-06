"""Activity change detection.

For each site with at least ``change_min_history_days`` of history:

* ``recent``   = mean daily FRP (MW) over the last ``change_recent_days`` complete UTC days
* ``baseline`` = mean daily FRP over up to ``change_baseline_days`` days before that window
* ``z``        = (recent - baseline) / max(std(baseline days), change_min_std_mw)

``|z| >= change_z_threshold`` records an ``increase`` / ``decrease`` event, at most
one per site per ``change_cooldown_days``. Days without satellite coverage are
left out of the series instead of being counted as zero.

Also recorded:

* ``inactive`` — a site classified as likely_flare / persistent_industrial with no
  detections for ``inactive_after_days`` (once per quiet period).
* ``new_site`` — a site first seen within ``new_site_window_days`` that has already
  been detected on ``new_site_min_observed_days`` days with persistence of at least
  ``new_site_min_persistence``, and that appeared at least ``new_site_window_days``
  after the start of our data (so the initial backfill doesn't flag everything).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import psycopg

from .config import Settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ChangeSignal:
    direction: str  # increase | decrease
    baseline: float
    recent: float
    z_score: float


def detect_frp_change(
    baseline_values: list[float], recent_values: list[float], s: Settings
) -> ChangeSignal | None:
    """Compare the recent window against the baseline window (pure function)."""
    if len(recent_values) == 0 or len(baseline_values) < 2:
        return None
    base = np.asarray(baseline_values, dtype=float)
    baseline = float(base.mean())
    recent = float(np.mean(recent_values))
    std = max(float(base.std(ddof=1)), s.change_min_std_mw)
    z = (recent - baseline) / std
    if not math.isfinite(z) or abs(z) < s.change_z_threshold:
        return None
    return ChangeSignal(
        direction="increase" if z > 0 else "decrease",
        baseline=round(baseline, 3),
        recent=round(recent, 3),
        z_score=round(z, 3),
    )


def split_series(
    daily_frp: dict[date, float],
    covered_days: list[date],
    end_day: date,
    s: Settings,
) -> tuple[list[float], list[float]]:
    """Build dense (zero-filled) baseline and recent windows over covered days."""
    recent_start = end_day - timedelta(days=s.change_recent_days - 1)
    base_start = recent_start - timedelta(days=s.change_baseline_days)
    baseline, recent = [], []
    for d in covered_days:
        if base_start <= d < recent_start:
            baseline.append(daily_frp.get(d, 0.0))
        elif recent_start <= d <= end_day:
            recent.append(daily_frp.get(d, 0.0))
    return baseline, recent


def _covered_days(cur: psycopg.Cursor, start: date, end: date) -> list[date]:
    cur.execute(
        "SELECT day FROM coverage_days WHERE day BETWEEN %s AND %s ORDER BY day", (start, end)
    )
    days = [r[0] for r in cur.fetchall()]
    if days:
        return days
    # No coverage bookkeeping (e.g. demo data): treat every calendar day as covered.
    n = (end - start).days + 1
    return [start + timedelta(days=i) for i in range(n)]


def detect_changes(
    conn: psycopg.Connection, s: Settings, today: date | None = None
) -> dict[str, int]:
    today = today or date.today()
    end_day = today - timedelta(days=1)  # today's NRT data is still incomplete
    span = s.change_baseline_days + s.change_recent_days
    start_day = end_day - timedelta(days=span)
    counts = {"increase": 0, "decrease": 0, "inactive": 0, "new_site": 0}

    with conn.cursor() as cur:
        covered = _covered_days(cur, start_day, end_day)

        cur.execute(
            """
            SELECT id FROM sites
             WHERE first_seen <= %s::date - %s
               AND last_seen >= %s::date - %s
            """,
            (end_day, s.change_min_history_days, end_day, span),
        )
        site_ids = [r[0] for r in cur.fetchall()]

        cur.execute(
            """
            SELECT site_id, day, frp_sum FROM site_daily_stats
             WHERE site_id = ANY(%s) AND day BETWEEN %s AND %s
            """,
            (site_ids, start_day, end_day),
        )
        series: dict[int, dict[date, float]] = {}
        for site_id, day, frp in cur.fetchall():
            series.setdefault(site_id, {})[day] = float(frp or 0)

        cur.execute(
            """
            SELECT site_id FROM activity_changes
             WHERE direction IN ('increase', 'decrease')
               AND detected_at >= %s::timestamptz - make_interval(days => %s)
            """,
            (today, s.change_cooldown_days),
        )
        cooling = {r[0] for r in cur.fetchall()}

        for site_id in site_ids:
            if site_id in cooling:
                continue
            baseline, recent = split_series(series.get(site_id, {}), covered, end_day, s)
            sig = detect_frp_change(baseline, recent, s)
            if sig is None:
                continue
            cur.execute(
                """
                INSERT INTO activity_changes (site_id, direction, baseline, recent, z_score)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (site_id, sig.direction, sig.baseline, sig.recent, sig.z_score),
            )
            counts[sig.direction] += 1

        # inactive: persistent site gone quiet, one event per quiet period
        cur.execute(
            """
            INSERT INTO activity_changes (site_id, direction, baseline, recent, z_score)
            SELECT s.id, 'inactive',
                   (SELECT AVG(frp_sum) FROM site_daily_stats x
                     WHERE x.site_id = s.id AND x.day >= (s.last_seen)::date - 90),
                   0, NULL
              FROM sites s
             WHERE s.classification IN ('likely_flare', 'persistent_industrial')
               AND s.last_seen < %s::timestamptz - make_interval(days => %s)
               AND NOT EXISTS (SELECT 1 FROM activity_changes a
                                WHERE a.site_id = s.id AND a.direction = 'inactive'
                                  AND a.detected_at > s.last_seen)
            """,
            (today, s.inactive_after_days),
        )
        counts["inactive"] = cur.rowcount

        # new_site: recently appeared and already persistent
        cur.execute(
            """
            INSERT INTO activity_changes (site_id, direction, baseline, recent, z_score)
            SELECT s.id, 'new_site', 0,
                   (SELECT AVG(frp_sum) FROM site_daily_stats x
                     WHERE x.site_id = s.id AND x.day >= %(end)s::date - 6),
                   NULL
              FROM sites s
             WHERE s.first_seen >= %(today)s::timestamptz - make_interval(days => %(win)s)
               AND s.first_seen >= (SELECT MIN(acq_time) FROM detections)
                                   + make_interval(days => %(win)s)
               AND s.observed_days >= %(min_days)s
               AND s.observed_days::real
                   / GREATEST(1, (%(today)s::date - (s.first_seen AT TIME ZONE 'UTC')::date) + 1)
                   >= %(min_pers)s
               AND NOT EXISTS (SELECT 1 FROM activity_changes a
                                WHERE a.site_id = s.id AND a.direction = 'new_site')
            """,
            {
                "today": today,
                "end": end_day,
                "win": s.new_site_window_days,
                "min_days": s.new_site_min_observed_days,
                "min_pers": s.new_site_min_persistence,
            },
        )
        counts["new_site"] = cur.rowcount

    log.info("activity changes: %s", counts)
    return counts
