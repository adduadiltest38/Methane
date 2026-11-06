"""Command line entry point.

python -m flarewatch.cli run                      # NRT ingest + processing
python -m flarewatch.cli backfill --days 90       # Standard Processing archive
python -m flarewatch.cli process                  # processing only
python -m flarewatch.cli load-reference FILE [--year 2024]
python -m flarewatch.cli load-countries FILE.geojson
python -m flarewatch.cli seed-demo                # synthetic data, no API key
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from .config import Settings
from .db import connect


def _client(s: Settings):
    from .firms_client import FirmsClient

    return FirmsClient(s.firms_map_key, s.firms_base_url, s.http_retries, s.http_timeout_s)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="flarewatch")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("run", help="fetch latest NRT detections and process")
    p_back = sub.add_parser("backfill", help="pull Standard Processing archive and process")
    p_back.add_argument("--days", type=int, default=90)
    p_back.add_argument("--source", action="append", help="override source(s)")
    sub.add_parser("process", help="cluster, stats, classify, changes")
    p_ref = sub.add_parser("load-reference", help="load ORNL flare reference CSV")
    p_ref.add_argument("path")
    p_ref.add_argument("--year", type=int, default=None, help="year if not in the file")
    p_ref.add_argument("--no-clip", action="store_true", help="keep points outside REGION_BBOX")
    p_cty = sub.add_parser("load-countries", help="load country polygons GeoJSON")
    p_cty.add_argument("path")
    p_demo = sub.add_parser("seed-demo", help="insert synthetic demo data and process")
    p_demo.add_argument("--days", type=int, default=120)

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    s = Settings()
    from .pipeline import process

    with connect(s.database_url) as conn:
        if args.cmd == "run":
            from .ingest import run_nrt

            result = {"inserted": run_nrt(conn, _client(s), s)}
            result.update(process(conn, s))
        elif args.cmd == "backfill":
            from .ingest import backfill

            result = {"inserted": backfill(conn, _client(s), s, args.days, sources=args.source)}
            result.update(process(conn, s))
        elif args.cmd == "process":
            result = process(conn, s)
        elif args.cmd == "load-reference":
            from .reference import load_reference, read_reference_file

            df = read_reference_file(args.path, args.year)
            n = load_reference(conn, df, None if args.no_clip else s.region_bbox)
            result = {"reference_flares_loaded": n}
        elif args.cmd == "load-countries":
            from .countries import load_countries

            result = {"countries_loaded": load_countries(conn, args.path)}
        elif args.cmd == "seed-demo":
            from .demo import seed

            result = {"inserted": seed(conn, s, args.days)}
            result.update(process(conn, s))
        else:  # pragma: no cover
            parser.error(f"unknown command {args.cmd}")
    print(json.dumps(result, default=str, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
