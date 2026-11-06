import { ATTRIBUTION, DISCLAIMER } from "./attribution";
import { sql } from "./db";
import type { Meta } from "./types";

export async function getMeta(): Promise<Meta> {
  const db = sql();
  const sources = await db`
    SELECT source, MAX(finished_at) AS last_success
      FROM ingest_runs
     WHERE status = 'success'
     GROUP BY source
     ORDER BY source
  `;
  const classRows = await db`
    SELECT classification, COUNT(*)::int AS n FROM sites GROUP BY classification
  `;
  const class_counts: Record<string, number> = {};
  for (const r of classRows) class_counts[r.classification] = r.n;
  const count = Object.values(class_counts).reduce((a, b) => a + b, 0);
  const [{ n: detections_24h }] = (await db`
    SELECT COUNT(*)::int AS n FROM detections WHERE acq_time >= now() - interval '24 hours'
  `) as unknown as [{ n: number }];
  const last = sources
    .map((r) => r.last_success as Date | null)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    last_success: last?.toISOString() ?? null,
    sources: sources.map((r) => ({
      source: r.source,
      last_success: r.last_success?.toISOString() ?? null,
    })),
    demo_data: sources.some((r) => r.source === "DEMO_SYNTHETIC"),
    site_count: count,
    class_counts,
    detections_24h,
    attribution: ATTRIBUTION,
    disclaimer: DISCLAIMER,
  };
}
