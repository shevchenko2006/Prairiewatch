import { describe, it, expect } from "vitest";
import { advanceTo, authorize, dispatchEarly, initialState, nextEvent, resourcePos, resourceProgress, resourceRoute, tick } from "@/sim/engine";
import { displayedScore, eventEffect, incidentPing, presentationView, responseFrame, seekPresentation, PRESENTATION } from "@/sim/presentation";
import { CAMERA_TRANSITION_SECONDS, RESPONSE_TIMING } from "@/sim/config";
import { COUNTY, CAMERAS, IGNITION, RESOURCE_ROUTE, TOWNS } from "@/sim/geo";
import { C_TARGET } from "@/sim/drone-verification";
describe("Clock-driven geographic presentation", () => {
  it("C engine travels along its displayed route to the incident at its existing ETA", () => {
    const approved = dispatchEarly(advanceTo(initialState("C"),60), { reviewed:true, reason:"Review plume and GPS evidence" });
    const departure = approved.t + RESPONSE_TIMING.acceptDelay;
    const start = advanceTo({...approved,verification:{...approved.verification,branch:"blocked"}},departure);
    const origin = resourceRoute(start)[0];
    expect(resourcePos(start,departure)).toEqual(origin);
    const middle = advanceTo(start,departure+RESPONSE_TIMING.travelC/2);
    expect(resourcePos(middle,middle.t)).not.toEqual(origin);
    expect(resourcePos(middle,middle.t)).not.toEqual(C_TARGET);
    expect(presentationView({...middle,motionTime:2},true)).toEqual(responseFrame(middle));
    const arrival = advanceTo(middle,departure+RESPONSE_TIMING.travelC);
    expect(arrival.arrivedAt).toBe(departure+540);
    expect(resourcePos(arrival,arrival.t)).toEqual(C_TARGET);
    expect(resourceRoute(arrival).at(-1)).toEqual(C_TARGET);
    expect(responseFrame(arrival)).toEqual({c:C_TARGET,w:4});
    const paused = {...middle,playing:false,motionPaused:true};
    expect(resourcePos(tick(paused,3),paused.t)).toEqual(resourcePos(paused,paused.t));
    expect(resourcePos(initialState("C"),0)).toBeNull();
  });
  it("route progress is 0 before departure, 1 at arrival, and monotone between", () => {
    const approved = dispatchEarly(advanceTo(initialState("C"),60), { reviewed:true, reason:"Review plume and GPS evidence" });
    const departure = approved.t + RESPONSE_TIMING.acceptDelay;
    expect(resourceProgress(approved, approved.t)).toBe(0);
    expect(resourceProgress(approved, departure)).toBe(0);
    const halfway = resourceProgress(approved, departure + RESPONSE_TIMING.travelC / 2);
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1);
    expect(resourceProgress(approved, departure + RESPONSE_TIMING.travelC)).toBe(1);
    expect(resourceProgress(approved, departure + RESPONSE_TIMING.travelC + 600)).toBe(1);
    expect(resourceProgress(initialState("A"), 100)).toBe(0);
  });
  it("C starts red rings with its first plume and repeats their expanding fade", () => {
    const start = nextEvent(nextEvent(initialState("C")));
    expect(start.pingStartedAt).toBe(0);
    const early = incidentPing({...start,motionTime:.4});
    const faded = incidentPing({...start,motionTime:2});
    const repeated = incidentPing({...start,motionTime:4.4});
    expect(early?.rings).toHaveLength(3);
    expect(faded?.rings[0].radius).toBeGreaterThan(early?.rings[0].radius ?? 0);
    expect(faded?.rings[0].opacity).toBeLessThan(early?.rings[0].opacity ?? 0);
    expect(repeated?.rings[0].radius).toBeCloseTo(faded?.rings[0].radius ?? 0);
    expect(repeated?.rings[0].opacity).toBeCloseTo(faded?.rings[0].opacity ?? 0);
    const paused = {...start,motionTime:2,playing:false,motionPaused:true};
    expect(incidentPing(tick(paused,3))).toEqual(incidentPing(paused));
    expect(incidentPing(initialState("C"))).toBeNull();
    expect(incidentPing(start,true)?.rings).toEqual([]);
  });
  it("Next Event settles camera, score and skipped effects", () => {
    const s = nextEvent(nextEvent(nextEvent(initialState())));
    expect(s.t).toBe(180); expect(s.settledAt).toBe(180);
    expect(displayedScore(s)).toBe(15); expect(eventEffect(s,"cam1")).toBe(0);
    expect(presentationView(s)).toEqual(presentationView(s,true));
  });
  it("pause freezes camera, score and pulse even during a hold", () => {
    const s = { ...tick({...advanceTo(initialState(),179),playing:true},.1),playing:false };
    const n = tick(s,2);
    expect(n).toBe(s); expect(presentationView(n)).toEqual(presentationView(s));
    expect(displayedScore(n)).toBe(displayedScore(s));expect(eventEffect(n,"cam1")).toBe(eventEffect(s,"cam1"));
  });
  it("score and camera settle through the sole clock observation hold", () => {
    const s = tick({...advanceTo(initialState(),179),playing:true},.1);
    expect(displayedScore(s)).toBe(0);
    const n = tick(s,2); expect(n.t).toBe(180);expect(displayedScore(n)).toBe(15);
    expect(presentationView(n)).toEqual(presentationView(n,true));
  });
  it("ending an observation hold never rewinds the settled camera or score", () => {
    const s = tick({...advanceTo(initialState(),179),playing:true},.1);
    const finished = tick(s,6);
    const resumed = tick(finished,.1);
    expect(displayedScore(resumed)).toBe(30);
    expect(presentationView(resumed)).toEqual(presentationView(finished));
  });
  it("reduced motion removes pulses and score interpolation", () => {
    const s = advanceTo(initialState(),540);
    expect(eventEffect(s,"sms",true)).toBe(0); expect(displayedScore(s,true)).toBe(90);
  });
  it("decision and confirmation retain the incident close-up until engine starts", () => {
    const s = advanceTo(initialState(),960);expect(presentationView(tick(s,10))).toEqual(presentationView(s));
    expect(presentationView(authorize(s),true)).toEqual(PRESENTATION.closeUp);
  });
  it("county and sourced towns are not the former fictional rectangle", () => {
    expect(COUNTY.length).toBeGreaterThan(50);
    expect(TOWNS.find(t=>t.name==="Eureka")?.pos).toEqual([21.3119,24.9948]);
    expect(RESOURCE_ROUTE.length).toBeGreaterThan(10);
    for (const p of [...CAMERAS.map(c=>c.pos),IGNITION]) { expect(p[0]).toBeGreaterThan(0); expect(p[0]).toBeLessThan(51.1);expect(p[1]).toBeGreaterThan(0);expect(p[1]).toBeLessThan(64.1); }
  });
  it("B has no transient fire/report effects", () => {
    const s = advanceTo(initialState("B"),540);
    expect(eventEffect(s,"sms")).toBe(0);expect(eventEffect(s,"cam-b")).toBe(0);expect(displayedScore(s)).toBe(0);
  });
  it("first observed ping moves from county overview to 3.4km in 1.2 seconds", () => {
    const before = nextEvent(nextEvent(initialState()));
    const start = seekPresentation(before,nextEvent(before));
    expect(presentationView(start)).toEqual(PRESENTATION.overview);
    const halfway = tick(start,.6);
    expect(presentationView(halfway).w).toBeGreaterThan(3.4);
    expect(presentationView(halfway).w).toBeLessThan(78);
    const end = tick(halfway,.6);
    expect(end.t).toBe(180); expect(presentationView(end)).toEqual(PRESENTATION.closeUp);
    expect(end.cameraSeek).toBeNull();
    expect(CAMERA_TRANSITION_SECONDS).toBe(1.2);
    for (const t of [360,480,540]) expect(presentationView(advanceTo(end,t),true)).toEqual(PRESENTATION.closeUp);
  });
  it("normal playback holds close-up for four seconds after its two-second move", () => {
    const start = tick({...advanceTo(initialState(),179),playing:true},.1);
    const end = tick(start,2);
    expect(presentationView(end)).toEqual(PRESENTATION.closeUp);
    expect(presentationView(tick(end,4))).toEqual(PRESENTATION.closeUp);
  });
  it("three attention rings repeat every 2.4 seconds and dot enters in 400ms", () => {
    const start = advanceTo(initialState(),180);
    expect(incidentPing(start)?.entrance).toBe(0);
    const a = {...start,motionTime:.4};
    expect(incidentPing(a)?.entrance).toBe(1);
    expect(incidentPing(a)?.rings).toHaveLength(3);
    const p = incidentPing({...start,motionTime:2})?.rings[0];
    const q = incidentPing({...start,motionTime:4.4})?.rings[0];
    expect(p?.radius).toBeCloseTo(q?.radius ?? 0);
    expect(p?.opacity).toBeCloseTo(q?.opacity ?? 0);
    expect(p?.radius).toBeGreaterThan(50); expect(p?.radius).toBeLessThanOrEqual(90);
  });
  it("explicit pause freezes a seek and resetting clears radar; B never gets red ping", () => {
    const before = nextEvent(nextEvent(initialState()));
    const start = {...seekPresentation(before,nextEvent(before)),motionPaused:true};
    expect(tick(start,1)).toBe(start);
    expect(incidentPing(initialState())).toBeNull();
    expect(incidentPing(advanceTo(initialState('B'),540))).toBeNull();
    expect(incidentPing({...start,motionTime:1},true)?.rings).toEqual([]);
  });
  it("engine-start pulls back, follows progress and arrival frames incident together", () => {
    const approved = authorize(advanceTo(initialState(),960));
    const start = advanceTo(approved,approved.t+RESPONSE_TIMING.acceptDelay);
    expect(presentationView(start)).toEqual(PRESENTATION.closeUp);
    const settled = {...start,motionTime:start.motionTime+1.2};
    expect(presentationView(settled).w).toBeGreaterThan(10);
    const middle = advanceTo(settled,start.t+RESPONSE_TIMING.travel/2);
    expect(responseFrame(middle).c).not.toEqual(responseFrame(settled).c);
    const arrived = advanceTo(middle,start.t+RESPONSE_TIMING.travel);
    expect(presentationView(arrived).w).toBeGreaterThanOrEqual(4);
    expect(presentationView(arrived).w).toBeLessThan(6);
    expect(presentationView(tick({...middle,playing:false},1))).toEqual(presentationView(middle));
  });
});
