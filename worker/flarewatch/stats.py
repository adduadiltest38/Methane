"""Per-site daily aggregates."""

from __future__ import annotations

import psycopg


def refresh_daily_stats(conn: psycopg.Connection, since_days: int = 120) -> int:
    """Rebuild ``site_daily_stats`` for UTC days in the last ``since_days`` days."""
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM site_daily_stats
             WHERE day >= (now() AT TIME ZONE 'UTC')::date - %s
            """,
            (since_days,),
        )
        cur.execute(
            """
            INSERT INTO site_daily_stats (site_id, day, detections, night_detections,
                                          frp_sum, frp_max)
            SELECT site_id,
                   (acq_time AT TIME ZONE 'UTC')::date AS day,
                   COUNT(*),
                   COUNT(*) FILTER (WHERE daynight = 'N'),
                   COALESCE(SUM(frp), 0),
                   COALESCE(MAX(frp), 0)
              FROM detections
             WHERE site_id IS NOT NULL
               AND (acq_time AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date - %s
             GROUP BY site_id, day
            """,
            (since_days,),
        )
        return cur.rowcount
