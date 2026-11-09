import { describe,it,expect } from 'vitest';
import { DEMO_GOES,SATELLITES,CACHE_MS,demoObservation,parseElements,position } from '@/satellites/orbits';
import { initialState,advanceTo,score,satelliteUnread,openSatelliteObservation,applyEvent,STATIC_EVENTS,continueMonitoring } from '@/sim/engine';
import { SCAN_SECONDS,scanProgress } from '@/satellites/observation';
import goesSample from './goes19-elements.json';
import polarSample from './noaa21-elements.json';
describe('Satellite tracking boundaries',()=>{
  it('notifies once only at A 2:10 and opening only marks read and pauses',()=>{const before=advanceTo(initialState(),540);expect(satelliteUnread(before)).toBe(false);const after=advanceTo(continueMonitoring(before),600);expect(satelliteUnread(after)).toBe(true);const opened=openSatelliteObservation({...after,playing:true});expect(opened).toEqual({...after,satelliteRead:true,playing:false,motionPaused:true});expect(score(opened).total).toBe(100);expect(satelliteUnread(opened)).toBe(false);expect(openSatelliteObservation(opened).obs).toEqual(after.obs);const goes=STATIC_EVENTS.find(e=>e.id==='goes');if(!goes)throw Error('Missing GOES');expect(applyEvent(opened,goes)).toBe(opened);});
  it('reset and B have no unread observation',()=>{expect(satelliteUnread(initialState())).toBe(false);expect(satelliteUnread(advanceTo(initialState('B'),1200))).toBe(false);});
  it('isolated scan lasts six seconds without touching evidence',()=>{expect(SCAN_SECONDS).toBe(6);expect(scanProgress(3)).toBe(.5);expect(scanProgress(6)).toBe(1);expect(scanProgress(10)).toBe(1);const s=advanceTo(continueMonitoring(advanceTo(initialState(),540)),600);for(let t=0;t<=7;t++)scanProgress(t);expect(score(s).total).toBe(100);});
  it('curates verified GOES and VIIRS catalog IDs',()=>{expect(SATELLITES.map(s=>s.id)).toEqual([60133,51850,37849,43013,54234]);});
  it('keeps demo GOES on equator separately from live elements',()=>{expect(DEMO_GOES.lat).toBe(0);expect(DEMO_GOES.altitude).toBe(35786);expect(parseElements([])).toEqual([]);});
  it('only existing GOES event makes demo observation visible without awarding points',()=>{const before=advanceTo(initialState(),540);const total=score(before).total;expect(demoObservation(before.fired)).toBe(false);expect(score(before).total).toBe(total);const after=advanceTo(continueMonitoring(before),600);expect(demoObservation(after.fired)).toBe(true);expect(score(after).total).toBe(100);expect(demoObservation(advanceTo(initialState('B'),1200).fired)).toBe(false);});
  it('caches for the two-hour provider update interval',()=>{expect(CACHE_MS).toBe(7200000);});
  it('never propagates invalid or missing real orbital data into demo positions',()=>{expect(()=>parseElements([{NORAD_CAT_ID:60133}])).toThrow();});
  it('propagates real GOES near equator and polar spacecraft along moving paths',()=>{
    const goes=parseElements(goesSample)[0],polar=parseElements(polarSample)[0];
    if(!goes||!polar)throw new Error('Missing verified samples');
    const time=new Date('2026-11-07T11:00:00Z');
    const a=position(goes,time),b=position(goes,new Date(time.getTime()+600000));
    expect(Math.abs(a?.lat??90)).toBeLessThan(.2);expect(Math.abs((b?.lon??0)-(a?.lon??180))).toBeLessThan(.1);
    const p=position(polar,time),q=position(polar,new Date(time.getTime()+600000));
    expect(p?.altitude).toBeGreaterThan(700);expect(p?.altitude).toBeLessThan(900);
    expect(Math.abs((p?.lat??0)-(q?.lat??0))).toBeGreaterThan(5);
  });
});