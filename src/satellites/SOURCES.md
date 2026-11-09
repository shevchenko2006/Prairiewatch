# Orbital and Earth outline sources

- CelesTrak GP JSON: https://celestrak.org/NORAD/documentation/gp-data-formats.php
- Cache policy: https://celestrak.org/usage-policy.php (two-hour update interval; documented CATNR queries only).
- Catalog identities: https://celestrak.org/norad/elements/table.php?GROUP=goes and weather group; GOES-19 60133, GOES-18 51850, Suomi NPP 37849, NOAA-20 43013, NOAA-21 54234.
- VIIRS missions: NOAA JPSS-1 / JPSS-2 documentation and Suomi NPP mission documentation; GOES uses ABI, not VIIRS.
- Earth country-outline geometry: Natural Earth-derived GeoJSON from https://github.com/johan/world.geo.json/blob/master/countries.geo.json, downloaded and simplified to two decimals. This is a visual Earth outline, not precise borders or topography. No invented terrain.

SGP4 propagation uses satellite.js; space trajectory is drawn in the Earth-fixed frame at the selected UTC, while ground track uses Earth's rotation at each future sample. Display altitudes compressed to 35% and satellite symbols exaggerated, explicitly labeled not to scale; displayed numerical positions remain unmodified. Demo equatorial GOES longitude/altitude is an explicit illustrative assumption, stored separately from fetched elements. No imagery, fire-detection API, coverage guarantee or scoring change.