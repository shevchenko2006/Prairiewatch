// Shared registry for the proposed 15-camera county tower network.
// Every location, status and feed is simulated; this is a planned deployment,
// not an installed network. Scenario events, map markers and cards all read
// these stable IDs so they never drift apart.
import { CAMERAS, FAULT_POS, IGNITION, COUNTY, geographicCoordinates } from './geo';
import { C_TARGET } from './drone-verification';
import type { Pt } from './scoring';
import type { ScenarioId, SimState } from './engine';

export interface TowerCamera {
  id: string; // TW-01 … TW-15
  name: string;
  pos: Pt; // local UTM km, simulated placement
  /** Legacy storyline camera this tower stands in for, if any. */
  legacyId?: 'TWR-A' | 'TWR-B' | 'TWR-C';
  note: string;
}

const legacy = (id: 'TWR-A' | 'TWR-B' | 'TWR-C') => CAMERAS.find(c => c.id === id) ?? { pos: [20,15] as Pt };

/** Stable mapping between storyline cameras and network tower IDs. */
export const LEGACY_TOWER_ID = { 'TWR-A': 'TW-01', 'TWR-B': 'TW-02', 'TWR-C': 'TW-03' } as const;

export const TOWER_NETWORK: TowerCamera[] = [
  { id: 'TW-01', name: 'Camera A tower', pos: legacy('TWR-A').pos, legacyId: 'TWR-A', note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-02', name: 'Camera B tower', pos: legacy('TWR-B').pos, legacyId: 'TWR-B', note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-03', name: 'Camera C tower', pos: legacy('TWR-C').pos, legacyId: 'TWR-C', note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-04', name: 'Southwest overlap', pos: [12.66, 9.865], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-05', name: 'Southern edge', pos: [40.067, 4.516], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-06', name: 'Southeast overlap', pos: [39.061, 10.566], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-07', name: 'West pasture', pos: [5.875, 12.816], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-08', name: 'Western central', pos: [5.654, 33.301], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-09', name: 'Central south', pos: [25.899, 28.913], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-10', name: 'Northwest overlap', pos: [8.226, 40.524], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-11', name: 'Central north', pos: [24.866, 36.517], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-12', name: 'Northeast overlap', pos: [46.256, 49.1], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-13', name: 'Northwest edge', pos: [14.742, 51.929], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-14', name: 'Northern central', pos: [27.766, 56.438], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
  { id: 'TW-15', name: 'Northern east', pos: [37.359, 54.725], note: 'Proposed 360° rotating camera; 6–10 mile geometric radius, visibility unvalidated.' },
];

export const PLANNED_TOWER_COUNT = TOWER_NETWORK.length;

/** Simulated online status. Camera B (TW-07) is offline in Scenario C's storyline. */
export function towerOnline(id: string, scenario: ScenarioId): boolean {
  return !(scenario === 'C' && id === LEGACY_TOWER_ID['TWR-B']);
}

export function onlineTowerCount(scenario: ScenarioId): number {
  return TOWER_NETWORK.filter(t => towerOnline(t.id, scenario)).length;
}

/** Simulated last observation time (scenario seconds) for a tower, or null. */
export function lastObservation(s: SimState, id: string): number | null {
  const a = LEGACY_TOWER_ID['TWR-A'], b = LEGACY_TOWER_ID['TWR-B'];
  if (id === a) {
    if (s.scenario === 'A') return s.fired.includes('cam2') ? 300 : s.fired.includes('cam1') ? 180 : null;
    if (s.scenario === 'B') return s.fired.includes('clear') ? 180 : null;
    return s.fired.includes('c-cam2') ? 30 : s.fired.includes('c-cam1') ? 0 : null;
  }
  if (id === b) return s.scenario === 'A' && s.fired.includes('cam-b') ? 360 : null;
  return null;
}

export interface IncidentEstimate { pos: Pt; approximate: boolean; label: string }

/** Estimated incident location per scenario; uncertainty is labeled, never hidden. */
export function incidentEstimate(s: SimState): IncidentEstimate {
  if (s.scenario === 'B') return { pos: FAULT_POS, approximate: false, label: 'Reported transformer location' };
  if (s.scenario === 'C') return { pos: C_TARGET, approximate: !s.verification.locationAttached, label: 'Suspected plume source area' };
  return { pos: IGNITION, approximate: s.alertAt == null, label: 'Estimated fire location' };
}

export interface TowerDistance { tower: TowerCamera; km: number }

/** All towers sorted by straight-line distance from a point. Distance never implies visibility. */
export function towersByDistance(pos: Pt): TowerDistance[] {
  return TOWER_NETWORK.map(tower => ({ tower, km: Math.hypot(tower.pos[0] - pos[0], tower.pos[1] - pos[1]) }))
    .sort((a, b) => a.km - b.km);
}

export const NEARBY_COUNT = 3;

/** Towers actively observing the incident in the current scripted state. */
export function observingTowerIds(s: SimState): Set<string> {
  const ids = new Set<string>();
  const a = LEGACY_TOWER_ID['TWR-A'], b = LEGACY_TOWER_ID['TWR-B'];
  if (s.scenario === 'A') {
    if (s.fired.includes('cam1') || s.fired.includes('cam2')) ids.add(a);
    if (s.fired.includes('cam-b')) ids.add(b);
  } else if (s.scenario === 'B') {
    if (s.fired.includes('clear')) ids.add(a); // checked view, found clear
  } else {
    if (s.fired.includes('c-cam1') || s.fired.includes('c-cam2')) ids.add(a);
  }
  return ids;
}

/** Why a tower can or cannot provide a usable view — coverage/terrain kept separate from distance. */
export function viewNote(s: SimState, id: string): string {
  const a = LEGACY_TOWER_ID['TWR-A'], b = LEGACY_TOWER_ID['TWR-B'];
  if (s.scenario === 'C') {
    if (id === a) return 'Sees the plume above the ridge, but fictional terrain obscures the source; a single bearing is not triangulation.';
    if (id === b) return 'Offline in this simulated setup — no feed available.';
    return 'Geometric reach may overlap here, but the fictional ridge prevents a usable ground-source view in this scenario.';
  }
  if (id === a || id === b || id === LEGACY_TOWER_ID['TWR-C']) return TOWER_NETWORK.find(t => t.id === id)?.note ?? '';
  return 'Monitoring; no detection in this scenario (simulated).';
}

export function towerCoordinates(id: string): { lat: number; lon: number } {
  const t = TOWER_NETWORK.find(x => x.id === id);
  if (!t) throw new Error('Unknown tower '+id);
  return geographicCoordinates(t.pos);
}

export const CAMERA_COVERAGE = { minMiles:6, maxMiles:10, rotationDegrees:360, kmPerMile:1.609344, sampleStepKm:.5 } as const;
export function insideCounty(p:Pt):boolean {
  let inside=false;
  for(let i=0,j=COUNTY.length-1;i<COUNTY.length;j=i++) {
    const a=COUNTY[i],b=COUNTY[j];if(!a||!b)continue;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
/** Uniform interior samples estimate reach; densified boundary samples check edge gaps separately. */
export const COVERAGE_SAMPLES:Pt[]=(()=>{
 const pts:Pt[]=[];
 for(let x=.25;x<51.1;x+=.5)for(let y=.25;y<64.1;y+=.5)if(insideCounty([x,y]))pts.push([x,y]);
 return pts;
})();
export const COVERAGE_BOUNDARY:Pt[]=COUNTY.flatMap((a,i)=>{const b=COUNTY[(i+1)%COUNTY.length];if(!b)return [];const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1));return Array.from({length:steps},(_,n)=>[a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps] as Pt);});
export function coverageCount(p:Pt,miles:number,scenario?:ScenarioId):number {
 const radius=miles*CAMERA_COVERAGE.kmPerMile;
 return TOWER_NETWORK.filter(t=>(!scenario||towerOnline(t.id,scenario))&&Math.hypot(t.pos[0]-p[0],t.pos[1]-p[1])<=radius).length;
}
export function coverageStats(miles:number,scenario?:ScenarioId) {
 const counts=COVERAGE_SAMPLES.map(p=>coverageCount(p,miles,scenario));
 return {coveredPercent:100*counts.filter(n=>n>0).length/counts.length,overlapPercent:100*counts.filter(n=>n>1).length/counts.length,gaps:COVERAGE_SAMPLES.filter((_,i)=>counts[i]===0),sampleCount:counts.length};
}
