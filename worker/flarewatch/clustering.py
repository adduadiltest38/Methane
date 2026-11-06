"""Cluster detections into persistent sites.

Two passes over unassigned, non-low-confidence detections from the last
``cluster_window_days``:

1. Any detection within ``site_match_radius_m`` of an existing site is attached
   to the nearest site (so repeat detections never spawn duplicate sites).
2. The remainder are clustered with DBSCAN (haversine metric). A cluster whose
   centroid falls within ``site_match_radius_m`` of an existing site joins that
   site; otherwise a new site ``FW-XXXX`` is created.

Site centroids are then recomputed as the FRP-weighted mean of their detections.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import psycopg
from sklearn.cluster import DBSCAN

from .config import Settings

log = logging.getLogger(__name__)

EARTH_RADIUS_M = 6_371_008.8


def cluster_points(
    lat: np.ndarray, lon: np.ndarray, eps_m: float, min_samples: int
) -> np.ndarray:
    """Run DBSCAN with a haversine metric. Returns labels (-1 = noise)."""
    if len(lat) == 0:
        return np.empty(0, dtype=int)
    coords = np.radians(np.column_stack([lat, lon]))
    model = DBSCAN(
        eps=eps_m / EARTH_RADIUS_M,
        min_samples=min_samples,
        metric="haversine",
        algorithm="ball_tree",
    )
    return model.fit_predict(coords)


def weighted_centroid(lat: np.ndarray, lon: np.ndarray, frp: np.ndarray) -> tuple[float, float]:
    """FRP-weighted mean position (falls back to unweighted when FRP is missing/zero)."""
    w = np.nan_to_num(np.asarray(frp, dtype=float), nan=0.0).clip(min=0)
    if w.sum() <= 0:
        w = np.ones_like(w)
    return float(np.average(lat, weights=w)), float(np.average(lon, weights=w))


def format_site_code(n: int) -> str:
    return f"FW-{n:04d}"


@dataclass
class ClusterResult:
    attached_to_existing: int = 0
    new_sites: int = 0
    clustered_detections: int = 0
    touched_site_ids: set[int] | None = None


def _next_code_number(cur: psycopg.Cursor) -> int:
    cur.execute(
        "SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) FROM sites"
    )
    return cur.fetchone()[0] + 1


def assign_to_existing_sites(conn: psycopg.Connection, settings: Settings) -> set[int]:
    """Pass 1: attach unassigned detections near an existing site to the nearest site."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE detections d
               SET site_id = nearest.site_id
              FROM (
                SELECT d2.id AS det_id,
                       (SELECT s.id FROM sites s
                         WHERE ST_DWithin(s.geom, d2.geom, %(r)s)
                         ORDER BY s.geom <-> d2.geom
                         LIMIT 1) AS site_id
                  FROM detections d2
                 WHERE d2.site_id IS NULL
                   AND d2.acq_time >= now() - make_interval(days => %(days)s)
                   AND d2.confidence = ANY(%(conf)s)
              ) nearest
             WHERE d.id = nearest.det_id AND nearest.site_id IS NOT NULL
            RETURNING d.site_id
            """,
            {
                "r": settings.site_match_radius_m,
                "days": settings.cluster_window_days,
                "conf": list(settings.cluster_confidences),
            },
        )
        return {r[0] for r in cur.fetchall()}


def cluster_unassigned(conn: psycopg.Connection, settings: Settings) -> ClusterResult:
    result = ClusterResult(touched_site_ids=set())
    result.touched_site_ids |= assign_to_existing_sites(conn, settings)
    result.attached_to_existing = len(result.touched_site_ids)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, ST_Y(geom::geometry), ST_X(geom::geometry), COALESCE(frp, 0)
              FROM detections
             WHERE site_id IS NULL
               AND acq_time >= now() - make_interval(days => %s)
               AND confidence = ANY(%s)
            """,
            (settings.cluster_window_days, list(settings.cluster_confidences)),
        )
        rows = cur.fetchall()
        if not rows:
            return result

        ids = np.array([r[0] for r in rows])
        lat = np.array([r[1] for r in rows], dtype=float)
        lon = np.array([r[2] for r in rows], dtype=float)
        frp = np.array([r[3] for r in rows], dtype=float)
        labels = cluster_points(lat, lon, settings.dbscan_eps_m, settings.dbscan_min_samples)

        next_n = _next_code_number(cur)
        for label in sorted(set(labels.tolist()) - {-1}):
            mask = labels == label
            c_lat, c_lon = weighted_centroid(lat[mask], lon[mask], frp[mask])
            cur.execute(
                """
                SELECT id FROM sites
                 WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
                                  %(r)s)
                 ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography
                 LIMIT 1
                """,
                {"lat": c_lat, "lon": c_lon, "r": settings.site_match_radius_m},
            )
            hit = cur.fetchone()
            if hit:
                site_id = hit[0]
            else:
                cur.execute(
                    """
                    INSERT INTO sites (code, geom)
                    VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)
                    RETURNING id
                    """,
                    (format_site_code(next_n), c_lon, c_lat),
                )
                site_id = cur.fetchone()[0]
                next_n += 1
                result.new_sites += 1
            cur.execute(
                "UPDATE detections SET site_id = %s WHERE id = ANY(%s)",
                (site_id, ids[mask].tolist()),
            )
            result.clustered_detections += int(mask.sum())
            result.touched_site_ids.add(site_id)

    log.info(
        "clustering: %d new sites, %d detections clustered, %d sites touched",
        result.new_sites,
        result.clustered_detections,
        len(result.touched_site_ids),
    )
    return result


def refresh_site_geometry(conn: psycopg.Connection) -> None:
    """Recompute FRP-weighted centroid, first/last seen and country for every site."""
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH agg AS (
              SELECT site_id,
                     SUM(w) AS w, SUM(w * y) AS wy, SUM(w * x) AS wx,
                     AVG(y) AS ay, AVG(x) AS ax,
                     MIN(acq_time) AS first_seen, MAX(acq_time) AS last_seen
                FROM (SELECT site_id, acq_time,
                             GREATEST(COALESCE(frp, 0), 0) AS w,
                             ST_Y(geom::geometry) AS y, ST_X(geom::geometry) AS x
                        FROM detections
                       WHERE site_id IS NOT NULL) d
               GROUP BY site_id
            )
            UPDATE sites s
               SET geom = ST_SetSRID(ST_MakePoint(
                            CASE WHEN agg.w > 0 THEN agg.wx / agg.w ELSE agg.ax END,
                            CASE WHEN agg.w > 0 THEN agg.wy / agg.w ELSE agg.ay END),
                          4326)::geography,
                   first_seen = agg.first_seen,
                   last_seen = agg.last_seen,
                   updated_at = now()
              FROM agg
             WHERE agg.site_id = s.id
            """
        )
        cur.execute(
            """
            UPDATE sites s
               SET country = c.name
              FROM countries c
             WHERE s.country IS DISTINCT FROM c.name
               AND ST_Intersects(c.geom, s.geom)
            """
        )
