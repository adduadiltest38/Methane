// Display strings required by the project guardrails. Keep wording neutral.

export const DISCLAIMER =
  "Educational demo. Satellite-derived estimates only — may contain errors. Not official data. Not affiliated with or endorsed by NASA or the European Union.";

export const FIRMS_ATTRIBUTION =
  "We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Observing System Data and Information System (EOSDIS).";

// TODO: paste the exact citation (with DOI) from the ORNL DAAC dataset page.
// It could not be retrieved from the build environment, so it is not filled in from memory.
export const ORNL_CITATION =
  'NASA ORNL DAAC — "Methane Flaring Sites VIIRS" (reference list of satellite-identified gas flare locations). Full citation and DOI: see the dataset page at https://daac.ornl.gov.';

export const COPERNICUS_ATTRIBUTION = (year: number) =>
  `Contains modified Copernicus Sentinel data ${year}.`;

export const BASEMAP_ATTRIBUTION = "© OpenMapTiles © OpenStreetMap contributors";

export const ATTRIBUTION = {
  firms: FIRMS_ATTRIBUTION,
  reference: ORNL_CITATION,
  basemap: BASEMAP_ATTRIBUTION,
};
