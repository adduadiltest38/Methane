"""M4: one test per classification rule, thresholds from config."""

from datetime import UTC, date, datetime, timedelta

import pytest

from flarewatch.classify import (
    LIKELY_FLARE,
    PERSISTENT_INDUSTRIAL,
    TRANSIENT_FIRE,
    UNKNOWN,
    SiteFeatures,
    classify,
    classify_sites,
)
from flarewatch.clustering import cluster_unassigned, refresh_site_geometry
from flarewatch.config import Settings
from flarewatch.firms_client import Detection
from flarewatch.ingest import insert_detections
from flarewatch.reference import load_reference, read_reference_file
from flarewatch.stats import refresh_daily_stats

from .conftest import FIXTURES


def feats(observed, coverage=90, span=80.0, ref=False, n_obs=None, night=0):
    return SiteFeatures(
        n_obs=n_obs if n_obs is not None else observed,
        observed_days=observed,
        coverage_days=coverage,
        night_detections=night,
        span_days=span,
        ref_match=ref,
    )


def test_likely_flare_rule(settings):
    c = classify(feats(observed=18, ref=True), settings)  # persistence 0.2
    assert c.label == LIKELY_FLARE
    assert c.confidence > classify(feats(observed=18), settings).confidence


def test_ref_match_but_too_sparse_is_not_flare(settings):
    c = classify(feats(observed=17, ref=True), settings)  # persistence < 0.2
    assert c.label != LIKELY_FLARE


def test_persistent_industrial_rule(settings):
    c = classify(feats(observed=27, span=30), settings)  # persistence 0.3, span 30
    assert c.label == PERSISTENT_INDUSTRIAL
    assert c.confidence <= settings.conf_w_evidence + settings.conf_w_obs  # no ref bonus


def test_industrial_needs_span(settings):
    assert classify(feats(observed=27, span=29.9), settings).label == UNKNOWN


def test_transient_fire_rule(settings):
    c = classify(feats(observed=2, coverage=60, span=3), settings)  # persistence 0.033
    assert c.label == TRANSIENT_FIRE
    assert 0 < c.confidence <= 0.7


def test_short_but_persistent_is_unknown(settings):
    # seen every day for 5 days: too short for industrial, too persistent for transient
    assert classify(feats(observed=5, coverage=5, span=4), settings).label == UNKNOWN


def test_thresholds_come_from_config():
    s = Settings(_env_file=None, flare_min_persistence=0.5)
    assert classify(feats(observed=18, ref=True), s).label != LIKELY_FLARE
    s2 = Settings(_env_file=None, industrial_min_span_days=10)
    assert classify(feats(observed=27, span=12), s2).label == PERSISTENT_INDUSTRIAL


def test_threshold_env_override(monkeypatch):
    monkeypatch.setenv("FLARE_MIN_PERSISTENCE", "0.6")
    monkeypatch.setenv("DBSCAN_EPS_M", "400")
    s = Settings(_env_file=None)
    assert s.flare_min_persistence == 0.6
    assert s.dbscan_eps_m == 400


@pytest.mark.parametrize("label", [LIKELY_FLARE, PERSISTENT_INDUSTRIAL, TRANSIENT_FIRE, UNKNOWN])
def test_confidence_in_unit_interval(settings, label):
    for f in [feats(0, coverage=1, span=0), feats(90, n_obs=500, ref=True)]:
        from flarewatch.classify import confidence

        assert 0.0 <= confidence(label, f, settings) <= 1.0


def test_persistence_bounded():
    assert feats(observed=10, coverage=5).persistence == 1.0
    assert feats(observed=0, coverage=0).persistence == 0.0


def test_read_reference_file_flexible_columns():
    df = read_reference_file(FIXTURES / "reference_sample.csv")
    assert list(df.columns) == ["lat", "lon", "year", "flr_type"]
    assert len(df) == 3


def test_classify_sites_in_db(db, settings):
    load_reference(db, read_reference_file(FIXTURES / "reference_sample.csv"),
                   bbox=settings.region_bbox)
    assert db.execute("SELECT COUNT(*) FROM reference_flares").fetchone()[0] == 2

    today = date.today()
    dets = []
    for k in range(40):  # every other day for 80 days at a reference location
        t = datetime(today.year, today.month, today.day, 1, tzinfo=UTC) - timedelta(days=2 * k)
        for j in range(2):
            dets.append(Detection("TEST", t + timedelta(minutes=j), 29.3764, 47.6495 + j * 1e-4,
                                  340, 300, 12.0, "n", "N", 0.4, 0.4))
    insert_detections(db, dets)
    cluster_unassigned(db, settings)
    refresh_site_geometry(db)
    refresh_daily_stats(db)
    counts = classify_sites(db, settings, today)
    assert counts[LIKELY_FLARE] == 1
    row = db.execute(
        "SELECT classification, matches_reference, observation_count, class_confidence FROM sites"
    ).fetchone()
    assert row[0] == LIKELY_FLARE and row[1] is True and row[2] > 0 and row[3] > 0.7
