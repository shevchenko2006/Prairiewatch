// Census 2023 geography, projected to NAD83 / UTM 14N local kilometres.
// Proposed equipment and scripted incident layers are NOT surveyed assets.
import type { Pt } from "./scoring";
import data from "./data/greenwood.json";
import { FIRE_PRESENTATION } from "./config";
import proj4 from 'proj4';

export const COUNTY = data.boundary as Pt[];

export const TOWNS = data.towns as { id: string; name: string; pos: Pt }[];

export const ROADS = data.roads.map((r, i) => ({ ...r, id: `census-${i}`, pts: r.pts as Pt[] }));

/** Distribution line (illustrative alignment). */
export const UTILITY_LINE: Pt[] = [[31, 25.5], [33, 26.5], [34.35, 27.8], [37, 29], [40, 30.5]];

export const IGNITION: Pt = [34.35, 27.8];
export const FAULT_POS: Pt = [34.35, 28];
export const REPORTER: Pt = [37.85, 26.8];
export const GOES_FOOTPRINT: Pt[] = [[32.8,29.4],[35.8,29.4],[35.8,26.4],[32.8,26.4]];

export interface Camera {
  id: string;
  name: string;
  pos: Pt;
  azimuth: number; // degrees from north, clockwise
  fov: number;
  range: number; // km
  selected?: boolean;
  note: string;
}
export const CAMERAS: Camera[] = [
  {
    id: "TWR-A",
    name: "Camera A",
    pos: [37.35, 24.3],
    azimuth: 320,
    fov: 110,
    range: 13,
    note: "Assumed mapped coverage toward the incident; first smoke evidence comes from this camera.",
  },
  {
    id: "TWR-B",
    name: "Camera B",
    pos: [42.85, 35.8],
    azimuth: 225,
    fov: 100,
    range: 16,
    selected: true,
    note: "Second assumed view provides an illustrative crossing bearing, not validated accuracy.",
  },
  {
    id: "TWR-C",
    name: "Camera C",
    pos: [20, 15],
    azimuth: 20,
    fov: 100,
    range: 14,
    note: "Ignition is beyond modeled range for this tower.",
  },
];

/** Area-weighted centroid in the bundled county's geographic UTM plane. */
export function polygonCentroid(points: readonly Pt[]): Pt {
  const origin = points[0];
  if (!origin || points.length < 3) throw new Error('County boundary unavailable');
  let area = 0, x = 0, y = 0;
  points.forEach((p,i) => {
    const q = points[(i+1)%points.length];
    const px = p[0]-origin[0], py = p[1]-origin[1], qx = q[0]-origin[0], qy = q[1]-origin[1];
    const cross = px*qy-qx*py;
    area += cross; x += (px+qx)*cross; y += (py+qy)*cross;
  });
  if (Math.abs(area) < 1e-10) throw new Error('County boundary has no area');
  return [origin[0]+x/(3*area),origin[1]+y/(3*area)];
}
export function geographicCoordinates(p: Pt): { lat: number; lon: number } {
  const result = proj4('+proj=utm +zone=14 +datum=NAD83 +units=m +no_defs', 'EPSG:4326', [data.origin[0]+p[0]*1000, data.origin[1]+p[1]*1000]);
  return { lon: result[0], lat: result[1] };
}
export const DOCK: Pt = polygonCentroid(COUNTY);
export const DOCK_COORDINATES = geographicCoordinates(DOCK);
export const DOCK_LABEL = 'PrairieWatch Central Drone Dock — Proposed';
export const RESOURCE_ROUTE = data.responseRoute as Pt[];
export const STATION: { name: string; pos: Pt } = { name: "Proposed staging near Eureka (illustrative)", pos: RESOURCE_ROUTE[0] ?? [20.58, 23.95] };

export const WIND_DEG = 40; // toward NE (scripted)

// ---------- helpers ----------
export function lerpPt(a: Pt, b: Pt, f: number): Pt {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
export function alongPath(pts: Pt[], f: number): Pt {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) return lerpPt(pts[i], pts[i + 1], seg[i] ? d / seg[i] : 0);
    d -= seg[i];
  }
  return pts[pts.length - 1];
}
const smooth = (x: number) => x * x * (3 - 2 * x);

// ---------- scripted fire perimeter (visualization only, not a forecast) ----------
const FIRE_KEYS: { t: number; s: number }[] = [
  { t: 0, s: 0.02 }, { t: 180, s: 0.1 }, { t: 300, s: 0.2 }, { t: 360, s: 0.32 },
  { t: 480, s: 0.55 }, { t: 600, s: 0.8 }, { t: 900, s: 1.15 }, { t: 1200, s: 1.6 }, { t: FIRE_PRESENTATION.finalT, s: 1.9 },
];
const N = 56;
function seeded(i: number, k: number) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function keyShape(k: number): Pt[] {
  const { s } = FIRE_KEYS[k];
  const w = ((90 - WIND_DEG) * Math.PI) / 180; // math angle
  const c: Pt = [IGNITION[0] + Math.cos(w) * s * 0.55, IGNITION[1] + Math.sin(w) * s * 0.55];
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const head = (1 + Math.cos(th - w)) / 2; // 1 downwind
    let r = s * (0.45 + 0.9 * head * head);
    const wob = 0.12 * (seeded(i, k) - 0.5) + 0.08 * Math.sin(th * 3 + k);
    r *= 1 + wob;
    out.push([c[0] + Math.cos(th) * r * 0.85, c[1] + Math.sin(th) * r]);
  }
  return out;
}
/** Shoelace area in local UTM km², shared by model calibration and readouts. */
export function polygonAreaKm2(polygon: readonly Pt[]): number {
  const origin = polygon[0];
  if (!origin || polygon.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    if (!p || !q) continue;
    twiceArea += (p[0] - origin[0]) * (q[1] - origin[1]) - (q[0] - origin[0]) * (p[1] - origin[1]);
  }
  return Math.abs(twiceArea) / 2;
}
const rawShapes = FIRE_KEYS.map((_, k) => keyShape(k));
const finalShape = rawShapes[rawShapes.length - 1];
const finalAreaKm2 = finalShape ? polygonAreaKm2(finalShape) : 0;
// Scale real geographic vertices about ignition, including their downwind shift.
// The entire smooth curve is resized; the displayed acreage is never overridden.
const footprintScale = finalAreaKm2 > 0
  ? Math.sqrt(FIRE_PRESENTATION.finalAcres * 4046.8564224 / 1e6 / finalAreaKm2) : 1;
const SHAPES: Pt[][] = rawShapes.map(shape => shape.map(p => [
  IGNITION[0] + (p[0] - IGNITION[0]) * footprintScale,
  IGNITION[1] + (p[1] - IGNITION[1]) * footprintScale,
]));

export function firePerimeter(t: number): Pt[] | null {
  if (t < 0) return null;
  const last = FIRE_KEYS.length - 1;
  if (t >= FIRE_KEYS[last].t) return SHAPES[last];
  let k = 0;
  while (FIRE_KEYS[k + 1].t <= t) k++;
  const f = smooth((t - FIRE_KEYS[k].t) / (FIRE_KEYS[k + 1].t - FIRE_KEYS[k].t));
  return SHAPES[k].map((p, i) => lerpPt(p, SHAPES[k + 1][i], f));
}
export function fireCenter(t: number): Pt {
  const p = firePerimeter(t);
  if (!p) return IGNITION;
  const sx = p.reduce((a, q) => a + q[0], 0) / p.length;
  const sy = p.reduce((a, q) => a + q[1], 0) / p.length;
  return [sx, sy];
}

// ---------- camera view (independent of fire growth) ----------
const VIEW_KEYS: { t: number; c: Pt; w: number }[] = [
  { t: 0, c: [35, 30], w: 27 },
  { t: 540, c: [35, 30], w: 27 },
  { t: 900, c: [35, 30], w: 29 },
  { t: 1500, c: [34.5, 30], w: 32 },
  { t: 2400, c: [34, 30], w: 35 },
];
export function autoView(t: number): { c: Pt; w: number } {
  const first = VIEW_KEYS[0];
  const last = VIEW_KEYS[VIEW_KEYS.length - 1];
  if (!first || !last) return { c: IGNITION, w: 30 };
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  const i = VIEW_KEYS.findIndex(x => x.t > t);
  const a = VIEW_KEYS[i - 1], b = VIEW_KEYS[i];
  if (!a || !b) return last;
  const f = smooth((t - a.t) / (b.t - a.t));
  return { c: lerpPt(a.c, b.c, f), w: a.w * Math.pow(b.w / a.w, f) };
}

// Bundled schematic drainage and field tracks; not surveyed geometry.
export const CREEKS: Pt[][] = [
  [[25,40],[27,37],[26,34],[29,31],[28,28],[30,25],[29,22],[32,19]],
  [[43,43],[41,40],[43,37],[40,34],[39,31],[40,28],[38,25],[39,22]],
];
export const FIELD_TRACKS: Pt[][] = Array.from({ length: 15 }, (_, i) => {
  const x = 20 + i * 2;
  return [[x,20],[x+0.1,28],[x-0.2,40]] as Pt[];
});
