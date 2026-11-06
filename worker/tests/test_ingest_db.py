"""M2: running ingest twice inserts no duplicates; every run is logged."""

from flarewatch.firms_client import FirmsError, parse_csv
from flarewatch.ingest import run_nrt

from .conftest import FIXTURES


class FakeClient:
    def __init__(self, fail_sources=()):
        self.fail_sources = set(fail_sources)
        self.text = (FIXTURES / "viirs_sample.csv").read_text()

    def fetch(self, source, bbox, day_range, start=None):
        if source in self.fail_sources:
            raise FirmsError("boom")
        return parse_csv(self.text, source)


def test_run_twice_no_duplicates(db, settings):
    client = FakeClient()
    first = run_nrt(db, client, settings)
    second = run_nrt(db, client, settings)

    assert sum(first.values()) == 4 * len(settings.nrt_sources)
    assert sum(second.values()) == 0
    n = db.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
    assert n == 4 * len(settings.nrt_sources)

    runs = db.execute(
        "SELECT source, status, rows_fetched, rows_inserted, finished_at IS NOT NULL "
        "FROM ingest_runs ORDER BY id"
    ).fetchall()
    assert len(runs) == 2 * len(settings.nrt_sources)
    assert all(r[1] == "success" and r[2] == 4 and r[4] for r in runs)
    assert [r[3] for r in runs[len(settings.nrt_sources) :]] == [0] * len(settings.nrt_sources)


def test_failed_source_is_logged(db, settings):
    bad = settings.nrt_sources[0]
    run_nrt(db, FakeClient(fail_sources=[bad]), settings)
    status, err = db.execute(
        "SELECT status, error FROM ingest_runs WHERE source = %s", (bad,)
    ).fetchone()
    assert status == "error" and "boom" in err


def test_coverage_days_recorded(db, settings):
    run_nrt(db, FakeClient(), settings)
    days = [r[0].isoformat() for r in db.execute("SELECT day FROM coverage_days ORDER BY day")]
    assert days == ["2026-10-30", "2026-10-31"]


class RecordingClient(FakeClient):
    def __init__(self):
        super().__init__()
        self.calls = []

    def fetch(self, source, bbox, day_range, start=None):
        self.calls.append((source, start, day_range))
        return super().fetch(source, bbox, day_range, start)


def test_run_nrt_always_sends_start_date(db, settings):
    from datetime import date

    client = RecordingClient()
    run_nrt(db, client, settings, today=date(2026, 11, 6))
    assert {c[1:] for c in client.calls} == {(date(2026, 11, 5), 2)}
