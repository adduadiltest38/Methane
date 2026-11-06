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


def cluster_points(lat: np.ndarray, lon: np.ndarray, eps_m: float, min_samples: int) -> np.ndarray:
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


def haversine_m(lat1: float, lon1: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    """Great-circle distance in metres from one point to arrays of points."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dlmb = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


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

        # Everything below runs in a fixed number of round trips, however many clusters there
        # are: the worker may sit far from the database (e.g. CI runner vs. hosted Postgres).
        cluster_labels = sorted(set(labels.tolist()) - {-1})
        if not cluster_labels:
            return result
        cents = np.array(
            [
                weighted_centroid(lat[labels == k], lon[labels == k], frp[labels == k])
                for k in cluster_labels
            ]
        )

        # 1) nearest existing site within the match radius, for every centroid at once
        cur.execute(
            """
            SELECT c.k,
                   (SELECT s.id FROM sites s
                     WHERE ST_DWithin(s.geom, c.g, %(r)s)
                     ORDER BY s.geom <-> c.g LIMIT 1)
              FROM (SELECT k, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography AS g
                      FROM unnest(%(k)s::int[], %(lat)s::float8[], %(lon)s::float8[])
                           AS u(k, lat, lon)) c
            """,
            {
                "k": cluster_labels,
                "lat": cents[:, 0].tolist(),
                "lon": cents[:, 1].tolist(),
                "r": settings.site_match_radius_m,
            },
        )
        site_for: dict[int, int] = {k: sid for k, sid in cur.fetchall() if sid is not None}

        # 2) clusters with no existing site: merge ones whose centroids lie within the match
        #    radius of an earlier new cluster, then create one site per remaining cluster
        new_keys = [k for k in cluster_labels if k not in site_for]
        merged_into: dict[int, int] = {}
        leaders: list[int] = []
        for k in new_keys:
            c = cents[cluster_labels.index(k)]
            if leaders:
                lc = cents[[cluster_labels.index(x) for x in leaders]]
                d = haversine_m(c[0], c[1], lc[:, 0], lc[:, 1])
                j = int(np.argmin(d))
                if d[j] <= settings.site_match_radius_m:
                    merged_into[k] = leaders[j]
                    continue
            leaders.append(k)
        if leaders:
            next_n = _next_code_number(cur)
            codes = [format_site_code(next_n + i) for i in range(len(leaders))]
            lc = cents[[cluster_labels.index(x) for x in leaders]]
            cur.execute(
                """
                INSERT INTO sites (code, geom)
                SELECT code, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
                  FROM unnest(%s::text[], %s::float8[], %s::float8[]) AS u(code, lat, lon)
                RETURNING id, code
                """,
                (codes, lc[:, 0].tolist(), lc[:, 1].tolist()),
            )
            by_code = dict((code, sid) for sid, code in cur.fetchall())
            for k, code in zip(leaders, codes, strict=True):
                site_for[k] = by_code[code]
            result.new_sites = len(leaders)
        for k, leader in merged_into.items():
            site_for[k] = site_for[leader]

        # 3) assign all clustered detections in one statement
        mask = labels != -1
        det_ids = ids[mask].tolist()
        det_sites = [site_for[int(k)] for k in labels[mask]]
        cur.execute(
            """
            UPDATE detections d SET site_id = m.site_id
              FROM unnest(%s::bigint[], %s::int[]) AS m(det_id, site_id)
             WHERE d.id = m.det_id
            """,
            (det_ids, det_sites),
        )
        result.clustered_detections = len(det_ids)
        result.touched_site_ids |= set(det_sites)

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
