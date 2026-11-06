# FlareWatch — Satellite Gas Flare & Thermal Anomaly Monitor

> Build spec for Claude Code. Work through the milestones in order. Each milestone has acceptance criteria — do not move on until they pass.

---

## 1. Overview

FlareWatch is a web app that maps **gas flares and persistent industrial heat sources** in the Middle East using free NASA satellite data, updated several times per day. It separates likely gas flares from wildfires and other heat sources, tracks each site's activity over time, and flags notable changes in activity.

**Purpose:** a portfolio / educational project demonstrating data engineering, geospatial processing, classification logic, and frontend visualization.

**Non-goals:** this is not an official emissions inventory, not a compliance tool, and makes no claims about any company or operator.

---

## 2. Guardrails (MUST follow — legal & ethical)

These rules apply to all code, UI copy, README, and commit messages.

1. **No operator or company names anywhere.** Sites are identified only by an auto-generated ID (e.g. `FW-0001`), coordinates, and country/region. Do not join any dataset that maps sites to operators.
2. **Neutral wording only.** Use "satellite-detected", "estimated", "activity change". Never use "polluter", "violation", "illegal", "exposed", "underreported", or similar.
3. **No comparison with official figures** (national, company, or government emissions data).
4. **Show uncertainty.** Every site shows a classification confidence and the number of clear-sky observations.
5. **FRP is shown as "relative thermal intensity (MW FRP)"** — never converted to gas volume or emissions numbers.
6. **Disclaimer in the footer of every page:**
   > "Educational demo. Satellite-derived estimates only — may contain errors. Not official data. Not affiliated with or endorsed by NASA or the European Union."
7. **Attribution shown on the map and the About page** (see §9).
8. **Non-commercial.** No ads, no paid tiers, no tracking analytics beyond basic privacy-friendly page counts.

---

## 3. Data sources

| Source | What | Use | Access |
|---|---|---|---|
| NASA FIRMS — VIIRS 375 m NRT (`VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`) | Thermal hotspot detections, ~3 h latency | Live detections | Free `MAP_KEY` from https://firms.modaps.eosdis.nasa.gov/api/ |
| NASA FIRMS — VIIRS Standard Processing (`VIIRS_SNPP_SP`) | Science-quality archive | Historical backfill (90+ days) | Same API |
| NASA ORNL DAAC — "Methane Flaring Sites VIIRS" | Annual list of known gas flare sites | Reference labels for classifier | https://daac.ornl.gov (search "Methane Flaring Sites VIIRS") |
| NASA FIRMS Static Thermal Anomalies (STA) layer | Known persistent industrial/natural heat sources | Secondary reference | FIRMS website (check current availability) |
| Copernicus Sentinel-5P TROPOMI CH₄ (Phase 2) | Methane column, ~7 km pixels | Regional methane overlay (monthly) | Google Earth Engine (`COPERNICUS/S5P/OFFL/L3_CH4`), non-commercial account |

**Before building:** verify the FIRMS API is returning fresh data (FIRMS has had reduced website updates since Oct 2025). Verify all API URL formats and CSV column names against the current FIRMS docs — do not trust this spec blindly.

### FIRMS API (verify against docs)
```
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}/{YYYY-MM-DD}
```
Expected VIIRS columns: `latitude, longitude, bright_ti4, scan, track, acq_date, acq_time, satellite, instrument, confidence, version, bright_ti5, frp, daynight`.

### Default region
Middle East bounding box (configurable via env): `west=34, south=12, east=63, north=38`.

---

## 4. Architecture

```
GitHub Actions (cron, every 3h)
   └── Python ingest worker
         ├── fetch FIRMS NRT (3 VIIRS sources)
         ├── dedupe + insert detections
         ├── cluster detections → sites
         ├── compute daily site stats
         ├── classify sites
         └── detect activity changes
                │
                ▼
     PostgreSQL + PostGIS (Neon or Supabase free tier)
                │
                ▼
Next.js app (Vercel)
   ├── API routes (read-only SQL queries)
   └── Map UI (MapLibre GL + deck.gl), site panel, charts
```

No separate backend server. Python is only used by the scheduled worker.

---

## 5. Tech stack

- **Worker:** Python 3.12, `httpx`, `pandas`, `numpy`, `scikit-learn` (DBSCAN with haversine), `psycopg[binary]`, `pydantic-settings`, `pytest`
- **DB:** PostgreSQL 16 + PostGIS
- **Web:** Next.js (App Router, TypeScript), MapLibre GL JS, deck.gl, Recharts, Tailwind CSS, `postgres` (porsager) or `pg` client
- **Basemap:** free OSM-based style (e.g. OpenFreeMap or Carto light) — no paid token required; include basemap attribution
- **CI/CD:** GitHub Actions (tests + scheduled ingest), Vercel (web)
- **Migrations:** plain SQL files in `db/migrations/`, applied in order

---

## 6. Repository structure

```
flarewatch/
├── README.md
├── LICENSE                      # MIT for code
├── DATA_SOURCES.md              # licenses + attribution for each dataset
├── .env.example
├── db/
│   └── migrations/
│       ├── 001_init.sql
│       └── 002_indexes.sql
├── worker/
│   ├── pyproject.toml
│   ├── flarewatch/
│   │   ├── config.py
│   │   ├── firms_client.py
│   │   ├── ingest.py
│   │   ├── clustering.py
│   │   ├── stats.py
│   │   ├── classify.py
│   │   ├── changes.py
│   │   ├── reference.py         # load ORNL flare list
│   │   └── cli.py               # `python -m flarewatch.cli run|backfill|load-reference`
│   └── tests/
├── web/
│   ├── package.json
│   ├── app/
│   │   ├── page.tsx             # map
│   │   ├── about/page.tsx       # methodology, attribution, disclaimer
│   │   └── api/
│   │       ├── sites/route.ts
│   │       ├── sites/[id]/route.ts
│   │       ├── sites/[id]/timeseries/route.ts
│   │       ├── changes/route.ts
│   │       └── meta/route.ts
│   ├── components/
│   │   ├── MapView.tsx
│   │   ├── SitePanel.tsx
│   │   ├── Filters.tsx
│   │   ├── Legend.tsx
│   │   └── Footer.tsx           # disclaimer + attribution
│   └── lib/db.ts
└── .github/workflows/
    ├── ci.yml
    └── ingest.yml               # cron: "0 */3 * * *"
```

---

## 7. Database schema

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- Raw satellite detections
CREATE TABLE detections (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,              -- e.g. VIIRS_NOAA20_NRT
  acq_time      TIMESTAMPTZ NOT NULL,       -- from acq_date + acq_time (UTC)
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  bright_ti4    REAL,
  bright_ti5    REAL,
  frp           REAL,                       -- MW
  confidence    TEXT,                       -- l / n / h
  daynight      CHAR(1),
  scan          REAL,
  track         REAL,
  site_id       INT REFERENCES sites(id),   -- add FK after sites table exists
  UNIQUE (source, acq_time, geom)
);

-- Clustered persistent locations
CREATE TABLE sites (
  id                 SERIAL PRIMARY KEY,
  code               TEXT UNIQUE NOT NULL,  -- FW-0001
  geom               GEOGRAPHY(POINT, 4326) NOT NULL,  -- cluster centroid
  country            TEXT,                  -- from reverse lookup on a country polygon set
  first_seen         TIMESTAMPTZ,
  last_seen          TIMESTAMPTZ,
  classification     TEXT NOT NULL DEFAULT 'unknown',
                     -- likely_flare | persistent_industrial | transient_fire | unknown
  class_confidence   REAL,                  -- 0..1
  matches_reference  BOOLEAN DEFAULT FALSE,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Per-site daily aggregates
CREATE TABLE site_daily_stats (
  site_id         INT REFERENCES sites(id),
  day             DATE,
  detections      INT,
  night_detections INT,
  frp_sum         REAL,
  frp_max         REAL,
  PRIMARY KEY (site_id, day)
);

-- Known flare reference list (ORNL DAAC)
CREATE TABLE reference_flares (
  id        SERIAL PRIMARY KEY,
  year      INT,
  geom      GEOGRAPHY(POINT, 4326),
  flr_type  TEXT
);

-- Activity change events
CREATE TABLE activity_changes (
  id          SERIAL PRIMARY KEY,
  site_id     INT REFERENCES sites(id),
  detected_at TIMESTAMPTZ DEFAULT now(),
  direction   TEXT,          -- increase | decrease | new_site | inactive
  baseline    REAL,          -- 90-day mean daily FRP
  recent      REAL,          -- 7-day mean daily FRP
  z_score     REAL
);

-- Ingest bookkeeping
CREATE TABLE ingest_runs (
  id          SERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  source      TEXT,
  rows_fetched INT,
  rows_inserted INT,
  status      TEXT,
  error       TEXT
);
```

Indexes: GIST on all `geom` columns, BTREE on `detections(acq_time)`, `detections(site_id)`, `site_daily_stats(day)`.

---

## 8. Processing logic

### 8.1 Ingest
- For each VIIRS NRT source, fetch the last 2 days for the region (overlap is fine; dedupe via the UNIQUE constraint with `ON CONFLICT DO NOTHING`).
- Parse `acq_date` + `acq_time` (HHMM, UTC) into `TIMESTAMPTZ`.
- Keep `confidence` `n` and `h`; store `l` but exclude from clustering by default.
- Log each run to `ingest_runs`. Retry HTTP failures 3× with backoff. Respect FIRMS rate limits.
- `backfill` command: pull 90 days from the Standard Processing source in chunks.

### 8.2 Clustering → sites
- DBSCAN on unassigned detections from the last 90 days, haversine metric, `eps ≈ 500 m`, `min_samples = 3` (make both configurable).
- New cluster within 750 m of an existing site → assign to that site; otherwise create a new site with the next `FW-XXXX` code.
- Recompute site centroid as the FRP-weighted mean of its detections.

### 8.3 Daily stats
- Aggregate per site per UTC day: count, night count, FRP sum, FRP max.

### 8.4 Classification (rule-based v1)
Compute over the last 90 days:
- `persistence` = days with ≥1 detection / days with data coverage
- `night_ratio` = night detections / total
- `ref_match` = site within 750 m of a `reference_flares` point
- `span_days` = last_seen − first_seen

Rules (tune thresholds, keep them in `config.py`):
- `ref_match` AND `persistence ≥ 0.2` → **likely_flare** (confidence high)
- NOT `ref_match` AND `persistence ≥ 0.3` AND `span_days ≥ 30` → **persistent_industrial** (medium)
- `span_days < 7` AND `persistence < 0.1` → **transient_fire** (medium)
- else → **unknown**

Confidence = a simple 0–1 score combining persistence, observation count, and ref match. Document the formula on the About page.

Stretch goal (Milestone 7): train a small gradient-boosting classifier on features above, using reference-matched sites as positive labels; compare against the rule baseline and report metrics in the README.

### 8.5 Activity changes
- For each site with ≥30 days of history: `baseline` = 90-day mean daily FRP, `recent` = 7-day mean.
- `z = (recent − baseline) / std`. If `|z| ≥ 2.5` → insert `increase` / `decrease` event (max one per site per 7 days).
- Site with no detections for 30 days after being persistent → `inactive`.
- Brand-new persistent site → `new_site`.
- UI wording: "Activity change detected" — never implies wrongdoing.

---

## 9. Attribution text (display exactly)

On map corner + About page + `DATA_SOURCES.md`:

- "We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Observing System Data and Information System (EOSDIS)."
- Flare reference list: cite the ORNL DAAC "Methane Flaring Sites VIIRS" dataset with its DOI (copy the exact citation from the dataset page).
- Phase 2: "Contains modified Copernicus Sentinel data [Year]."
- Basemap attribution per the chosen provider (e.g. "© OpenStreetMap contributors").

---

## 10. API (Next.js route handlers, read-only)

| Route | Params | Returns |
|---|---|---|
| `GET /api/sites` | `bbox`, `class`, `minConfidence`, `activeSince` | GeoJSON FeatureCollection of sites with latest 30-day stats |
| `GET /api/sites/[id]` | — | Site detail: classification, confidence, first/last seen, observation count, ref match |
| `GET /api/sites/[id]/timeseries` | `from`, `to` | Daily detections + FRP series |
| `GET /api/changes` | `since`, `limit` | Recent activity change events |
| `GET /api/meta` | — | Last successful ingest time, sources, attribution strings |

All queries parameterized. Cache responses for 10 min (`revalidate`). Read-only DB role for the web app.

---

## 11. Frontend

- **Map page:** full-screen MapLibre basemap + deck.gl `ScatterplotLayer` for sites (color by classification, radius by 30-day FRP), optional `HeatmapLayer` for raw detections of last 48 h.
- **Filters:** classification, min confidence, date range, show raw detections toggle.
- **Site panel** (on click): site code, coordinates, country, classification + confidence badge, first/last seen, Recharts line chart of daily FRP and detection count, list of recent activity changes.
- **Changes feed:** sidebar list of latest activity changes, click to fly to site.
- **Header:** "Last updated: X hours ago" from `/api/meta`.
- **About page:** what the data is, how classification works (with thresholds), known limitations (clouds, 375 m pixels, ~3 h latency, overpass gaps, false positives), attribution, disclaimer.
- **Footer:** disclaimer (§2.6) on every page.
- Mobile-friendly; dark map style.

---

## 12. Environment variables (`.env.example`)

```
FIRMS_MAP_KEY=
DATABASE_URL=                # worker: read-write
DATABASE_URL_READONLY=       # web: read-only role
REGION_BBOX=34,12,63,38
DBSCAN_EPS_M=500
DBSCAN_MIN_SAMPLES=3
SITE_MATCH_RADIUS_M=750
```

Never commit secrets. Store them in GitHub Actions secrets and Vercel env settings.

---

## 13. Milestones & acceptance criteria

### M1 — Project setup
- Repo structure from §6, `.env.example`, MIT LICENSE, README stub, `DATA_SOURCES.md`.
- Migrations apply cleanly on a fresh PostGIS DB.
- ✅ `make db-up` (docker compose PostGIS) + migrations run without errors.

### M2 — FIRMS ingest
- `firms_client.py` + `ingest.py` + CLI `run` and `backfill`.
- ✅ Running `run` twice inserts no duplicates. ✅ `ingest_runs` logs each run. ✅ Unit tests for CSV parsing and time conversion (use a fixture CSV, no live API in tests).

### M3 — Clustering & daily stats
- ✅ Synthetic test: 3 tight point groups + noise → exactly 3 sites. ✅ Re-running assigns new detections to existing sites, not new ones.

### M4 — Reference data & classification
- `load-reference` command for the ORNL flare list.
- ✅ Tests for each classification rule with synthetic stats. ✅ Thresholds live in config.

### M5 — Activity changes
- ✅ Synthetic series with a spike triggers exactly one `increase` event; flat series triggers none.

### M6 — Web app
- API routes + map + site panel + about page + footer.
- ✅ Map loads sites for the default region. ✅ Disclaimer + attribution visible on every page. ✅ No operator names anywhere (grep check in CI for a banned-words list).

### M7 — Automation & deploy
- `ingest.yml` cron every 3 h; `ci.yml` runs pytest + `next build` + lint + banned-words check.
- Deploy web to Vercel.
- ✅ Public URL shows data updated within the last 6 h.

### M8 (Phase 2) — Methane overlay
- Monthly Sentinel-5P CH₄ mean over the region exported from Earth Engine as a raster tile layer or PNG overlay.
- Toggle layer, legend in ppb, Copernicus attribution, label "regional methane column (~7 km resolution)".

### M9 (Stretch) — ML classifier
- Gradient-boosting model vs rule baseline; metrics table in README.

---

## 14. Testing & quality

- `pytest` for worker; fixtures only, no live network calls in tests.
- ESLint + TypeScript strict in web.
- CI banned-words check: fail build if UI/README contains words from §2.2 list or any known operator name list kept in `ci/banned_words.txt`.
- Type hints throughout Python; `ruff` for lint/format.

---

## 15. README must include

- One-line pitch + screenshot/GIF of the map.
- Architecture diagram (§4).
- How classification works + limitations.
- Data sources & attribution.
- Disclaimer.
- Local setup in ≤ 5 commands.
- Live demo link.

---

## 16. Notes for Claude Code

- Follow milestones in order; commit after each milestone with conventional commits (`feat:`, `fix:`, `test:`, `docs:`).
- Verify every external URL, API format, and dataset column against live docs before coding against it; update this spec if anything differs.
- Prefer simple, readable code over cleverness — this is a portfolio piece.
- Never add operator/company names, emissions-volume conversions, or comparisons with official figures.
