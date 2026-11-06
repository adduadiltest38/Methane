"use client";

import { useEffect, useState } from "react";
import { ago, nextIngest, utcTime } from "@/lib/format";
import type { Meta } from "@/lib/types";

const CYCLE_MS = 3 * 60 * 60 * 1000;

// Ring that empties as the next scheduled ingest approaches.
function Ring({ fraction }: { fraction: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--color-line)" strokeWidth="2" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="url(#heat)"
        strokeWidth="2"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="heat" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-heat-1)" />
          <stop offset="1" stopColor="var(--color-heat-3)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function PassClock() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  // null until mounted: the server and the browser would otherwise render different times
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setMeta)
      .catch(() => setError(true));
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const next = now ? nextIngest(now) : null;
  const remaining = now && next ? next.getTime() - now.getTime() : 0;
  const mins = Math.max(0, Math.round(remaining / 60000));

  return (
    <div className="flex items-center gap-3">
      {meta?.demo_data && (
        <span className="label whitespace-nowrap border border-heat-2/50 px-1.5 py-0.5 text-heat-1!">
          <span className="sm:hidden">Demo data</span>
          <span className="hidden sm:inline">Synthetic demo data</span>
        </span>
      )}
      <Ring fraction={remaining / CYCLE_MS} />
      <div className="leading-tight">
        <div className="label text-[10px]!">Last satellite ingest</div>
        <div className="readout text-[12px] text-fg">
          {error ? "unavailable" : meta === null ? "…" : meta.last_success ? ago(meta.last_success) : "none yet"}
          {next && (
            <span className="text-faint">
              {" "}
              · next {utcTime(next)} UTC ({mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
