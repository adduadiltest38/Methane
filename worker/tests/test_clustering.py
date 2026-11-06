"""M3: clustering & daily stats."""

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from flarewatch.clustering import (
    cluster_points,
    cluster_unassigned,
    format_site_code,
    refresh_site_geometry,
    weighted_centroid,
)
from flarewatch.firms_client import Detection
from flarewatch.ingest import insert_detections
from flarewatch.stats import refresh_daily_stats

CENTRES = [(29.0, 48.0), (26.5, 50.2), (31.2, 47.4)]


def _synthetic(rng, n_per_group=8, n_noise=15, spread_deg=0.001):
    lat, lon = [], []
    for c_lat, c_lon in CENTRES:
        lat += list(rng.normal(c_lat, spread_deg, n_per_group))
        lon += list(rng.normal(c_lon, spread_deg, n_per_group))
    # noise: isolated points, each far from everything else
    lat += list(rng.uniform(13, 37, n_noise))
    lon += list(rng.uniform(35, 62, n_noise))
    return np.array(lat), np.array(lon)


def test_three_groups_plus_noise_gives_three_clusters():
    rng = np.random.default_rng(0)
    lat, lon = _synthetic(rng)
    labels = cluster_points(lat, lon, eps_m=500, min_samples=3)
    assert len(set(labels) - {-1}) == 3
    assert (labels[24:] == -1).all()


def test_weighted_centroid():
    lat = np.array([0.0, 1.0])
    lon = np.array([0.0, 1.0])
    assert weighted_centroid(lat, lon, np.array([3.0, 1.0])) == (0.25, 0.25)
    assert weighted_centroid(lat, lon, np.array([0.0, np.nan])) == (0.5, 0.5)


def test_site_code_format():
    assert format_site_code(1) == "FW-0001"
    assert format_site_code(12345) == "FW-12345"


def _dets(lat, lon, when, frp=10.0, night=True):
    return [
        Detection(
            "TEST",
            when + timedelta(minutes=i),
            float(a),
            float(o),
            330,
            300,
            frp,
            "n",
            "N" if night else "D",
            0.4,
            0.4,
        )
        for i, (a, o) in enumerate(zip(lat, lon, strict=True))
    ]


def test_db_clusters_and_reassigns_to_existing_sites(db, settings):
    rng = np.random.default_rng(1)
    lat, lon = _synthetic(rng)
    t0 = datetime.now(UTC) - timedelta(days=5)
    insert_detections(db, _dets(lat, lon, t0))

    res = cluster_unassigned(db, settings)
    refresh_site_geometry(db)
    assert res.new_sites == 3
    codes = [r[0] for r in db.execute("SELECT code FROM sites ORDER BY code")]
    assert codes == ["FW-0001", "FW-0002", "FW-0003"]

    # second batch: new detections at the same locations (plus a tight new group of 3
    # within 750 m of an existing site but offset ~400 m) -> no new sites
    lat2, lon2 = _synthetic(np.random.default_rng(2), n_noise=0)
    lat2 = np.append(lat2, [29.0036, 29.0037, 29.0035])
    lon2 = np.append(lon2, [48.0, 48.0001, 47.9999])
    insert_detections(db, _dets(lat2, lon2, t0 + timedelta(days=1)))
    res2 = cluster_unassigned(db, settings)
    refresh_site_geometry(db)

    assert res2.new_sites == 0
    assert db.execute("SELECT COUNT(*) FROM sites").fetchone()[0] == 3
    unassigned_near = db.execute(
        "SELECT COUNT(*) FROM detections WHERE site_id IS NULL AND acq_time > %s",
        (t0 + timedelta(hours=12),),
    ).fetchone()[0]
    assert unassigned_near == 0


def test_low_confidence_excluded(db, settings):
    t0 = datetime.now(UTC) - timedelta(days=1)
    dets = [
        Detection(
            "TEST",
            t0 + timedelta(minutes=i),
            29.0 + i * 1e-4,
            48.0,
            330,
            300,
            5,
            "l",
            "N",
            0.4,
            0.4,
        )
        for i in range(5)
    ]
    insert_detections(db, dets)
    assert cluster_unassigned(db, settings).new_sites == 0


def test_daily_stats(db, settings):
    day = datetime.now(UTC).replace(hour=1, minute=0, second=0, microsecond=0) - timedelta(days=2)
    lat = np.array([29.0, 29.0001, 29.0002, 29.0001])
    lon = np.array([48.0, 48.0001, 48.0, 48.0002])
    dets = _dets(lat[:3], lon[:3], day, frp=10.0, night=True)
    dets += _dets(lat[3:], lon[3:], day + timedelta(hours=10), frp=4.0, night=False)
    insert_detections(db, dets)
    cluster_unassigned(db, settings)
    refresh_daily_stats(db)
    row = db.execute(
        "SELECT day, detections, night_detections, frp_sum, frp_max FROM site_daily_stats"
    ).fetchall()
    assert len(row) == 1
    _, n, night, frp_sum, frp_max = row[0]
    assert (n, night, frp_sum, frp_max) == (4, 3, 34.0, 10.0)


def test_haversine_m():
    from flarewatch.clustering import haversine_m

    d = haversine_m(0.0, 0.0, np.array([0.0, 1.0]), np.array([1.0, 0.0]))
    assert d == pytest.approx([111_195, 111_195], rel=1e-3)


def test_many_clusters_in_one_pass(db, settings):
    # 200 well-separated groups -> 200 sites with sequential codes, all detections assigned
    rng = np.random.default_rng(9)
    t0 = datetime.now(UTC) - timedelta(days=3)
    dets = []
    for g in range(200):
        c_lat, c_lon = 14 + (g // 20) * 2.0, 36 + (g % 20) * 1.2
        lat = rng.normal(c_lat, 0.0008, 4)
        lon = rng.normal(c_lon, 0.0008, 4)
        dets += _dets(lat, lon, t0 + timedelta(hours=g))
    insert_detections(db, dets)
    res = cluster_unassigned(db, settings)
    assert res.new_sites == 200 and res.clustered_detections == 800
    codes = [r[0] for r in db.execute("SELECT code FROM sites ORDER BY id")]
    assert codes[0] == "FW-0001" and codes[-1] == "FW-0200"
    assert db.execute("SELECT COUNT(*) FROM detections WHERE site_id IS NULL").fetchone()[0] == 0


def test_nearby_new_clusters_merge_into_one_site(db, settings):
    # two tight groups ~600 m apart: separate DBSCAN clusters (eps 500 m) but one site (750 m)
    t0 = datetime.now(UTC) - timedelta(days=1)
    a = _dets(np.full(4, 29.0) + np.arange(4) * 1e-5, np.full(4, 48.0), t0)
    b = _dets(np.full(4, 29.0054) + np.arange(4) * 1e-5, np.full(4, 48.0), t0 + timedelta(hours=1))
    insert_detections(db, a + b)
    res = cluster_unassigned(db, settings)
    assert res.new_sites == 1
    assert res.clustered_detections == 8


def test_grid_clustering_matches_raw_dbscan():
    rng = np.random.default_rng(3)
    lat, lon = _synthetic(rng, n_per_group=30)
    raw = cluster_points(lat, lon, eps_m=500, min_samples=3, grid_deg=0)
    grid = cluster_points(lat, lon, eps_m=500, min_samples=3)
    # same partition (label ids may differ)
    assert len(set(raw) - {-1}) == len(set(grid) - {-1}) == 3
    assert ((raw == -1) == (grid == -1)).all()
    for k in set(raw) - {-1}:
        assert len(set(grid[raw == k])) == 1


def test_dense_site_is_one_cluster_and_weights_count_detections():
    rng = np.random.default_rng(4)
    # 5000 detections at one flare (dense) -> one cluster
    lat = rng.normal(27.0, 0.001, 5000)
    lon = rng.normal(50.0, 0.001, 5000)
    labels = cluster_points(lat, lon, eps_m=500, min_samples=3)
    assert set(labels) == {0}
    # 3 detections snapped into the same grid cell still satisfy min_samples=3
    same = cluster_points(np.array([27.0, 27.0001, 27.0002]), np.array([50.0] * 3), 500, 3)
    assert set(same) == {0}


def test_cluster_centroids_match_weighted_centroid():
    from flarewatch.clustering import cluster_centroids

    rng = np.random.default_rng(5)
    labels = rng.integers(-1, 50, 5000)
    lat, lon = rng.uniform(12, 38, 5000), rng.uniform(34, 63, 5000)
    frp = rng.uniform(0, 20, 5000)
    frp[labels == 7] = 0  # all-zero FRP -> unweighted mean
    got = cluster_centroids(labels, lat, lon, frp)
    for k in range(50):
        m = labels == k
        assert got[k] == pytest.approx(weighted_centroid(lat[m], lon[m], frp[m]))


def test_thousands_of_clusters_are_fast(db, settings):
    import time

    rng = np.random.default_rng(6)
    t0 = datetime.now(UTC) - timedelta(days=2)
    dets = []
    for g in range(3000):  # 3000 separate groups, ~11 km apart
        c_lat, c_lon = 13 + (g // 60) * 0.1, 35 + (g % 60) * 0.1
        dets += _dets(
            rng.normal(c_lat, 5e-4, 3), rng.normal(c_lon, 5e-4, 3), t0 + timedelta(minutes=g * 5)
        )
    insert_detections(db, dets)
    start = time.time()
    res = cluster_unassigned(db, settings)
    assert res.new_sites == 3000
    assert time.time() - start < 30
