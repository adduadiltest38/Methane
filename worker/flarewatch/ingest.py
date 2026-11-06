"""Insert detections and log ingest runs."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterable, Sequence
from datetime import date, timedelta

import psycopg

from .config import Settings
from .firms_client import Detection, FirmsClient, FirmsError, date_chunks

log = logging.getLogger(__name__)


def insert_detections(conn: psycopg.Connection, detections: Sequence[Detection]) -> int:
    """Insert detections, skipping duplicates. Returns the number of new rows."""
    if not detections:
        return 0
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TEMP TABLE IF NOT EXISTS _det_stage (
              source TEXT, acq_time TIMESTAMPTZ, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
              bright_ti4 REAL, bright_ti5 REAL, frp REAL, confidence TEXT, daynight TEXT,
              scan REAL, track REAL
            ) ON COMMIT DROP
            """
        )
        cur.execute("TRUNCATE _det_stage")
        with cur.copy(
            "COPY _det_stage (source, acq_time, lat, lon, bright_ti4, bright_ti5, frp, "
            "confidence, daynight, scan, track) FROM STDIN"
        ) as copy:
            for d in detections:
                copy.write_row(
                    (
                        d.source,
                        d.acq_time,
                        d.latitude,
                        d.longitude,
                        d.bright_ti4,
                        d.bright_ti5,
                        d.frp,
                        d.confidence,
                        d.daynight,
                        d.scan,
                        d.track,
                    )
                )
        cur.execute(
            """
            INSERT INTO detections (source, acq_time, geom, bright_ti4, bright_ti5, frp,
                                    confidence, daynight, scan, track)
            SELECT DISTINCT ON (source, acq_time, lat, lon)
                   source, acq_time,
                   ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
                   bright_ti4, bright_ti5, frp, confidence, daynight, scan, track
            FROM _det_stage
            ON CONFLICT (source, acq_time, geom) DO NOTHING
            """
        )
        inserted = cur.rowcount
    return max(inserted, 0)


def mark_coverage(conn: psycopg.Connection, source: str, days: Iterable[date]) -> None:
    """Record that ``source`` delivered data for each day (persistence denominator)."""
    rows = [(d, source) for d in sorted(set(days))]
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO coverage_days (day, sources) VALUES (%s, ARRAY[%s])
            ON CONFLICT (day) DO UPDATE
              SET sources = (SELECT ARRAY(SELECT DISTINCT unnest(coverage_days.sources
                                                                 || EXCLUDED.sources)))
            """,
            rows,
        )


def _start_run(conn: psycopg.Connection, source: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingest_runs (source, status) VALUES (%s, 'running') RETURNING id",
            (source,),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    return run_id


def _finish_run(
    conn: psycopg.Connection,
    run_id: int,
    fetched: int,
    inserted: int,
    error: str | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE ingest_runs
               SET finished_at = now(), rows_fetched = %s, rows_inserted = %s,
                   status = %s, error = %s
             WHERE id = %s
            """,
            (fetched, inserted, "error" if error else "success", error, run_id),
        )
    conn.commit()


def ingest_source(
    conn: psycopg.Connection,
    client: FirmsClient,
    source: str,
    bbox: str,
    chunks: Iterable[tuple[date | None, int]],
    pause_s: float = 0.0,
) -> tuple[int, int]:
    """Fetch and insert one source over a set of (start, day_range) chunks.

    Each source gets one ``ingest_runs`` row. Returns (fetched, inserted).
    """
    run_id = _start_run(conn, source)
    fetched = inserted = 0
    try:
        for i, (start, n_days) in enumerate(chunks):
            if i and pause_s:
                time.sleep(pause_s)
            dets = client.fetch(source, bbox, n_days, start)
            fetched += len(dets)
            inserted += insert_detections(conn, dets)
            mark_coverage(conn, source, (d.acq_time.date() for d in dets))
            conn.commit()
            log.info("%s %s+%dd: fetched=%d", source, start or "latest", n_days, len(dets))
    except (FirmsError, psycopg.Error) as exc:
        conn.rollback()
        _finish_run(conn, run_id, fetched, inserted, error=str(exc)[:2000])
        raise
    _finish_run(conn, run_id, fetched, inserted)
    return fetched, inserted


def run_nrt(conn: psycopg.Connection, client: FirmsClient, settings: Settings) -> dict[str, int]:
    """Fetch the most recent ``nrt_day_range`` days for every NRT source."""
    results: dict[str, int] = {}
    errors: list[str] = []
    for source in settings.nrt_sources:
        try:
            _, inserted = ingest_source(
                conn, client, source, settings.bbox_str, [(None, settings.nrt_day_range)]
            )
            results[source] = inserted
        except (FirmsError, psycopg.Error) as exc:
            log.error("ingest failed for %s: %s", source, exc)
            errors.append(f"{source}: {exc}")
        time.sleep(settings.request_pause_s)
    if len(errors) == len(settings.nrt_sources):
        raise FirmsError("all NRT sources failed: " + "; ".join(errors))
    return results


def backfill(
    conn: psycopg.Connection,
    client: FirmsClient,
    settings: Settings,
    days: int,
    end: date | None = None,
    sources: Sequence[str] | None = None,
) -> dict[str, int]:
    """Pull ``days`` days of Standard Processing data in FIRMS-sized chunks."""
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    chunks = list(date_chunks(start, end, settings.firms_max_day_range))
    results: dict[str, int] = {}
    for source in sources or settings.sp_sources:
        _, inserted = ingest_source(
            conn, client, source, settings.bbox_str, chunks, pause_s=settings.request_pause_s
        )
        results[source] = inserted
    return results
