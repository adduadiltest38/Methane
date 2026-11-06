-- FlareWatch initial schema
CREATE EXTENSION IF NOT EXISTS postgis;

-- Clustered persistent locations (created first so detections can reference it)
CREATE TABLE sites (
  id                 SERIAL PRIMARY KEY,
  code               TEXT UNIQUE NOT NULL,              -- FW-0001
  geom               GEOGRAPHY(POINT, 4326) NOT NULL,   -- FRP-weighted cluster centroid
  country            TEXT,                              -- reverse lookup on countries table
  first_seen         TIMESTAMPTZ,
  last_seen          TIMESTAMPTZ,
  classification     TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (classification IN ('likely_flare','persistent_industrial','transient_fire','unknown')),
  class_confidence   REAL,                              -- 0..1
  matches_reference  BOOLEAN DEFAULT FALSE,
  observation_count  INT NOT NULL DEFAULT 0,            -- detections assigned (90-day window)
  observed_days      INT NOT NULL DEFAULT 0,            -- distinct UTC days with >=1 detection (90-day window)
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Raw satellite detections
CREATE TABLE detections (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,                 -- e.g. VIIRS_NOAA20_NRT
  acq_time      TIMESTAMPTZ NOT NULL,          -- acq_date + acq_time (UTC)
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  bright_ti4    REAL,
  bright_ti5    REAL,
  frp           REAL,                          -- MW
  confidence    TEXT,                          -- l / n / h
  daynight      CHAR(1),
  scan          REAL,
  track         REAL,
  site_id       INT REFERENCES sites(id) ON DELETE SET NULL,
  UNIQUE (source, acq_time, geom)
);

-- Per-site daily aggregates
CREATE TABLE site_daily_stats (
  site_id          INT REFERENCES sites(id) ON DELETE CASCADE,
  day              DATE,
  detections       INT,
  night_detections INT,
  frp_sum          REAL,
  frp_max          REAL,
  PRIMARY KEY (site_id, day)
);

-- Days on which the region had at least one successful satellite pass in our data
-- (used as the denominator for "persistence")
CREATE TABLE coverage_days (
  day      DATE PRIMARY KEY,
  sources  TEXT[] NOT NULL DEFAULT '{}'
);

-- Known flare reference list (ORNL DAAC "Methane Flaring Sites VIIRS")
CREATE TABLE reference_flares (
  id        SERIAL PRIMARY KEY,
  year      INT,
  geom      GEOGRAPHY(POINT, 4326),
  flr_type  TEXT
);

-- Country polygons for reverse lookup (optional; loaded by `load-countries`)
CREATE TABLE countries (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  iso3  TEXT,
  geom  GEOGRAPHY(MULTIPOLYGON, 4326) NOT NULL
);

-- Activity change events
CREATE TABLE activity_changes (
  id          SERIAL PRIMARY KEY,
  site_id     INT REFERENCES sites(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ DEFAULT now(),
  direction   TEXT CHECK (direction IN ('increase','decrease','new_site','inactive')),
  baseline    REAL,          -- 90-day mean daily FRP
  recent      REAL,          -- 7-day mean daily FRP
  z_score     REAL
);

-- Ingest bookkeeping
CREATE TABLE ingest_runs (
  id            SERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  source        TEXT,
  rows_fetched  INT,
  rows_inserted INT,
  status        TEXT,          -- running | success | error
  error         TEXT
);
