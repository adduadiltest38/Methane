import { NextResponse } from "next/server";
import { BadRequest } from "./params";

// Responses are cached at the edge for 10 minutes; data changes every ~3 h.
export const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
};

export function json(data: unknown, init: { status?: number } = {}) {
  return NextResponse.json(data, { status: init.status ?? 200, headers: CACHE_HEADERS });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Log name and message only. Error objects from URL parsing or the database driver can
    // carry the connection string (password included) as extra properties.
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`${e.name}: ${e.message}`);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
