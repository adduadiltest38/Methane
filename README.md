# FlareWatch

**Satellite-detected gas flares and persistent industrial heat sources in the Middle East, mapped from free NASA VIIRS data and updated every 3 hours.**

![FlareWatch map with site panel (synthetic demo data)](docs/screenshot-demo.png)
<sub>Screenshot rendered from the built-in synthetic demo dataset (`make seed`), not real observations.</sub>

**Live demo:** _not deployed yet — see [Deploy](#deploy)._

FlareWatch ingests VIIRS 375 m thermal detections from NASA FIRMS, clusters them into persistent sites, separates likely gas flares from wildfires and other heat sources with transparent rules, tracks each site's relative thermal intensity over time and flags notable activity changes. It is a portfolio / educational project covering data engineering, geospatial processing, classification logic and frontend visualisation.

> **Not** an emissions inventory or a compliance tool. Sites are identified only by auto-generated codes (`FW-0001`), coordinates and country. Thermal intensity is shown as **relative thermal intensity (MW FRP)** and is never converted to gas volumes or emissions.

## Architecture

```
GitHub Actions (cron, every 3 h)
   └── Python worker (worker/flarewatch)
         ├── fetch FIRMS NRT (VIIRS S-NPP, NOAA-20, NOAA-21)
         ├── dedupe + insert detections        (UNIQUE + ON CONFLICT DO NOTHING)
         ├── cluster detections → sites        (DBSCAN, haversine)
         ├── compute daily site stats
         ├── classify sites                    (rule-based v1)
         └── detect activity changes           (z-score vs. baseline)
                │
                ▼
     PostgreSQL 16 + PostGIS  (Neon / Supabase free tier)
                │  read-only role
                ▼
Next.js app (Vercel)
   ├── /api/sites, /api/sites/[id], /api/sites/[id]/timeseries,
   │   /api/changes, /api/detections, /api/meta   (parameterised SQL, 10-min edge cache)
   └── MapLibre GL + deck.gl map, site panel (Recharts), changes feed, About page
```

| Path | What |
|---|---|
| `db/migrations/` | Plain SQL migrations, applied in order by `db/migrate.sh` |
| `worker/flarewatch/` | `firms_client`, `ingest`, `clustering`, `stats`, `classify`, `changes`, `reference`, `cli` |
| `web/` | Next.js App Router app (TypeScript strict, Tailwind) |
| `ci/` | Banned-words list and check script |
| `.github/workflows/` | `ci.yml` (tests, lint, build, banned words) and `ingest.yml` (cron) |

## How classification works

Over the last 90 days, per site:

- **persistence** = days with ≥1 detection ÷ days with satellite coverage (counted from the site's first detection)
- **ref_match** = within 750 m of a location in the NASA ORNL DAAC "Methane Flaring Sites VIIRS" reference list
- **span_days** = last seen − first seen

| Class | Rule (first match wins) |
|---|---|
| Likely gas flare | ref_match **and** persistence ≥ 0.2 |
| Persistent industrial heat | no ref_match, persistence ≥ 0.3 **and** span ≥ 30 days |
| Transient fire | span < 7 days **and** persistence < 0.1 |
| Unclassified | everything else |

**Confidence** (0–1) = 0.4 × evidence + 0.3 × min(1, detections ÷ 30) + 0.3 × ref_match, where evidence = min(1, persistence ÷ 0.5) for flares / industrial heat and 1 − persistence ÷ 0.1 for transient fires. Every site panel shows the confidence and the number of detections and clear-sky observation days behind it.

**Activity changes:** for sites with ≥30 days of history, the mean daily FRP of the last 7 complete days is compared with the preceding 90 days, `z = (recent − baseline) / std`. `|z| ≥ 2.5` records an increase/decrease (max one per site per 7 days). Days without satellite coverage are skipped, not counted as zero. Persistent sites with no detections for 30 days get a "no recent detections" event; newly appeared persistent sites get a "new" event.

All thresholds live in [`worker/flarewatch/config.py`](worker/flarewatch/config.py) and can be overridden by environment variables (e.g. `DBSCAN_EPS_M=400`). The About page reads them from `web/lib/thresholds.json`, which a test keeps in sync.

### Limitations

- Clouds and smoke hide heat sources, so cloudy periods look like low activity.
- 375 m pixels: neighbouring sources merge and small ones are missed.
- Near-real-time data have ~3 h latency and are reprocessed later.
- Polar orbits give only a few overpasses per day, so short events between passes are missed.
- False positives (sun glint, hot surfaces, volcanoes, other industry) happen; the reference list is annual.
- FRP is a relative indicator only.

## Data sources & attribution

See [DATA_SOURCES.md](DATA_SOURCES.md) for licences and full citations.

- *We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Observing System Data and Information System (EOSDIS).*
- NASA ORNL DAAC "Methane Flaring Sites VIIRS" — reference flare locations (citation: see DATA_SOURCES.md).
- Basemap: OpenFreeMap, © OpenMapTiles © OpenStreetMap contributors.

## Local setup

Requires Docker, Python 3.12+, Node 22.

```bash
make db-up            # PostGIS in docker + migrations
make worker-install   # pip install -e worker[dev]
make countries        # optional: country borders, so demo sites land on land and get country labels
make seed             # synthetic demo data (no API key needed)
make web-install web-dev   # http://localhost:3000
```

For real data, put a free [FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/) in `.env` (copy `.env.example`) and run `make backfill` once, then `make ingest`. Load the reference list with `python -m flarewatch.cli load-reference <file.csv>` and (optionally) country polygons with `make countries` (Natural Earth 1:50m via the `world-atlas` package).

Tests: `cd worker && TEST_DATABASE_URL=postgresql://flarewatch:flarewatch@localhost:5432/flarewatch_test pytest` (the DB tests drop and recreate the `public` schema of that database, so point it at a throwaway one; without it, only the pure unit tests run).

## Deploy

1. Create a Postgres database with PostGIS (Neon or Supabase), run `DATABASE_URL=... ./db/migrate.sh`, then give the read-only role a password: `ALTER ROLE flarewatch_web WITH LOGIN PASSWORD '...'`.
2. GitHub → Settings → Secrets: `FIRMS_MAP_KEY`, `DATABASE_URL` (read-write), optional `BANNED_OPERATOR_NAMES`. Run the **Ingest** workflow once with `command = backfill`.
3. Vercel: import the repo with root directory `web`, set `DATABASE_URL_READONLY` to the `flarewatch_web` connection string.

## Roadmap

- [x] M1–M6: schema, ingest, clustering, classification, activity changes, web app
- [x] M7: CI + scheduled ingest workflows (deployment pending)
- [ ] M8: Sentinel-5P TROPOMI CH₄ monthly overlay (labelled "regional methane column (~7 km resolution)")
- [ ] M9: gradient-boosting classifier vs. rule baseline, metrics table here

## Disclaimer

*Educational demo. Satellite-derived estimates only — may contain errors. Not official data. Not affiliated with or endorsed by NASA or the European Union.*

No ads, no paid tiers, no tracking. Code is [MIT licensed](LICENSE); data remain under their providers' terms.
