"use client";

import { useEffect, useState } from "react";
import type { Meta } from "@/lib/types";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default function LastUpdated() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setMeta)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
      {meta?.demo_data && (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
          Synthetic demo data
        </span>
      )}
      <span>
        {error
          ? "Data status unavailable"
          : meta === null
            ? "Loading…"
            : meta.last_success
              ? `Last updated: ${ago(meta.last_success)}`
              : "No data ingested yet"}
      </span>
    </div>
  );
}
