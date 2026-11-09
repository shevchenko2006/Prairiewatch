import { describe, expect, it } from 'vitest';
import { measurePolygon, visibleFireFootprint, geographicScale } from '@/sim/measurements';
import { firePerimeter } from '@/sim/geo';
import { advanceTo, initialState, nextEvent, tick, score, authorize, responseEvents } from '@/sim/engine';
import { unprojectDelta } from '@/components/pw/map-projection';

const confirmed = () => authorize(advanceTo(initialState(), 540));

describe('Geographic fire footprint', () => {
  it('resizes the geographic polygon to 250 acres at the ~2:31 PM arrival, not just its readout', () => {
    const s = advanceTo(confirmed(), 1860);
    const polygon = visibleFireFootprint(s);
    if (!polygon) throw Error('Missing final footprint');
    const m = measurePolygon(polygon);
    expect(s.arrivedAt).toBe(1860);
    expect(responseEvents(s).map(e => e.t)).toEqual([555, 600, 780, 1860]);
    expect(score(s).total).toBe(100);
    expect(m.acres).toBeCloseTo(250, 8);
    expect(m.squareMeters).toBeCloseTo(250 * 4046.8564224, 5);
    expect(m.hectares).toBeCloseTo(101.17141056, 8);
    expect(m.acres / 330).toBeCloseTo(0.75, 1);
    expect(firePerimeter(2400)).toEqual(polygon);
  });
  it('keeps the resized growth increasing and continuous through every key and final plateau', () => {
    let previous = 0;
    for (let t = 180; t <= 1860; t += 5) {
      const polygon = firePerimeter(t);
      if (!polygon) throw Error('Missing footprint');
      const area = measurePolygon(polygon).acres;
      expect(area).toBeGreaterThan(previous);
      previous = area;
    }
    for (const t of [180, 300, 360, 480, 600, 900, 1200, 1860]) {
      const a = firePerimeter(t - .01), b = firePerimeter(t + .01);
      if (!a || !b) throw Error('Missing footprint');
      expect(Math.abs(measurePolygon(b).acres - measurePolygon(a).acres)).toBeLessThan(.001);
      a.forEach((p, i) => {
        const q = b[i];
        if (!q) throw Error('Missing vertex');
        expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeLessThan(.00001);
      });
    }
  });
  it('converts a one-square-kilometre polygon to hectares and acres regardless of winding/origin', () => {
    const polygon: [number, number][] = [[34,27],[35,27],[35,28],[34,28]];
    const m = measurePolygon(polygon);
    expect(m.squareMeters).toBe(1000000);
    expect(m.hectares).toBe(100);
    expect(m.acres).toBeCloseTo(247.1053814672, 8);
    expect(m.widthMeters).toBeCloseTo(Math.sqrt(2)*1000, 8);
    expect(measurePolygon([...polygon].reverse())).toEqual(m);
  });
  it('hides ground truth before observation and identifies no fire polygon in B', () => {
    expect(visibleFireFootprint(advanceTo(initialState(),0))).toBeNull();
    expect(visibleFireFootprint(advanceTo(initialState(),179))).toBeNull();
    expect(visibleFireFootprint(advanceTo(initialState('B'),1200))).toBeNull();
  });
  it.each([180,300,360,480,540,600,780])('measures exactly the displayed model at %s without changing score', t => {
    const s=t<=540?advanceTo(initialState(),t):advanceTo(confirmed(),t), polygon=visibleFireFootprint(s);
    expect(polygon).toEqual(firePerimeter(t));
    if(!polygon)throw Error('Missing footprint');
    const b=score(s).total;
    expect(measurePolygon(polygon).squareMeters).toBeGreaterThan(0);
    expect(score(s).total).toBe(b);
  });
  it('grows smoothly and freezes on pause, with consistent Next event and reset', () => {
    const before=advanceTo(confirmed(),600), polygon=visibleFireFootprint(before);
    if(!polygon)throw Error('Missing footprint');
    const first=measurePolygon(polygon);
    const growing=tick({...before,playing:true},1), nextPolygon=visibleFireFootprint(growing);
    if(!nextPolygon)throw Error('Missing footprint');
    expect(measurePolygon(nextPolygon).acres).toBeGreaterThan(first.acres);
    expect(visibleFireFootprint(tick({...before,playing:false},10))).toEqual(polygon);
    expect(visibleFireFootprint(nextEvent(before))).toEqual(firePerimeter(780));
    expect(visibleFireFootprint(initialState())).toBeNull();
  });
  it('speed changes no measurement at equal scenario time', () => {
    const s=advanceTo(confirmed(),700);
    expect(visibleFireFootprint(tick({...s,playing:true,speed:1},4))).toEqual(visibleFireFootprint(tick({...s,playing:true,speed:4},1)));
  });
  it('scale follows zoom and accounts for tilt independently of geographic acreage', () => {
    const polygon=firePerimeter(900);if(!polygon)throw Error('Missing footprint');
    const m=measurePolygon(polygon);
    for(const width of [457,1024,1280])for(const zoom of [3.4,20,70])for(const flat of [false,true]){
      const kmPerPixel=Math.hypot(...unprojectDelta([zoom/width,0],flat));
      const scale=geographicScale(kmPerPixel);
      expect(scale.pixels).toBeLessThanOrEqual(110);
      expect(scale.pixels*kmPerPixel*1000).toBeCloseTo(scale.meters,8);
      expect(measurePolygon(polygon)).toEqual(m);
    }
    expect(geographicScale(.001).label).toBe('100 m');
    expect(geographicScale(.01).label).toBe('1 km');
  });
});
