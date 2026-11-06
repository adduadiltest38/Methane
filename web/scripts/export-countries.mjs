// Export Natural Earth 1:50m country polygons (via the world-atlas package) as GeoJSON,
// for `python -m flarewatch.cli load-countries data/countries.geojson`.
// Usage: node scripts/export-countries.mjs [out.geojson]
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const fc = feature(topo, topo.objects.countries);
for (const f of fc.features) f.properties = { NAME: f.properties.name };
const out = process.argv[2] ?? "../data/countries.geojson";
writeFileSync(out, JSON.stringify(fc));
console.log(`wrote ${fc.features.length} countries to ${out}`);
