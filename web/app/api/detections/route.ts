import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { parseBbox, parseNumber } from "@/lib/params";
import type { RawDetection } from "@/lib/types";

export const dynamic = "force-dynamic";

// Raw detections for the optional heatmap layer (default: last 48 h).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = req.nextUrl.searchParams;
    const hours = parseNumber(q.get("hours"), 1, 168, 48);
    const [w, s, e, n] = parseBbox(q.get("bbox")) ?? [34, 12, 63, 38];
    const rows = await sql()`
      SELECT ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat,
             COALESCE(frp, 0)::float8 AS frp
        FROM detections
       WHERE acq_time >= now() - make_interval(hours => ${Math.round(hours)})
         AND geom::geometry && ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)
       LIMIT 50000
    `;
    const detections: RawDetection[] = rows.map((r) => ({ lon: r.lon, lat: r.lat, frp: r.frp }));
    return json({ hours, detections });
  });
}
