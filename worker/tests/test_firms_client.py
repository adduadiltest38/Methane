from datetime import UTC, date, datetime

import httpx
import pytest

from flarewatch.firms_client import (
    FirmsClient,
    FirmsError,
    date_chunks,
    parse_acq_time,
    parse_csv,
)

from .conftest import FIXTURES


@pytest.mark.parametrize(
    ("d", "t", "expected"),
    [
        ("2026-10-30", "1012", datetime(2026, 10, 30, 10, 12, tzinfo=UTC)),
        ("2026-10-30", 2254, datetime(2026, 10, 30, 22, 54, tzinfo=UTC)),
        ("2026-10-31", "5", datetime(2026, 10, 31, 0, 5, tzinfo=UTC)),
        ("2026-10-31", "0042", datetime(2026, 10, 31, 0, 42, tzinfo=UTC)),
        ("2026-10-31", 0, datetime(2026, 10, 31, 0, 0, tzinfo=UTC)),
    ],
)
def test_parse_acq_time(d, t, expected):
    assert parse_acq_time(d, t) == expected


@pytest.mark.parametrize("bad", ["2460", "1299", "abc", "12345"])
def test_parse_acq_time_rejects_invalid(bad):
    with pytest.raises(ValueError):
        parse_acq_time("2026-10-30", bad)


def test_parse_csv_fixture():
    dets = parse_csv((FIXTURES / "viirs_sample.csv").read_text(), "VIIRS_NOAA20_NRT")
    assert len(dets) == 4
    first = dets[0]
    assert first.source == "VIIRS_NOAA20_NRT"
    assert first.latitude == pytest.approx(29.37612)
    assert first.longitude == pytest.approx(47.64921)
    assert first.acq_time == datetime(2026, 10, 30, 10, 12, tzinfo=UTC)
    assert first.frp == pytest.approx(24.7)
    assert first.confidence == "h"
    assert first.daynight == "D"
    assert dets[2].acq_time == datetime(2026, 10, 31, 0, 5, tzinfo=UTC)
    assert dets[2].confidence == "l"
    assert dets[3].frp is None


def test_parse_csv_empty_and_header_only():
    assert parse_csv("", "X") == []
    header = (FIXTURES / "viirs_sample.csv").read_text().splitlines()[0]
    assert parse_csv(header + "\n", "X") == []


def test_parse_csv_error_message():
    with pytest.raises(FirmsError, match="non-CSV"):
        parse_csv("Invalid MAP_KEY.", "X")


def test_parse_csv_missing_columns():
    with pytest.raises(FirmsError, match="missing columns"):
        parse_csv("latitude,longitude\n1,2\n", "X")


def test_date_chunks():
    chunks = list(date_chunks(date(2026, 1, 1), date(2026, 1, 12), 5))
    assert chunks == [(date(2026, 1, 1), 5), (date(2026, 1, 6), 5), (date(2026, 1, 11), 2)]
    assert sum(n for _, n in chunks) == 12


def test_build_url():
    c = FirmsClient("KEY", client=httpx.Client())
    assert (
        c.build_url("VIIRS_SNPP_NRT", "34,12,63,38", 2, None)
        == "https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY/VIIRS_SNPP_NRT/34,12,63,38/2"
    )
    assert c.build_url("VIIRS_SNPP_SP", "1,2,3,4", 5, date(2026, 1, 1)).endswith("/5/2026-01-01")


def test_fetch_retries_then_succeeds():
    calls = {"n": 0}
    body = (FIXTURES / "viirs_sample.csv").read_text()

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, text=body)

    sleeps: list[float] = []
    c = FirmsClient(
        "KEY", client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=sleeps.append
    )
    assert len(c.fetch("VIIRS_SNPP_NRT", "34,12,63,38", 2)) == 4
    assert calls["n"] == 3
    assert sleeps == [2, 4]


def test_fetch_gives_up_and_hides_key():
    c = FirmsClient(
        "SECRETKEY",
        client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))),
        sleep=lambda s: None,
    )
    with pytest.raises(FirmsError) as exc:
        c.fetch("VIIRS_SNPP_NRT", "34,12,63,38", 2)
    assert "SECRETKEY" not in str(exc.value)


def test_fetch_client_error_not_retried():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(400, text="bad")

    c = FirmsClient(
        "K", client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None
    )
    with pytest.raises(FirmsError):
        c.fetch("X", "1,2,3,4", 1)
    assert calls["n"] == 1


def test_missing_key():
    with pytest.raises(FirmsError):
        FirmsClient("")


def test_client_error_includes_reason_without_key():
    c = FirmsClient(
        "SECRETKEY",
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda r: httpx.Response(400, text="Invalid date for SECRETKEY")
            )
        ),
        sleep=lambda s: None,
    )
    with pytest.raises(FirmsError) as exc:
        c.fetch("X", "1,2,3,4", 1)
    assert "Invalid date" in str(exc.value) and "SECRETKEY" not in str(exc.value)
