"""NASA FIRMS Area API client and CSV parsing.

URL format (FIRMS Area API)::

    https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}/{YYYY-MM-DD}

``DAY_RANGE`` days are returned *starting at* the given date. When the date is
omitted, FIRMS returns the most recent ``DAY_RANGE`` days.
"""

from __future__ import annotations

import io
import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx
import pandas as pd

log = logging.getLogger(__name__)

REQUIRED_COLUMNS = (
    "latitude",
    "longitude",
    "bright_ti4",
    "scan",
    "track",
    "acq_date",
    "acq_time",
    "confidence",
    "bright_ti5",
    "frp",
    "daynight",
)


class FirmsError(RuntimeError):
    """Raised when FIRMS returns an error message or an unexpected payload."""


@dataclass(frozen=True, slots=True)
class Detection:
    source: str
    acq_time: datetime
    latitude: float
    longitude: float
    bright_ti4: float | None
    bright_ti5: float | None
    frp: float | None
    confidence: str | None
    daynight: str | None
    scan: float | None
    track: float | None


def parse_acq_time(acq_date: str, acq_time: str | int) -> datetime:
    """Combine FIRMS ``acq_date`` (YYYY-MM-DD) and ``acq_time`` (HHMM, UTC).

    ``acq_time`` may arrive as an int (``5`` for 00:05) or a zero-padded string.
    """
    hhmm = str(acq_time).strip()
    if not hhmm.isdigit() or len(hhmm) > 4:
        raise ValueError(f"invalid acq_time {acq_time!r}")
    hhmm = hhmm.zfill(4)
    hour, minute = int(hhmm[:2]), int(hhmm[2:])
    if hour > 23 or minute > 59:
        raise ValueError(f"invalid acq_time {acq_time!r}")
    d = date.fromisoformat(str(acq_date).strip())
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=UTC)


def _opt_float(v: object) -> float | None:
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
        return None
    return float(v)  # type: ignore[arg-type]


def _normalise_confidence(v: object) -> str | None:
    """VIIRS confidence is l/n/h. Accept 'low'/'nominal'/'high' spellings too."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip().lower()
    return {"low": "l", "nominal": "n", "high": "h"}.get(s, s[:1] or None)


def parse_csv(text: str, source: str) -> list[Detection]:
    """Parse a FIRMS VIIRS CSV payload into :class:`Detection` objects."""
    stripped = text.strip()
    if not stripped:
        return []
    first_line = stripped.splitlines()[0]
    if "latitude" not in first_line:
        # FIRMS reports problems (bad key, bad source, limit exceeded) as plain text.
        raise FirmsError(f"FIRMS returned a non-CSV response: {first_line[:200]}")

    df = pd.read_csv(io.StringIO(stripped), dtype={"acq_time": str, "acq_date": str})
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise FirmsError(f"FIRMS CSV is missing columns: {missing}")

    out: list[Detection] = []
    for row in df.itertuples(index=False):
        dn = str(row.daynight).strip().upper()[:1] if pd.notna(row.daynight) else None
        out.append(
            Detection(
                source=source,
                acq_time=parse_acq_time(row.acq_date, row.acq_time),
                latitude=float(row.latitude),
                longitude=float(row.longitude),
                bright_ti4=_opt_float(row.bright_ti4),
                bright_ti5=_opt_float(row.bright_ti5),
                frp=_opt_float(row.frp),
                confidence=_normalise_confidence(row.confidence),
                daynight=dn,
                scan=_opt_float(row.scan),
                track=_opt_float(row.track),
            )
        )
    return out


def date_chunks(start: date, end: date, max_days: int) -> Iterator[tuple[date, int]]:
    """Split the inclusive range [start, end] into (chunk_start, n_days) pieces."""
    if end < start:
        return
    cur = start
    while cur <= end:
        n = min(max_days, (end - cur).days + 1)
        yield cur, n
        cur += timedelta(days=n)


class FirmsClient:
    def __init__(
        self,
        map_key: str,
        base_url: str = "https://firms.modaps.eosdis.nasa.gov/api/area/csv",
        retries: int = 3,
        timeout_s: float = 120.0,
        client: httpx.Client | None = None,
        sleep=time.sleep,
    ) -> None:
        if not map_key:
            raise FirmsError("FIRMS_MAP_KEY is not set")
        self.map_key = map_key
        self.base_url = base_url.rstrip("/")
        self.retries = retries
        self._client = client or httpx.Client(timeout=timeout_s)
        self._sleep = sleep

    def build_url(self, source: str, bbox: str, day_range: int, start: date | None) -> str:
        url = f"{self.base_url}/{self.map_key}/{source}/{bbox}/{day_range}"
        if start is not None:
            url += f"/{start.isoformat()}"
        return url

    def fetch_csv(self, source: str, bbox: str, day_range: int, start: date | None = None) -> str:
        """GET one area CSV, retrying transport errors and 429/5xx with backoff."""
        url = self.build_url(source, bbox, day_range, start)
        safe_url = url.replace(self.map_key, "***")
        last_exc: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                resp = self._client.get(url)
                if resp.status_code == 429 or resp.status_code >= 500:
                    raise httpx.HTTPStatusError(
                        f"HTTP {resp.status_code}", request=resp.request, response=resp
                    )
                resp.raise_for_status()
                return resp.text
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status is not None and status < 500 and status != 429:
                    body = exc.response.text.strip().replace(self.map_key, "***")[:300]
                    raise FirmsError(
                        f"FIRMS request failed ({status}) for {safe_url}: {body}"
                    ) from exc
                last_exc = exc
                if attempt < self.retries:
                    wait = 2**attempt
                    log.warning("FIRMS fetch failed (%s), retry %d in %ss", exc, attempt, wait)
                    self._sleep(wait)
        raise FirmsError(f"FIRMS request failed after {self.retries} attempts: {safe_url}") from (
            last_exc
        )

    def fetch(
        self, source: str, bbox: str, day_range: int, start: date | None = None
    ) -> list[Detection]:
        return parse_csv(self.fetch_csv(source, bbox, day_range, start), source)
