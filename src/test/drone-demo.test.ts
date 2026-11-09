import { describe, expect, it } from 'vitest';
import { COUNTY, DOCK, DOCK_COORDINATES, polygonCentroid } from '@/sim/geo';
import { advanceTo, initialState, score, droneState, canAuthorize } from '@/sim/engine';
import { cameraCommand, demoPosition, demoDistanceKm, tickDroneDemo } from '@/sim/drone-demo';

describe('Central drone dock',()=>{
  it('uses polygon area centroid, not vertex or viewport center',()=>{
    expect(polygonCentroid([[0,0],[6,0],[0,6]])).toEqual([2,2]);
    expect(polygonCentroid([[0,6],[6,0],[0,0]])).toEqual([2,2]);
    expect(DOCK).toEqual(polygonCentroid(COUNTY));
    expect(DOCK).not.toEqual([31.85,26]);
  });
  it('reports a geographic center in Greenwood County',()=>{
    expect(DOCK_COORDINATES.lat).toBeGreaterThan(37.8);expect(DOCK_COORDINATES.lat).toBeLessThan(37.95);
    expect(DOCK_COORDINATES.lon).toBeGreaterThan(-96.35);expect(DOCK_COORDINATES.lon).toBeLessThan(-96.1);
  });
});
describe('Isolated Camera demonstration',()=>{
  it('requires existing detection before a demo launch',()=>{const s=initialState();expect(cameraCommand(s,'launch')).toBe(s);});
  it.each(['A','B'] as const)('flies from central dock, audits inspection, returns without changing %s rules',scenario=>{
    const before=advanceTo(initialState(scenario),scenario==='A'?540:540);
    let s=cameraCommand(before,'launch');expect(s.droneDemo.phase).toBe('launching');expect(demoPosition(s.droneDemo,scenario)).toEqual(DOCK);
    for(let i=0;i<17;i++)s=tickDroneDemo(s,.5);
    expect(s.droneDemo.phase).toBe('observing');expect(demoDistanceKm(scenario)).toBeGreaterThan(0);
    s=cameraCommand(s,'snapshot','RGB');s=cameraCommand(s,scenario==='A'?'Confirm fire':'Mark false alarm');
    expect(s.droneDemo.snapshots).toBe(1);expect(s.log.some(l=>l.source==='camera-demo'&&l.text.includes('Snapshot 1'))).toBe(true);
    s=cameraCommand(s,'return');expect(s.droneDemo.phase).toBe('returning');
    for(let i=0;i<12;i++)s=tickDroneDemo(s,.5);
    expect(s.droneDemo.phase).toBe('docked');expect(demoPosition(s.droneDemo,scenario)).toEqual(DOCK);
    expect(s.log.at(-1)?.text).toContain('returned to central dock');
    expect(s.t).toBe(before.t);expect(s.obs).toEqual(before.obs);expect(score(s).total).toBe(scenario==='A'?90:0);
    expect(s.authorizedAt).toBeNull();expect(canAuthorize(s)).toBe(canAuthorize(before));expect(s.tasks).toEqual([]);
    expect(droneState(s,s.t).pos).toEqual(DOCK);expect(droneState(s,s.t).phase).toBe(scenario==='A'?'unavailable':'docked');
    expect(initialState(scenario).droneDemo.phase).toBe('docked');expect(initialState(scenario).droneDemo.snapshots).toBe(0);
  });
  it('blocks snapshots and decisions before observing',()=>{const s=cameraCommand(advanceTo(initialState(),180),'launch');expect(cameraCommand(s,'snapshot')).toBe(s);expect(cameraCommand(s,'Confirm fire')).toBe(s);});
});