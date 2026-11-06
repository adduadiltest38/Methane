from datetime import date

from flarewatch.ingest import backfill


class RecordingClient:
    def __init__(self):
        self.calls = []

    def fetch(self, source, bbox, day_range, start=None):
        self.calls.append((source, start, day_range))
        return []


def test_backfill_defaults_to_nrt_sources_in_chunks(db, settings):
    client = RecordingClient()
    backfill(db, client, settings, days=12, end=date(2026, 3, 12))
    sources = {c[0] for c in client.calls}
    assert sources == set(settings.nrt_sources)
    per_source = [c[1:] for c in client.calls if c[0] == settings.nrt_sources[0]]
    assert per_source == [(date(2026, 3, 1), 5), (date(2026, 3, 6), 5), (date(2026, 3, 11), 2)]
    runs = db.execute("SELECT COUNT(*) FROM ingest_runs WHERE status = 'success'").fetchone()[0]
    assert runs == len(settings.nrt_sources)


def test_backfill_source_override(monkeypatch):
    from flarewatch.config import Settings

    monkeypatch.setenv("BACKFILL_SOURCES", "VIIRS_SNPP_SP")
    assert Settings(_env_file=None).backfill_sources == ("VIIRS_SNPP_SP",)
