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

export const CLASS_SHORT: Record<SiteClass, string> = {
  likely_flare: "Flare",
  persistent_industrial: "Industrial",
  transient_fire: "Fire",
  unknown: "Unclassified",
};

// amber (heat), ice (cool persistent), coral (short-lived fire), slate (no call)
export const CLASS_COLOR: Record<SiteClass, [number, number, number]> = {
  likely_flare: [255, 171, 64],
  persistent_industrial: [124, 199, 255],
  transient_fire: [255, 93, 115],
  unknown: [107, 122, 147],
};

export function isSiteClass(v: string): v is SiteClass {
  return (CLASSES as readonly string[]).includes(v);
}

export function rgb(c: SiteClass, alpha = 1): string {
  const [r, g, b] = CLASS_COLOR[c];
  return alpha === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}
