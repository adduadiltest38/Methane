"""Synthetic demo data so the app can be run locally without a FIRMS key.

Everything generated here is fake: it is tagged with source ``DEMO_SYNTHETIC``
and the web app shows a "synthetic demo data" banner whenever it is present.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import numpy as np
import psycopg

from .config import Settings
from .firms_client import Detection
from .ingest import insert_detections, mark_coverage

DEMO_SOURCE = "DEMO_SYNTHETIC"


def _det(rng, lat, lon, day: date, frp: float, night: bool) -> Detection:
    jitter = rng.normal(0, 0.0012, 2)  # ~130 m
    hour = int(rng.choice([22, 23, 0, 1])) if night else int(rng.choice([9, 10, 11]))
    return Detection(
        source=DEMO_SOURCE,
        acq_time=datetime(day.year, day.month, day.day, hour, int(rng.integers(0, 60)), tzinfo=UTC),
        latitude=float(lat + jitter[0]),
        longitude=float(lon + jitter[1]),
        bright_ti4=float(rng.uniform(300, 367)),
        bright_ti5=float(rng.uniform(280, 320)),
        frp=float(max(0.3, frp)),
        confidence=str(rng.choice(["n", "h"], p=[0.6, 0.4])),
        daynight="N" if night else "D",
        scan=0.4,
        track=0.4,
    )


def generate(
    s: Settings,
    days: int = 120,
    seed: int = 7,
    today: date | None = None,
    land_points: list[tuple[float, float]] | None = None,
) -> tuple[list[Detection], list[tuple[float, float]]]:
    """Return (detections, reference_points).

    ``land_points`` is an optional pool of (lat, lon) candidates known to be on land; when
    given, synthetic sites are drawn from it instead of anywhere in the bbox.
    """
    rng = np.random.default_rng(seed)
    today = today or date.today()
    start = today - timedelta(days=days)
    west, south, east, north = s.region_bbox
    dets: list[Detection] = []
    refs: list[tuple[float, float]] = []

    pool = list(land_points or [])
    rng.shuffle(pool)

    def rand_point():
        if pool:
            return pool.pop()
        return float(rng.uniform(south + 2, north - 2)), float(rng.uniform(west + 3, east - 3))

    # flare-like: persistent, mostly night, reference-matched
    for i in range(30):
        lat, lon = rand_point()
        refs.append((lat, lon))
        level = rng.uniform(5, 40)
        p_detect = rng.uniform(0.35, 0.8)
        for k in range(days):
            day = start + timedelta(days=k)
            frp = level
            if i == 0 and k >= days - 7:  # recent increase
                frp = level * 3
            if i == 1 and k >= days - 40:  # gone quiet
                continue
            spiking = i == 0 and k >= days - 7
            if spiking or rng.random() < p_detect:
                dets.append(_det(rng, lat, lon, day, rng.normal(frp, level * 0.15), True))

    # persistent industrial: no reference match, day and night
    for _ in range(10):
        lat, lon = rand_point()
        level = rng.uniform(3, 15)
        for k in range(days):
            if rng.random() < 0.45:
                dets.append(
                    _det(
                        rng,
                        lat,
                        lon,
                        start + timedelta(days=k),
                        rng.normal(level, 2),
                        bool(rng.random() < 0.5),
                    )
                )

    # transient fires: a few days, day-time
    for _ in range(20):
        lat, lon = rand_point()
        k0 = int(rng.integers(0, days - 5))
        for k in range(k0, k0 + int(rng.integers(1, 4))):
            for _ in range(int(rng.integers(3, 8))):
                dets.append(
                    _det(rng, lat, lon, start + timedelta(days=k), rng.uniform(2, 30), False)
                )

    # a brand-new persistent site
    lat, lon = rand_point()
    refs.append((lat, lon))
    for k in range(days - 14, days):
        dets.append(_det(rng, lat, lon, start + timedelta(days=k), rng.normal(12, 2), True))

    # scattered noise
    for _ in range(300):
        lat, lon = rand_point()
        dets.append(
            _det(
                rng,
                lat,
                lon,
                start + timedelta(days=int(rng.integers(0, days))),
                rng.uniform(1, 5),
                bool(rng.random() < 0.5),
            )
        )
    return dets, refs


def _land_pool(conn: psycopg.Connection, s: Settings, n: int = 3000) -> list[tuple[float, float]]:
    """Random points inside the bbox that fall on land, if country polygons are loaded."""
    west, south, east, north = s.region_bbox
    rng = np.random.default_rng(11)
    lats = rng.uniform(south, north, n).tolist()
    lons = rng.uniform(west, east, n).tolist()
    rows = conn.execute(
        """
        SELECT p.lat, p.lon
          FROM unnest(%s::float8[], %s::float8[]) AS p(lat, lon)
         WHERE EXISTS (SELECT 1 FROM countries c
                        WHERE ST_Intersects(c.geom,
                              ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)::geography))
        """,
        (lats, lons),
    ).fetchall()
    return [(float(a), float(b)) for a, b in rows]


def seed(conn: psycopg.Connection, s: Settings, days: int = 120) -> int:
    dets, refs = generate(s, days, land_points=_land_pool(conn, s))
    inserted = insert_detections(conn, dets)
    mark_coverage(conn, DEMO_SOURCE, (d.acq_time.date() for d in dets))
    with conn.cursor() as cur:
        cur.execute("DELETE FROM reference_flares WHERE flr_type = 'demo'")
        cur.executemany(
            "INSERT INTO reference_flares (year, geom, flr_type) "
            "VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 'demo')",
            [(date.today().year, lon, lat) for lat, lon in refs],
        )
        cur.execute(
            "INSERT INTO ingest_runs (source, finished_at, rows_fetched, rows_inserted, status) "
            "VALUES (%s, now(), %s, %s, 'success')",
            (DEMO_SOURCE, len(dets), inserted),
        )
    conn.commit()
    return inserted
