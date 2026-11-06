import type { NextRequest } from "next/server";
import { mapChange } from "@/lib/changes";
import { sql } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { parseDate, parseNumber } from "@/lib/params";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = req.nextUrl.searchParams;
    const since = parseDate(q.get("since")) ?? new Date(Date.now() - 30 * 86_400_000);
    const limit = Math.round(parseNumber(q.get("limit"), 1, 500, 50));
    const rows = await sql()`
      SELECT a.id, a.site_id, s.code AS site_code, s.country,
             ST_X(s.geom::geometry) AS lon, ST_Y(s.geom::geometry) AS lat,
             a.detected_at, a.direction, a.baseline, a.recent, a.z_score
        FROM activity_changes a JOIN sites s ON s.id = a.site_id
       WHERE a.detected_at >= ${since}
       ORDER BY a.detected_at DESC, a.id DESC
       LIMIT ${limit}
    `;
    return json({ changes: rows.map(mapChange) });
  });
}
