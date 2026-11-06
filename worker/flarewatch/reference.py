"""Load the ORNL DAAC "Methane Flaring Sites VIIRS" reference list.

The column names in the published files have not been verified from this
environment, so the loader accepts common spellings for latitude, longitude,
year and flare type and reports clearly when it cannot find them. Only
coordinates, year and flare type are stored — no other attributes.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import psycopg

LAT_COLS = ("latitude", "lat", "lat_gmtco", "y")
LON_COLS = ("longitude", "lon", "lng", "long", "lon_gmtco", "x")
YEAR_COLS = ("year", "yr")
TYPE_COLS = ("flr_type", "flare_type", "type", "category")


def _pick(columns: list[str], options: tuple[str, ...]) -> str | None:
    lower = {c.lower().strip(): c for c in columns}
    for opt in options:
        if opt in lower:
            return lower[opt]
    return None


def read_reference_file(path: str | Path, default_year: int | None = None) -> pd.DataFrame:
    """Read a CSV (or Excel) reference file into columns year, lat, lon, flr_type."""
    path = Path(path)
    raw = pd.read_excel(path) if path.suffix.lower() in {".xlsx", ".xls"} else pd.read_csv(path)
    cols = list(raw.columns)
    lat_c, lon_c = _pick(cols, LAT_COLS), _pick(cols, LON_COLS)
    if not lat_c or not lon_c:
        raise ValueError(f"could not find latitude/longitude columns in {path.name}: {cols}")
    year_c, type_c = _pick(cols, YEAR_COLS), _pick(cols, TYPE_COLS)

    df = pd.DataFrame(
        {
            "lat": pd.to_numeric(raw[lat_c], errors="coerce"),
            "lon": pd.to_numeric(raw[lon_c], errors="coerce"),
            "year": pd.to_numeric(raw[year_c], errors="coerce") if year_c else default_year,
            "flr_type": raw[type_c].astype(str) if type_c else None,
        }
    )
    df = df.dropna(subset=["lat", "lon"])
    return df[(df.lat.between(-90, 90)) & (df.lon.between(-180, 180))]


def load_reference(
    conn: psycopg.Connection,
    df: pd.DataFrame,
    bbox: tuple[float, float, float, float] | None = None,
    replace_years: bool = True,
) -> int:
    """Insert reference flares (optionally clipped to bbox). Returns rows inserted."""
    if bbox is not None:
        west, south, east, north = bbox
        df = df[df.lon.between(west, east) & df.lat.between(south, north)]
    rows = [
        (
            None if pd.isna(r.year) else int(r.year),
            float(r.lon),
            float(r.lat),
            None if r.flr_type is None or pd.isna(r.flr_type) else str(r.flr_type),
        )
        for r in df.itertuples(index=False)
    ]
    with conn.cursor() as cur:
        if replace_years:
            years = sorted({y for y, *_ in rows if y is not None})
            if years:
                cur.execute("DELETE FROM reference_flares WHERE year = ANY(%s)", (years,))
        cur.executemany(
            """
            INSERT INTO reference_flares (year, geom, flr_type)
            VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)
            """,
            rows,
        )
    conn.commit()
    return len(rows)
