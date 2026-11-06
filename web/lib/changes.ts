import type postgres from "postgres";
import type { ActivityChange } from "./types";

export function mapChange(r: postgres.Row): ActivityChange {
  return {
    id: r.id,
    site_id: r.site_id,
    site_code: r.site_code,
    country: r.country,
    lon: r.lon,
    lat: r.lat,
    detected_at: r.detected_at.toISOString(),
    direction: r.direction,
    baseline: r.baseline,
    recent: r.recent,
    z_score: r.z_score,
  };
}
