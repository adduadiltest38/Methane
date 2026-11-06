# Data sources, licenses & attribution

FlareWatch uses only free, publicly available satellite data. It does not join any dataset that maps sites to operators or companies.

## NASA FIRMS — VIIRS 375 m active fire detections

- **Products:** `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` (near real-time, ~3 h latency; also used for the initial 90-day backfill). `VIIRS_SNPP_SP` (standard processing) can be pulled for older periods with `BACKFILL_SOURCES=VIIRS_SNPP_SP`; don't mix it with NRT for the same dates, or detections are counted twice.
- **Access:** FIRMS Area API, free `MAP_KEY` from <https://firms.modaps.eosdis.nasa.gov/api/>.
- **License:** NASA data are openly shared without restriction (NASA Earth Science Data and Information Policy).
- **Required acknowledgement (displayed on the map and About page):**

  > We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Observing System Data and Information System (EOSDIS).

## NASA ORNL DAAC — "Methane Flaring Sites VIIRS"

- **What:** annual list of satellite-identified gas flare locations. Used only as reference labels for the classifier (`reference_flares` table). Only coordinates, year and flare type are loaded.
- **Access:** <https://daac.ornl.gov> (search "Methane Flaring Sites VIIRS").
- **Citation:** **TODO — copy the exact citation string and DOI from the dataset landing page** and paste it here, in `web/lib/attribution.ts` (`ORNL_CITATION`), and nowhere else needs changing. The ORNL DAAC host was not reachable from the build environment, so the citation has not been filled in from memory.

## NASA FIRMS Static Thermal Anomalies (STA)

- Secondary reference for known persistent heat sources. Not yet ingested; check current availability on the FIRMS website.

## Copernicus Sentinel-5P TROPOMI CH₄ (Phase 2, not yet implemented)

- Monthly regional methane column (`COPERNICUS/S5P/OFFL/L3_CH4` on Google Earth Engine, non-commercial account).
- **Required attribution:** "Contains modified Copernicus Sentinel data [Year]."

## Basemap

- Dark vector style from **OpenFreeMap** (<https://openfreemap.org>), built on OpenMapTiles and OpenStreetMap data.
- **Attribution:** "© OpenMapTiles © OpenStreetMap contributors" (rendered automatically by MapLibre's attribution control).

## Country boundaries (optional)

- Natural Earth Admin 0 countries (public domain), loaded via `python -m flarewatch.cli load-countries <file.geojson>` and used only to label each site with a country name.

---

*Educational demo. Satellite-derived estimates only — may contain errors. Not official data. Not affiliated with or endorsed by NASA or the European Union.*
