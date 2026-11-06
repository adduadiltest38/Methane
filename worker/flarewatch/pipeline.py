"""Post-ingest processing: cluster -> geometry -> daily stats -> classify -> changes."""

from __future__ import annotations

import logging
from datetime import date

import psycopg

from .changes import detect_changes
from .classify import classify_sites
from .clustering import cluster_unassigned, refresh_site_geometry
from .config import Settings
from .stats import refresh_daily_stats

log = logging.getLogger(__name__)


def process(conn: psycopg.Connection, s: Settings, today: date | None = None) -> dict:
    cluster = cluster_unassigned(conn, s)
    refresh_site_geometry(conn)
    refresh_daily_stats(conn, since_days=s.cluster_window_days + s.change_recent_days + 30)
    classes = classify_sites(conn, s, today)
    changes = detect_changes(conn, s, today)
    conn.commit()
    return {
        "new_sites": cluster.new_sites,
        "clustered_detections": cluster.clustered_detections,
        "classes": classes,
        "changes": changes,
    }
