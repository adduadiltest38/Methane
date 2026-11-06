import type { SiteClass } from "./classes";

export interface SiteProperties {
  id: number;
  code: string;
  country: string | null;
  classification: SiteClass;
  class_confidence: number | null;
  matches_reference: boolean;
  observation_count: number;
  observed_days: number;
  first_seen: string | null;
  last_seen: string | null;
  frp_30d: number;
  detections_30d: number;
}

export interface SiteFeature {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SiteProperties;
}

export interface SiteCollection {
  type: "FeatureCollection";
  features: SiteFeature[];
}

export interface ActivityChange {
  id: number;
  site_id: number;
  site_code: string;
  country: string | null;
  lon: number;
  lat: number;
  detected_at: string;
  direction: "increase" | "decrease" | "new_site" | "inactive";
  baseline: number | null;
  recent: number | null;
  z_score: number | null;
}

export interface SiteDetail extends SiteProperties {
  lon: number;
  lat: number;
  changes: ActivityChange[];
}

export interface TimeseriesPoint {
  day: string;
  detections: number;
  night_detections: number;
  frp_sum: number;
  frp_max: number;
}

export interface Meta {
  last_success: string | null;
  sources: { source: string; last_success: string | null }[];
  demo_data: boolean;
  site_count: number;
  class_counts: Record<string, number>;
  detections_24h: number;
  attribution: Record<string, string>;
  disclaimer: string;
}

export interface RawDetection {
  lon: number;
  lat: number;
  frp: number;
}
