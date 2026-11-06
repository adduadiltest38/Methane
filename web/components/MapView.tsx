"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { FIRMS_ATTRIBUTION } from "@/lib/attribution";
import { CLASS_COLOR } from "@/lib/classes";
import type { RawDetection, SiteFeature } from "@/lib/types";

const STYLE_URL =
  process.env.NEXT_PUBLIC_BASEMAP_STYLE ?? "https://tiles.openfreemap.org/styles/dark";

// Used if the basemap style can't be fetched, so sites still render on a plain background.
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#11151c" } }],
};

export interface FlyTarget {
  lon: number;
  lat: number;
  key: number; // change to re-trigger
}

function radiusFor(frp30d: number): number {
  // sqrt scaling so very bright sites don't swamp the map; metres
  return 1500 + Math.sqrt(Math.max(0, frp30d)) * 450;
}

export default function MapView({
  sites,
  detections,
  selectedId,
  flyTo,
  onSelect,
}: {
  sites: SiteFeature[];
  detections: RawDetection[] | null;
  selectedId: number | null;
  flyTo: FlyTarget | null;
  onSelect: (id: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [49, 27],
      zoom: 4.2,
      minZoom: 2,
      maxZoom: 14,
      attributionControl: false,
    });
    m.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: `${FIRMS_ATTRIBUTION} Classification: FlareWatch (estimated).`,
      }),
      "bottom-right",
    );
    let fellBack = false;
    m.on("error", (e) => {
      if (!fellBack && !m.isStyleLoaded() && !m.loaded()) {
        fellBack = true;
        console.warn("Basemap style failed to load; using plain background", e.error);
        m.setStyle(FALLBACK_STYLE);
      }
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const o = new MapboxOverlay({ interleaved: false, layers: [] });
    m.addControl(o);
    map.current = m;
    overlay.current = o;
    return () => {
      m.remove();
      map.current = null;
      overlay.current = null;
    };
  }, []);

  useEffect(() => {
    if (!flyTo || !map.current) return;
    map.current.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: Math.max(map.current.getZoom(), 9) });
  }, [flyTo]);

  useEffect(() => {
    const layers = [];
    if (detections && detections.length) {
      layers.push(
        new HeatmapLayer<RawDetection>({
          id: "detections-heat",
          data: detections,
          getPosition: (d) => [d.lon, d.lat],
          getWeight: (d) => Math.max(1, d.frp),
          radiusPixels: 25,
          intensity: 1,
          threshold: 0.03,
        }),
      );
    }
    layers.push(
      new ScatterplotLayer<SiteFeature>({
        id: "sites",
        data: sites,
        pickable: true,
        stroked: true,
        filled: true,
        radiusUnits: "meters",
        radiusMinPixels: 3,
        radiusMaxPixels: 40,
        lineWidthUnits: "pixels",
        getPosition: (f) => f.geometry.coordinates,
        getRadius: (f) => radiusFor(f.properties.frp_30d),
        getFillColor: (f) => {
          const [r, g, b] = CLASS_COLOR[f.properties.classification];
          return [r, g, b, f.properties.id === selectedId ? 255 : 190];
        },
        getLineColor: (f) => (f.properties.id === selectedId ? [255, 255, 255, 255] : [0, 0, 0, 120]),
        getLineWidth: (f) => (f.properties.id === selectedId ? 2.5 : 0.5),
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
          text: `${p.code}${p.country ? ` · ${p.country}` : ""}\n${p.frp_30d.toFixed(1)} MW FRP (30 d)`,
        };
      },
    });
  }, [sites, detections, selectedId]);

  // maplibre-gl.css sets `position: relative` on the map container (unlayered, so it beats
  // Tailwind utilities); size it via a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map of satellite-detected sites" />
    </div>
  );
}
