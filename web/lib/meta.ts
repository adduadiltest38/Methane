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
  const [{ count }] = (await db`SELECT COUNT(*)::int AS count FROM sites`) as unknown as [
    { count: number },
  ];
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
    attribution: ATTRIBUTION,
    disclaimer: DISCLAIMER,
  };
}
