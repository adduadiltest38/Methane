"""Load country polygons (e.g. Natural Earth Admin 0 GeoJSON) for site labelling."""

from __future__ import annotations

import json
from pathlib import Path

import psycopg

NAME_KEYS = ("NAME", "NAME_EN", "ADMIN", "name", "admin")
ISO_KEYS = ("ISO_A3", "ADM0_A3", "iso_a3")


def load_countries(conn: psycopg.Connection, path: str | Path) -> int:
    data = json.loads(Path(path).read_text())
    rows = []
    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        name = next((props[k] for k in NAME_KEYS if props.get(k)), None)
        iso = next((props[k] for k in ISO_KEYS if props.get(k)), None)
        if name and feat.get("geometry"):
            rows.append((name, iso, json.dumps(feat["geometry"])))
    with conn.cursor() as cur:
        cur.execute("DELETE FROM countries")
        cur.executemany(
            """
            INSERT INTO countries (name, iso3, geom)
            VALUES (%s, %s, ST_Multi(ST_CollectionExtract(
                ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), 3))
                            ::geography)
            """,
            rows,
        )
        cur.execute("UPDATE sites SET country = NULL")
        cur.execute(
            """
            UPDATE sites s SET country = c.name
              FROM countries c WHERE ST_Intersects(c.geom, s.geom)
            """
        )
    conn.commit()
    return len(rows)
