export const CLASSES = [
  "likely_flare",
  "persistent_industrial",
  "transient_fire",
  "unknown",
] as const;

export type SiteClass = (typeof CLASSES)[number];

export const CLASS_LABEL: Record<SiteClass, string> = {
  likely_flare: "Likely gas flare",
  persistent_industrial: "Persistent industrial heat",
  transient_fire: "Transient fire",
  unknown: "Unclassified",
};

// RGB, chosen to stay distinguishable on a dark basemap and for common colour-vision deficiencies
export const CLASS_COLOR: Record<SiteClass, [number, number, number]> = {
  likely_flare: [255, 166, 0],
  persistent_industrial: [94, 172, 255],
  transient_fire: [230, 80, 120],
  unknown: [160, 160, 170],
};

export function isSiteClass(v: string): v is SiteClass {
  return (CLASSES as readonly string[]).includes(v);
}

export function rgb(c: SiteClass): string {
  const [r, g, b] = CLASS_COLOR[c];
  return `rgb(${r} ${g} ${b})`;
}
