import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mapChange } from "@/lib/changes";
import { sql } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { parseSiteId } from "@/lib/params";
import type { SiteDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseSiteId((await ctx.params).id);
    const db = sql();
    const [site] = await db`
      SELECT s.id, s.code, s.country, s.classification, s.class_confidence,
             s.matches_reference, s.observation_count, s.observed_days,
             s.first_seen, s.last_seen,
             ST_X(s.geom::geometry) AS lon, ST_Y(s.geom::geometry) AS lat,
             COALESCE((SELECT SUM(frp_sum) FROM site_daily_stats x
                        WHERE x.site_id = s.id
                          AND x.day >= (now() AT TIME ZONE 'UTC')::date - 30), 0)::float8 AS frp_30d,
             COALESCE((SELECT SUM(detections) FROM site_daily_stats x
                        WHERE x.site_id = s.id
                          AND x.day >= (now() AT TIME ZONE 'UTC')::date - 30), 0)::int AS detections_30d
        FROM sites s
       WHERE s.id = ${id}
    `;
    if (!site) return NextResponse.json({ error: "not found" }, { status: 404 });

    const changes = await db`
      SELECT a.id, a.site_id, s.code AS site_code, s.country,
             ST_X(s.geom::geometry) AS lon, ST_Y(s.geom::geometry) AS lat,
             a.detected_at, a.direction, a.baseline, a.recent, a.z_score
        FROM activity_changes a JOIN sites s ON s.id = a.site_id
       WHERE a.site_id = ${id}
       ORDER BY a.detected_at DESC
       LIMIT 20
    `;

    const body: SiteDetail = {
      id: site.id,
      code: site.code,
      country: site.country,
      classification: site.classification,
      class_confidence: site.class_confidence,
      matches_reference: site.matches_reference,
      observation_count: site.observation_count,
      observed_days: site.observed_days,
      first_seen: site.first_seen?.toISOString() ?? null,
      last_seen: site.last_seen?.toISOString() ?? null,
      frp_30d: site.frp_30d,
      detections_30d: site.detections_30d,
      lon: site.lon,
      lat: site.lat,
      changes: changes.map(mapChange),
    };
    return json(body);
  });
}
