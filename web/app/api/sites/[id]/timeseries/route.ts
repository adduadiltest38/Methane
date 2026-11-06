import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { BadRequest, parseDate, parseSiteId } from "@/lib/params";
import type { TimeseriesPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseSiteId((await ctx.params).id);
    const q = req.nextUrl.searchParams;
    const to = parseDate(q.get("to")) ?? new Date();
    const from = parseDate(q.get("from")) ?? new Date(to.getTime() - 90 * DAY_MS);
    if (from > to) throw new BadRequest("from must be before to");
    if (to.getTime() - from.getTime() > 400 * DAY_MS) throw new BadRequest("range too long");

    const rows = await sql()`
      -- zero-filled so gaps without detections show as 0 rather than being interpolated
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             COALESCE(s.detections, 0) AS detections,
             COALESCE(s.night_detections, 0) AS night_detections,
             COALESCE(s.frp_sum, 0)::float8 AS frp_sum,
             COALESCE(s.frp_max, 0)::float8 AS frp_max
        FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d(day)
        LEFT JOIN site_daily_stats s ON s.site_id = ${id} AND s.day = d.day::date
       ORDER BY d.day
    `;
    if (!rows.some((r) => r.detections > 0)) {
      return json({ site_id: id, from: from.toISOString(), to: to.toISOString(), series: [] });
    }
    const series: TimeseriesPoint[] = rows.map((r) => ({
      day: r.day,
      detections: r.detections,
      night_detections: r.night_detections,
      frp_sum: r.frp_sum,
      frp_max: r.frp_max,
    }));
    return json({ site_id: id, from: from.toISOString(), to: to.toISOString(), series });
  });
}
