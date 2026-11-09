import { describe, expect, it } from 'vitest';
import { initialState, nextEvent } from '@/sim/engine';
import { LEGACY_TOWER_ID, NEARBY_COUNT, PLANNED_TOWER_COUNT, TOWER_NETWORK, incidentEstimate, lastObservation, observingTowerIds, onlineTowerCount, towerOnline, towersByDistance, viewNote, CAMERA_COVERAGE, COVERAGE_SAMPLES, COVERAGE_BOUNDARY, insideCounty, coverageCount, coverageStats } from '@/sim/tower-network';
import { CAMERAS, IGNITION } from '@/sim/geo';
import { C_TARGET } from '@/sim/drone-verification';

describe('Proposed 15-camera tower network', () => {
  it('registers exactly 15 towers with unique stable IDs TW-01…TW-15', () => {
    expect(PLANNED_TOWER_COUNT).toBe(15);
    expect(TOWER_NETWORK.map(t => t.id)).toEqual(Array.from({ length: 15 }, (_, i) => `TW-${String(i + 1).padStart(2, '0')}`));
  });
  it('maps storyline cameras to stable tower IDs and shared positions', () => {
    expect(LEGACY_TOWER_ID['TWR-A']).toBe('TW-01');
    expect(LEGACY_TOWER_ID['TWR-B']).toBe('TW-02');
    for (const legacyId of ['TWR-A', 'TWR-B', 'TWR-C'] as const) {
      const tower = TOWER_NETWORK.find(t => t.id === LEGACY_TOWER_ID[legacyId]);
      expect(tower?.pos).toEqual(CAMERAS.find(c => c.id === legacyId)?.pos);
    }
  });
  it('keeps planned count at 15 while Camera B is offline only in Scenario C', () => {
    expect(towerOnline('TW-02', 'A')).toBe(true);
    expect(towerOnline('TW-02', 'B')).toBe(true);
    expect(towerOnline('TW-02', 'C')).toBe(false);
    expect(onlineTowerCount('C')).toBe(14);
    expect(onlineTowerCount('A')).toBe(15);
  });
  it('sorts all towers by distance and flags the nearest three without implying visibility', () => {
    const sorted = towersByDistance(IGNITION);
    expect(sorted).toHaveLength(15);
    expect(sorted[0]?.tower.id).toBe('TW-01');
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]?.km ?? 0).toBeGreaterThanOrEqual(sorted[i - 1]?.km ?? 0);
    expect(NEARBY_COUNT).toBe(3);
    expect(viewNote(initialState('C'), 'TW-04')).toMatch(/ridge/);
  });
  it('labels Scenario C distances approximate until the drone attaches an observation location', () => {
    const s = initialState('C');
    expect(incidentEstimate(s)).toMatchObject({ pos: C_TARGET, approximate: true });
    expect(incidentEstimate({ ...s, verification: { ...s.verification, locationAttached: true } }).approximate).toBe(false);
    expect(incidentEstimate(initialState('B')).approximate).toBe(false);
  });
  it('identifies actively observing towers from scripted events only', () => {
    let a = initialState('A');
    expect(observingTowerIds(a).size).toBe(0);
    for (let i = 0; i < 3; i++) a = nextEvent(a); // outage, weather, cam1
    expect([...observingTowerIds(a)]).toEqual(['TW-01']);
    let c = initialState('C');
    for (let i = 0; i < 3; i++) c = nextEvent(c); // c-strike, c-cam1, c-cam2
    expect([...observingTowerIds(c)]).toEqual(['TW-01']);
    expect(lastObservation(c, 'TW-01')).toBe(30);
    expect(lastObservation(c, 'TW-02')).toBeNull();
  });
});

describe('Overlapping planned geometric coverage',()=>{
 it('models360° rotation and6–10 mile radius, not diameter',()=>{expect(CAMERA_COVERAGE.rotationDegrees).toBe(360);expect(CAMERA_COVERAGE.minMiles).toBe(6);expect(CAMERA_COVERAGE.maxMiles).toBe(10);expect(CAMERA_COVERAGE.kmPerMile*10).toBeCloseTo(16.09344,8);});
 it('places15 unique tower sites within county boundary',()=>{expect(new Set(TOWER_NETWORK.map(t=>t.pos.join(','))).size).toBe(15);for(const t of TOWER_NETWORK)expect(insideCounty(t.pos)).toBe(true);});
 it('covers all interior0.5km samples and0.1km boundary samples with at least two planned envelopes at10miles',()=>{expect(COVERAGE_SAMPLES.length).toBeGreaterThan(10000);for(const p of [...COVERAGE_SAMPLES,...COVERAGE_BOUNDARY])expect(coverageCount(p,10)).toBeGreaterThanOrEqual(2);expect(coverageStats(10).overlapPercent).toBe(100);});
 it('exposes6mile gaps and removes offline tower from online reach',()=>{expect(coverageStats(6).gaps.length).toBeGreaterThan(0);const cameraB=TOWER_NETWORK.find(t=>t.id==='TW-02');if(!cameraB)throw new Error('Missing Camera B');expect(coverageCount(cameraB.pos,6,'C')).toBe(coverageCount(cameraB.pos,6)-1);expect(coverageStats(6).coveredPercent).toBeLessThan(100);});
});
