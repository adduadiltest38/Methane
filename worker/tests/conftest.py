from __future__ import annotations

import os
from pathlib import Path

import psycopg
import pytest

from flarewatch.config import Settings

MIGRATIONS = Path(__file__).resolve().parents[2] / "db" / "migrations"
FIXTURES = Path(__file__).parent / "fixtures"
TABLES = (
    "activity_changes, site_daily_stats, detections, sites, reference_flares, "
    "coverage_days, ingest_runs, countries"
)


@pytest.fixture
def settings() -> Settings:
    # Ignore any local .env so tests are deterministic.
    return Settings(_env_file=None, firms_map_key="TESTKEY", request_pause_s=0)


@pytest.fixture(scope="session")
def _db_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set (needs a disposable PostGIS database)")
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        conn.execute("CREATE SCHEMA public")
        for f in sorted(MIGRATIONS.glob("*.sql")):
            conn.execute(f.read_text())
    return url


@pytest.fixture
def db(_db_url):
    with psycopg.connect(_db_url) as conn:
        conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
        conn.commit()
        yield conn
        conn.rollback()
