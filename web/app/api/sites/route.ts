import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { parseBbox, parseClasses, parseDate, parseNumber } from "@/lib/params";
import type { SiteCollection } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_BBOX: [number, number, number, number] = [34, 12, 63, 38];

export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = req.nextUrl.searchParams;
    const [w, s, e, n] = parseBbox(q.get("bbox")) ?? DEFAULT_BBOX;
    const classes = parseClasses(q.get("class"));
    const minConfidence = parseNumber(q.get("minConfidence"), 0, 1, 0);
    const activeSince = parseDate(q.get("activeSince"));
    const db = sql();

    const rows = await db`
      WITH recent AS (
        SELECT site_id, SUM(frp_sum) AS frp_30d, SUM(detections) AS detections_30d
          FROM site_daily_stats
         WHERE day >= (now() AT TIME ZONE 'UTC')::date - 30
         GROUP BY site_id
      )
      SELECT s.id, s.code, s.country, s.classification, s.class_confidence,
             s.matches_reference, s.observation_count, s.observed_days,
             s.first_seen, s.last_seen,
             ST_X(s.geom::geometry) AS lon, ST_Y(s.geom::geometry) AS lat,
             COALESCE(r.frp_30d, 0)::float8 AS frp_30d,
             COALESCE(r.detections_30d, 0)::int AS detections_30d
        FROM sites s
        LEFT JOIN recent r ON r.site_id = s.id
       WHERE s.geom::geometry && ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)
         AND COALESCE(s.class_confidence, 0) >= ${minConfidence}
         ${classes ? db`AND s.classification = ANY(${classes})` : db``}
         ${activeSince ? db`AND s.last_seen >= ${activeSince}` : db``}
       ORDER BY s.id
       LIMIT 20000
    `;

    const body: SiteCollection = {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: { type: "Point", coordinates: [r.lon, r.lat] },
        properties: {
          id: r.id,
          code: r.code,
          country: r.country,
          classification: r.classification,
          class_confidence: r.class_confidence,
          matches_reference: r.matches_reference,
          observation_count: r.observation_count,
          observed_days: r.observed_days,
          first_seen: r.first_seen?.toISOString() ?? null,
          last_seen: r.last_seen?.toISOString() ?? null,
          frp_30d: r.frp_30d,
          detections_30d: r.detections_30d,
        },
      })),
    };
    return json(body);
  });
}
