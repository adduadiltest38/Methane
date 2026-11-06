-- Read-only role for the web app. Set its password out-of-band:
--   ALTER ROLE flarewatch_web WITH LOGIN PASSWORD '...';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flarewatch_web') THEN
    CREATE ROLE flarewatch_web NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO flarewatch_web;
GRANT SELECT ON sites, detections, site_daily_stats, activity_changes, ingest_runs,
                reference_flares, coverage_days TO flarewatch_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO flarewatch_web;
