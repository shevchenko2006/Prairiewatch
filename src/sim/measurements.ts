import { firePerimeter, polygonAreaKm2 } from './geo';
import type { SimState } from './engine';
import type { Pt } from './scoring';

const SQ_METERS_PER_ACRE = 4046.8564224;
/** Local EPSG:26914 kilometres, before any decorative display projection.
 * UTM planar area/distance are approximate ground measurements, not surveyed accuracy.
 */
export function measurePolygon(polygon: readonly Pt[]) {
  const origin = polygon[0];
  if (!origin || polygon.length < 3) return { squareMeters: 0, acres: 0, hectares: 0, widthMeters: 0 };
  let widthKm = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    if (!p || !q) continue;
    for (const other of polygon.slice(i + 1)) widthKm = Math.max(widthKm, Math.hypot(p[0] - other[0], p[1] - other[1]));
  }
  const squareMeters = polygonAreaKm2(polygon) * 1e6;
  return { squareMeters, acres: squareMeters / SQ_METERS_PER_ACRE, hectares: squareMeters / 10000, widthMeters: widthKm * 1000 };
}
/** The only polygon exposed to the map and readout; ground truth stays hidden. */
export function visibleFireFootprint(s: Pick<SimState, 'scenario' | 'incidentAt' | 't'>): Pt[] | null {
  return s.scenario === 'A' && s.incidentAt != null ? firePerimeter(s.t) : null;
}
export function formatArea(value: number) {
  return value < 1 ? '<1' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
/** Nice 1/2/5 ground distance fitting within a fixed, legible screen width. */
export function geographicScale(kmPerPixel: number, maxPixels = 110) {
  const limit = kmPerPixel * maxPixels * 1000;
  if (!(limit > 0)) return { meters: 0, pixels: 0, label: '—' };
  const power = 10 ** Math.floor(Math.log10(limit));
  const meters = (limit / power >= 5 ? 5 : limit / power >= 2 ? 2 : 1) * power;
  return { meters, pixels: meters / (kmPerPixel * 1000), label: meters < 1000 ? `${meters} m` : `${meters / 1000} km` };
}