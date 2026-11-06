"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { FIRMS_ATTRIBUTION } from "@/lib/attribution";
import { CLASS_COLOR } from "@/lib/classes";
import type { RawDetection, SiteFeature } from "@/lib/types";

const DETAIL_STYLE_URL =
  process.env.NEXT_PUBLIC_BASEMAP_STYLE ?? "https://tiles.openfreemap.org/styles/dark";

export interface FlyTarget {
  lon: number;
  lat: number;
  key: number; // change to re-trigger
}

interface CountryLabel {
  name: string;
  position: [number, number];
  area: number;
}

// 5° graticule over the wider region, drawn like a navigation chart.
function graticule(): GeoJSON.FeatureCollection {
  const lines: GeoJSON.Feature[] = [];
  for (let lon = 20; lon <= 80; lon += 5)
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, -5], [lon, 50]] } });
  for (let lat = -5; lat <= 50; lat += 5)
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[20, lat], [80, lat]] } });
  return { type: "FeatureCollection", features: lines };
}

// Our own basemap: Natural Earth 1:50m borders on a night-navy chart. Renders without any
// tile server; the detailed street map is optional.
const CHART_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    land: { type: "geojson", data: "/geo/region.json" },
    grid: { type: "geojson", data: graticule() },
    region: {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[34, 12], [63, 12], [63, 38], [34, 38], [34, 12]] },
      },
    },
  },
  layers: [
    { id: "sea", type: "background", paint: { "background-color": "#050912" } },
    { id: "grid", type: "line", source: "grid", paint: { "line-color": "#101c30", "line-width": 0.7 } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": "#131d2d" } },
    {
      id: "coast-glow",
      type: "line",
      source: "land",
      paint: { "line-color": "#24406a", "line-width": 5, "line-blur": 5, "line-opacity": 0.55 },
    },
    { id: "borders", type: "line", source: "land", paint: { "line-color": "#31446a", "line-width": 0.8 } },
    {
      id: "region",
      type: "line",
      source: "region",
      paint: { "line-color": "#ff9f43", "line-width": 1, "line-opacity": 0.35, "line-dasharray": [3, 3] },
    },
  ],
};

function radiusFor(frp30d: number): number {
  // sqrt scaling so very bright sites don't swamp the map; metres
  return 1200 + Math.sqrt(Math.max(0, frp30d)) * 420;
}

export default function MapView({
  sites,
  detections,
  selectedId,
  flyTo,
  detailMap,
  onSelect,
}: {
  sites: SiteFeature[];
  detections: RawDetection[] | null;
  selectedId: number | null;
  flyTo: FlyTarget | null;
  detailMap: boolean;
  onSelect: (id: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [labels, setLabels] = useState<CountryLabel[]>([]);

  useEffect(() => {
    if (!container.current) return;
    const narrow = container.current.clientWidth < 640;
    const m = new maplibregl.Map({
      container: container.current,
      style: CHART_STYLE,
      center: [48.5, 25],
      zoom: narrow ? 3.4 : 4.3,
      minZoom: 2.5,
      maxZoom: 14,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: `${FIRMS_ATTRIBUTION} Borders: Natural Earth. Classification: FlareWatch (estimated).`,
      }),
      "bottom-right",
    );
    // start the (long) attribution collapsed behind its ⓘ button
    m.once("load", () => {
      container.current
        ?.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
        ?.classList.remove("maplibregl-compact-show");
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
    const o = new MapboxOverlay({ interleaved: false, layers: [] });
    m.addControl(o);
    map.current = m;
    overlay.current = o;

    fetch("/geo/region.json")
      .then((r) => r.json())
      // only label countries big enough to hold their name at the default zoom
      .then((d: { labels?: CountryLabel[] }) => setLabels((d.labels ?? []).filter((l) => l.area >= 18)))
      .catch(() => setLabels([]));

    return () => {
      m.remove();
      map.current = null;
      overlay.current = null;
    };
  }, []);

  // Switch between our chart basemap and the detailed street map; fall back if tiles fail.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!detailMap) {
      m.setStyle(CHART_STYLE);
      return;
    }
    let failed = false;
    const onError = () => {
      if (!failed && !m.isStyleLoaded()) {
        failed = true;
        m.setStyle(CHART_STYLE);
      }
    };
    m.on("error", onError);
    m.setStyle(DETAIL_STYLE_URL);
    return () => {
      m.off("error", onError);
    };
  }, [detailMap]);

  useEffect(() => {
    if (!flyTo || !map.current) return;
    map.current.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: Math.max(map.current.getZoom(), 8.5), speed: 1.6 });
  }, [flyTo]);

  useEffect(() => {
    const layers: Layer[] = [];
    if (!detailMap && labels.length) {
      layers.push(
        new TextLayer<CountryLabel>({
          id: "country-labels",
          data: labels,
          getPosition: (d) => d.position,
          getText: (d) => d.name.toUpperCase(),
          getSize: (d) => (d.area > 60 ? 13 : 11),
          getColor: [120, 136, 162, 150],
          fontFamily: "Barlow Condensed, Barlow, sans-serif",
          fontWeight: 600,
          characterSet: "auto",
          fontSettings: { sdf: false },
          sizeUnits: "pixels",
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
        }),
      );
    }
    if (detections && detections.length) {
      layers.push(
        new HeatmapLayer<RawDetection>({
          id: "detections-heat",
          data: detections,
          getPosition: (d) => [d.lon, d.lat],
          getWeight: (d) => Math.max(1, d.frp),
          radiusPixels: 28,
          intensity: 1.2,
          threshold: 0.04,
          colorRange: [
            [255, 210, 122, 30],
            [255, 190, 100, 90],
            [255, 159, 67, 150],
            [250, 120, 55, 190],
            [242, 84, 45, 220],
            [200, 40, 30, 240],
          ],
        }),
      );
    }
    // draw big/bright sites first so small ones stay visible on top
    const ordered = [...sites].sort((a, b) => b.properties.frp_30d - a.properties.frp_30d);
    const alphaFor = (f: SiteFeature) => (f.properties.classification === "unknown" ? 0.55 : 1);
    layers.push(
      new ScatterplotLayer<SiteFeature>({
        id: "sites-halo",
        data: ordered,
        radiusUnits: "meters",
        radiusMinPixels: 5,
        radiusMaxPixels: 60,
        stroked: false,
        getPosition: (f) => f.geometry.coordinates,
        getRadius: (f) => radiusFor(f.properties.frp_30d) * 2.4,
        getFillColor: (f) => {
          const [r, g, b] = CLASS_COLOR[f.properties.classification];
          return [r, g, b, Math.round(38 * alphaFor(f))];
        },
      }),
      new ScatterplotLayer<SiteFeature>({
        id: "sites",
        data: ordered,
        pickable: true,
        stroked: true,
        filled: true,
        radiusUnits: "meters",
        radiusMinPixels: 2.2,
        radiusMaxPixels: 26,
        lineWidthUnits: "pixels",
        getPosition: (f) => f.geometry.coordinates,
        getRadius: (f) => radiusFor(f.properties.frp_30d),
        getFillColor: (f) => {
          const [r, g, b] = CLASS_COLOR[f.properties.classification];
          return [r, g, b, f.properties.id === selectedId ? 255 : Math.round(225 * alphaFor(f))];
        },
        getLineColor: (f) => (f.properties.id === selectedId ? [255, 255, 255, 255] : [6, 10, 17, 160]),
        getLineWidth: (f) => (f.properties.id === selectedId ? 2.5 : 0.6),
        updateTriggers: {
          getFillColor: [selectedId],
          getLineColor: [selectedId],
          getLineWidth: [selectedId],
        },
        onClick: (info) => {
          onSelectRef.current(info.object ? info.object.properties.id : null);
          return true;
        },
      }),
    );
    overlay.current?.setProps({
      layers,
      getTooltip: ({ object }) => {
        const f = object as SiteFeature | null;
        if (!f || !f.properties) return null;
        const p = f.properties;
        return {
          html: `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.4">
            <div style="color:#e6ebf3">${p.code}${p.country ? ` · ${p.country}` : ""}</div>
            <div style="color:#ffd27a">${p.frp_30d.toFixed(1)} MW FRP · 30 d</div></div>`,
          style: {
            background: "#0b111c",
            border: "1px solid #233149",
            padding: "6px 8px",
            borderRadius: "0",
          },
        };
      },
    });
  }, [sites, detections, selectedId, labels, detailMap]);

  // maplibre-gl.css sets `position: relative` on the map container (unlayered, so it beats
  // Tailwind utilities); size it via a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map of satellite-detected sites" />
    </div>
  );
}
