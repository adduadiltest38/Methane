CREATE INDEX IF NOT EXISTS detections_geom_gix        ON detections USING GIST (geom);
CREATE INDEX IF NOT EXISTS sites_geom_gix             ON sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS reference_flares_geom_gix  ON reference_flares USING GIST (geom);
CREATE INDEX IF NOT EXISTS countries_geom_gix         ON countries USING GIST (geom);

CREATE INDEX IF NOT EXISTS detections_acq_time_idx    ON detections (acq_time);
CREATE INDEX IF NOT EXISTS detections_site_id_idx     ON detections (site_id);
CREATE INDEX IF NOT EXISTS site_daily_stats_day_idx   ON site_daily_stats (day);
CREATE INDEX IF NOT EXISTS activity_changes_site_idx  ON activity_changes (site_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS ingest_runs_started_idx    ON ingest_runs (started_at DESC);
