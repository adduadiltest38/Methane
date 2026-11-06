import { isSiteClass, type SiteClass } from "./classes";

export class BadRequest extends Error {}

export function parseBbox(v: string | null): [number, number, number, number] | null {
  if (!v) return null;
  const parts = v.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new BadRequest("bbox must be west,south,east,north");
  }
  const [w, s, e, n] = parts as [number, number, number, number];
  if (w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) {
    throw new BadRequest("bbox out of range");
  }
  return [w, s, e, n];
}

export function parseClasses(v: string | null): SiteClass[] | null {
  if (!v) return null;
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = parts.filter((p) => !isSiteClass(p));
  if (bad.length) throw new BadRequest(`unknown class: ${bad.join(",")}`);
  return parts as SiteClass[];
}

export function parseNumber(v: string | null, min: number, max: number, fallback: number): number {
  if (v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequest(`invalid number: ${v}`);
  return Math.min(max, Math.max(min, n));
}

export function parseDate(v: string | null): Date | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v)) throw new BadRequest(`invalid date: ${v}`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequest(`invalid date: ${v}`);
  return d;
}

export function parseSiteId(v: string): number {
  if (!/^\d{1,9}$/.test(v)) throw new BadRequest("invalid site id");
  return Number(v);
}
