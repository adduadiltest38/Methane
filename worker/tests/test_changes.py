"""M5: activity change detection."""

from datetime import UTC, date, datetime, timedelta

import numpy as np

from flarewatch.changes import detect_changes, detect_frp_change, split_series
from flarewatch.clustering import cluster_unassigned, refresh_site_geometry
from flarewatch.firms_client import Detection
from flarewatch.ingest import insert_detections
from flarewatch.stats import refresh_daily_stats


def test_flat_series_no_event(settings):
    assert detect_frp_change([20.0] * 90, [20.0] * 7, settings) is None


def test_noisy_flat_series_no_event(settings):
    rng = np.random.default_rng(3)
    base = list(rng.normal(20, 3, 90))
    recent = list(rng.normal(20, 3, 7))
    assert detect_frp_change(base, recent, settings) is None


def test_spike_triggers_increase(settings):
    rng = np.random.default_rng(4)
    sig = detect_frp_change(list(rng.normal(20, 3, 90)), [60.0] * 7, settings)
    assert sig is not None and sig.direction == "increase" and sig.z_score >= 2.5


def test_drop_triggers_decrease(settings):
    rng = np.random.default_rng(5)
    sig = detect_frp_change(list(rng.normal(40, 3, 90)), [5.0] * 7, settings)
    assert sig is not None and sig.direction == "decrease"


def test_min_std_floor(settings):
    # perfectly flat baseline + tiny wobble shouldn't explode the z-score
    assert detect_frp_change([10.0] * 90, [10.5] * 7, settings) is None


def test_split_series_zero_fills_and_skips_uncovered(settings):
    end = date(2026, 3, 31)
    covered = [end - timedelta(days=i) for i in range(30) if i != 3]
    series = {end: 5.0}
    base, recent = split_series(series, sorted(covered), end, settings)
    assert len(recent) == 6  # one recent day had no satellite coverage
    assert recent[-1] == 5.0 and sum(recent) == 5.0
    assert len(base) == 23


def _site_history(today: date, spike: bool) -> list[Detection]:
    rng = np.random.default_rng(6)
    dets = []
    for k in range(1, 100):
        day = today - timedelta(days=k)
        frp = 60.0 if spike and k <= 7 else float(rng.normal(20, 2))
        t = datetime(day.year, day.month, day.day, 1, tzinfo=UTC)
        for j in range(3):
            dets.append(
                Detection(
                    "TEST",
                    t + timedelta(minutes=j),
                    28.5 + j * 1e-4,
                    49.0,
                    340,
                    300,
                    frp / 3,
                    "n",
                    "N",
                    0.4,
                    0.4,
                )
            )
    return dets


def _run(db, settings, today):
    cluster_unassigned(db, settings)
    refresh_site_geometry(db)
    refresh_daily_stats(db)
    return detect_changes(db, settings, today)


def test_db_spike_creates_exactly_one_increase(db, settings):
    today = date.today()
    insert_detections(db, _site_history(today, spike=True))
    first = _run(db, settings, today)
    again = detect_changes(db, settings, today)  # re-run same day: cooldown

    assert first["increase"] == 1 and first["decrease"] == 0
    assert again["increase"] == 0
    rows = db.execute(
        "SELECT direction, recent, baseline, z_score FROM activity_changes"
    ).fetchall()
    assert len(rows) == 1 and rows[0][0] == "increase" and rows[0][3] >= 2.5


def test_db_flat_series_creates_none(db, settings):
    today = date.today()
    insert_detections(db, _site_history(today, spike=False))
    counts = _run(db, settings, today)
    assert counts == {"increase": 0, "decrease": 0, "inactive": 0, "new_site": 0}


def test_db_inactive_event_once(db, settings):
    today = date.today()
    dets = [
        d
        for d in _site_history(today, spike=False)
        if d.acq_time.date() < today - timedelta(days=40)
    ]
    insert_detections(db, dets)
    cluster_unassigned(db, settings)
    refresh_site_geometry(db)
    refresh_daily_stats(db)
    db.execute("UPDATE sites SET classification = 'persistent_industrial'")
    assert detect_changes(db, settings, today)["inactive"] == 1
    assert detect_changes(db, settings, today)["inactive"] == 0
