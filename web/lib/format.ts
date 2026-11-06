export function dms(value: number, pos: string, neg: string): string {
  const hemi = value >= 0 ? pos : neg;
  const v = Math.abs(value);
  const d = Math.floor(v);
  const mFloat = (v - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  const [mm, ss] = s === 60 ? [m + 1, 0] : [m, s];
  return `${d}°${String(mm).padStart(2, "0")}′${String(ss).padStart(2, "0")}″${hemi}`;
}

export function isoDay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export function utcTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// The ingest workflow runs at minute 17 of every third hour (UTC).
export function nextIngest(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  for (let i = 0; i < 4 * 60; i++) {
    if (d.getUTCMinutes() === 17 && d.getUTCHours() % 3 === 0 && d > now) return d;
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return d;
}

export function compact(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
