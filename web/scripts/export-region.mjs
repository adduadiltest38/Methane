// Build the app's own basemap layer: Natural Earth 1:50m countries (public domain, via the
// world-atlas package) clipped to the region of interest, plus a label point per country.
// Usage: node scripts/export-region.mjs   -> public/geo/region.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const [W, S, E, N] = [22, 0, 75, 48]; // generous margin around the 34,12,63,38 region
const round = (v) => Math.round(v * 1000) / 1000;

function ringBBox(ring) {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [x, y] of ring) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
  }
  return [w, s, e, n];
}
const area = ([w, s, e, n]) => (e - w) * (n - s);
const overlaps = ([w, s, e, n]) => !(e < W || w > E || n < S || s > N);

const features = [];
const labels = [];
for (const f of feature(topo, topo.objects.countries).features) {
  const polys = f.geometry?.type === "Polygon" ? [f.geometry.coordinates]
    : f.geometry?.type === "MultiPolygon" ? f.geometry.coordinates : [];
  const kept = polys.filter((p) => overlaps(ringBBox(p[0])));
  if (!kept.length) continue;
  features.push({
    type: "Feature",
    properties: { name: f.properties.name },
    geometry: { type: "MultiPolygon", coordinates: kept.map((p) => p.map((r) => r.map(([x, y]) => [round(x), round(y)]))) },
  });
  const biggest = kept.map((p) => ringBBox(p[0])).sort((a, b) => area(b) - area(a))[0];
  if (area(biggest) > 4) {
    labels.push({ name: f.properties.name, position: [round((biggest[0] + biggest[2]) / 2), round((biggest[1] + biggest[3]) / 2)], area: Math.round(area(biggest)) });
  }
}
mkdirSync("public/geo", { recursive: true });
writeFileSync("public/geo/region.json", JSON.stringify({ type: "FeatureCollection", features, labels }));
console.log(`${features.length} countries, ${labels.length} labels`);
