import { describe, expect, it } from "vitest";
import { STATIC_EVENTS, OUTAGE_EVENTS, advanceTo, applyEvent, authorize, acknowledge, canAuthorize, closeIncident, initialState, nextEvent, score, continueMonitoring, droneState, resourcePos, tick, receiveObservation } from "@/sim/engine";
import { evidenceStatus, scoreEvidence } from "@/sim/scoring";
import { firePerimeter } from "@/sim/geo";
import { sim } from "@/sim/store";
import { presentationStage } from "@/sim/stages";
const at = (t:number) => advanceTo(initialState("A"),t);
/** Fire exactly the listed events in order, even when they share a timestamp. */
const through = (count:number) => { let s = initialState("A"); for (let i=0;i<count;i++) s = nextEvent(s); return s; };
describe("Outage-check workflow, two outcomes",()=>{
  it("A events fire in listed order with exact totals, including shared timestamps",()=>{
    const expected:[string,number,number][] = [
      ["outage",0,0],["weather",60,0],["cam1",180,15],["outage-match",180,30],["cam2",300,45],
      ["goes-clear",300,45],["cam-b",360,55],["sms",480,80],["cross-2",480,90],["decision",540,90],
    ];
    let s = initialState("A");
    for (const [id,t,total] of expected) {
      s = nextEvent(s);
      expect(s.fired.at(-1)).toBe(id);
      expect(s.t).toBe(t);
      expect(score(s).total).toBe(total);
    }
  });
  it("ground truth gives no system advance knowledge",()=>{const s=at(0);expect(s.obs.filter(o=>o.kind!=="utility")).toEqual([]);expect(s.incidentAt).toBeNull();expect(score(s).total).toBe(0);});
  it("outage index stays locked until smoke matches, then unlocks at +15 capped",()=>{
    const camOnly = through(3); // outage, weather, cam1
    expect(score(camOnly).outage.points).toBe(0);
    expect(score(camOnly).outage.locked).toBe(true);
    const unlocked = through(4); // outage-match
    const b = score(unlocked);
    expect(b.outage.points).toBe(15); // match 10 + wind 5; cause +5 capped at 15
    expect(b.outage.locked).toBe(false);
    expect(b.total).toBe(30);
  });
  it("camera upgrade replaces 15 with 30 at confidence .86 and caps at 40 with Camera B",()=>{
    expect(score(through(3)).camera.points).toBe(15);
    expect(score(through(5)).camera.points).toBe(30);
    expect(score(through(7)).camera.points).toBe(40);
  });
  it("SMS 25 reaches Confirmed at 80 and the second class adds exactly 10",()=>{
    const sms = score(through(8));
    expect([sms.sms.points,sms.total]).toEqual([25,80]);
    expect(evidenceStatus(sms,"redFlag",false).state).toBe("Confirmed");
    const cross = score(through(9));
    expect([cross.cross.points,cross.total]).toEqual([10,90]);
  });
  it("GOES +12 and third class +5 cap the total at 100 (raw 107)",()=>{
    const decided = authorize(through(10));
    const goes = advanceTo(decided,600);
    expect(score(goes).goes.points).toBe(12);
    const both = nextEvent(advanceTo(goes,600));
    const b = score(both);
    expect([b.camera.points,b.sms.points,b.goes.points,b.outage.points,b.cross.points]).toEqual([40,25,12,15,15]);
    expect(b.total).toBe(100);
  });
  it("911 first call with flames at a named road scores 50 without raising the capped total",()=>{
    const s = advanceTo(authorize(through(10)),780);
    const b = score(s);
    expect(b.e911.points).toBe(50);
    expect(b.total).toBe(100);
  });
  it("drone is requested at 2:05 but never leaves the dock",()=>{
    const dock=droneState(initialState(),0).pos;
    for (const n of [5,7,9,10]) { const s=through(n); expect(droneState(s,s.t)).toMatchObject({phase:n>=5?"unavailable":"docked",pos:dock}); }
    expect(through(5).droneRequestedAt).toBe(300);
    expect(STATIC_EVENTS.some(e=>/launch|thermal|onsite/.test(e.id))).toBe(false);
  });
  it("pauses at 2:09 without fabricating confirmation",()=>{
    const s=at(2400);
    expect(s.t).toBe(540);
    expect(s.awaitingDecision).not.toBeNull();
    expect(s.authorizedAt).toBeNull();
    expect(nextEvent(s)).toBe(s);
    expect(tick(s,10)).toBe(s);
  });
  it("acknowledgment records time but does not confirm",()=>{
    const s=acknowledge(at(540));
    expect(s.acknowledgedAt).toBe(540);
    expect(s.authorizedAt).toBeNull();
    expect(s.awaitingDecision).not.toBeNull();
  });
  it("monitoring can resume without response and evidence keeps updating",()=>{
    const s=advanceTo(continueMonitoring(at(540)),780);
    expect(s.t).toBe(780);
    expect(s.authorizedAt).toBeNull();
    expect(s.tasks).toEqual([]);
    expect(resourcePos(s,s.t)).toBeNull();
    expect(score(s).total).toBe(100);
  });
  it("no response before confirmation",()=>{
    const s=at(540);
    expect(s.notifiedAt).toBeNull();
    expect(s.acceptedAt).toBeNull();
    expect(s.arrivedAt).toBeNull();
    expect(resourcePos(s,s.t)).toBeNull();
  });
  it("confirmation at 2:09 pages the district and arrives about 2:31, 22 minutes later",()=>{
    const a=authorize(at(540));
    expect(a.tasks).toHaveLength(4);
    expect(a.tasks.map(t=>t.name)).toEqual(["District paging","Utility de-energization","Disk-crew notifications","Road alerts"]);
    expect(a.tasks.every(t=>t.sentAt==null)).toBe(true);
    expect(advanceTo(a,779).acceptedAt).toBeNull();
    expect(advanceTo(a,780).acceptedAt).toBe(780);
    const end=advanceTo(a,3000);
    expect(end.arrivedAt).toBe(1860);
    expect(end.arrivedAt!-a.authorizedAt!).toBe(1320);
    expect(end.tasks.find(t=>t.id==="utility")?.completedAt).toBeNull();
  });
  it("delayed confirmation shifts all coordination relative to actual time",()=>{
    const a=authorize(advanceTo(continueMonitoring(at(540)),1500));
    expect(a.authorizedAt).toBe(1500);
    const end=advanceTo(a,4000);
    expect(end.acceptedAt).toBe(1740);
    expect(end.arrivedAt).toBe(2820);
    expect(end.notifiedAt).toBe(1515);
  });
  it("B stays at zero: clear view floored, outage locked, window closes at 2:20",()=>{
    const s=advanceTo(initialState("B"),3000);
    expect(s.t).toBe(1200);
    expect(s.outageAt).toBe(0);
    expect(s.clearViewAt).toBe(180);
    const b=score(s);
    expect(b.total).toBe(0);
    expect(b.camera.points).toBe(0);
    expect(b.outage.points).toBe(0);
    expect(b.outage.locked).toBe(true);
    expect(s.incidentAt).toBeNull();
    expect(s.alertAt).toBeNull();
    expect(s.droneRequestedAt).toBeNull();
    expect(s.tasks).toEqual([]);
    expect(canAuthorize(s)).not.toBeNull();
    expect(authorize(s)).toBe(s);
    expect(presentationStage(s).checksComplete).toBe(true);
    expect(presentationStage(s).note).toBe("Checks complete — no escalation.");
  });
  it("clear view subtracts 15 but the floor holds at zero",()=>{
    const b=scoreEvidence([{id:"c",t:180,kind:"camera",cameraId:"TWR-A",frameId:"A",confidence:0,growing:false,clearView:true,relevant:true}]);
    expect(b.camera.points).toBe(0);
  });
  it("wind or cause alone never unlocks the outage index",()=>{
    const b=scoreEvidence([{id:"o",t:0,kind:"utility",cause:"line down",windMph:28,relevant:true}]);
    expect(b.outage.points).toBe(0);
    expect(b.total).toBe(0);
  });
  it("later smoke can open an ordinary fire incident in B without premature authorization",()=>{
    const s=receiveObservation(advanceTo(initialState("B"),1200),{id:"later",t:1300,kind:"camera",relevant:true,cameraId:"TWR-A",frameId:"later",confidence:0.62,growing:false});
    expect(s.incidentAt).toBe(1300);
    expect(score(s).total).toBe(15);
    expect(canAuthorize(s)).not.toBeNull();
    expect(authorize(s)).toBe(s);
  });
  it.each([0,1,2,3,4,5,6,7,8])("rejects confirmation before dispatcher review at event %s",n=>{
    const s=through(n);
    expect(canAuthorize(s)).not.toBeNull();
    expect(authorize(s)).toBe(s);
    expect(s.tasks).toEqual([]);
  });
  it("requires corroboration and 80 points even at review",()=>{
    const s={...at(540),obs:at(360).obs,crossBonus:0};
    expect(score(s).total).toBe(55);
    expect(authorize(s)).toBe(s);
    const uncorroborated={...at(540),obs:at(540).obs.filter(o=>o.kind==='camera'),crossBonus:0};
    expect(authorize(uncorroborated)).toBe(uncorroborated);
  });
  it("early monitoring does not prevent later review and duplicate confirmation is a no-op",()=>{
    const s=advanceTo(continueMonitoring(at(300)),540);
    expect(s.awaitingDecision).not.toBeNull();
    expect(canAuthorize(s)).toBeNull();
    const a=authorize(s);
    expect(a.authorizedAt).toBe(540);
    expect(a.tasks).toHaveLength(4);
    expect(authorize(a)).toBe(a);
  });
  it("events are timestamp ordered and next event synchronized",()=>{
    let s=initialState();
    const staticIds = STATIC_EVENTS.map(e=>e.id);
    while(staticIds.some(id=>!s.fired.includes(id))){
      if(s.awaitingDecision)s=authorize(s);
      s=nextEvent(s);
    }
    expect(s.fired.filter(id=>staticIds.includes(id))).toEqual(staticIds);
    expect(OUTAGE_EVENTS.map(e=>e.t)).toEqual([0,60,180,300,1200]);
  });
  it("duplicate events are no-ops",()=>{
    const s=advanceTo(authorize(through(10)),600);
    const e=STATIC_EVENTS.find(e=>e.id==="goes");
    if(!e)throw Error("missing goes");
    expect(applyEvent(s,e)).toBe(s);
  });
  it("scores remain constant between events",()=>{
    expect(score(at(400)).total).toBe(55);
    expect(score(at(479)).total).toBe(55);
  });
  it("pause freezes the scenario, perimeter and resource position",()=>{
    const s={...advanceTo(authorize(at(540)),1300),playing:false};
    const n=tick(s,10);
    expect(n).toBe(s);
    expect(firePerimeter(n.t)).toEqual(firePerimeter(s.t));
    expect(resourcePos(n,n.t)).toEqual(resourcePos(s,s.t));
  });
  it("holds freeze all scenario time while keeping playback active",()=>{
    const s=tick({...at(179),playing:true},.1);
    expect(s.t).toBe(180);
    expect(s.holdRemaining).toBe(6);
    const n=tick(s,1);
    expect(n.t).toBe(180);
    expect(n.holdRemaining).toBe(5);
  });
  it("switching and reset clear all active prior-run state",()=>{
    sim.switchScenario("A");sim.reset();
    sim.set(()=>authorize(at(540)));
    sim.switchScenario("B");
    expect(sim.get()).toEqual(initialState("B"));
    sim.set(s=>advanceTo(s,1200));
    sim.reset();
    expect(sim.get()).toEqual(initialState("B"));
    sim.switchScenario("A");
    expect(sim.get()).toEqual(initialState("A"));
  });
  it("closure requires confirmation and a nonempty reason",()=>{
    expect(closeIncident(at(480),"done").closed).toBeNull();
    const a=authorize(at(540));
    expect(closeIncident(a,"  ").closed).toBeNull();
    const s=closeIncident(a,"Exercise complete");
    expect(s.closed).toEqual({t:540,reason:"Exercise complete"});
    expect(advanceTo(s,2400).t).toBe(540);
  });
  it("presentation stages follow the scripted milestones",()=>{
    expect(presentationStage(initialState("A")).current).toBe("detect");
    expect(presentationStage(through(3)).current).toBe("confirm");
    expect(presentationStage(through(8)).current).toBe("decide");
    expect(presentationStage(authorize(through(10))).current).toBe("respond");
    const b=advanceTo(initialState("B"),3000);
    expect(presentationStage(b).current).toBe("confirm");
    expect(presentationStage(b).completed).toEqual(["detect"]);
  });
  it("each scripted 911 call is part of scenario A, not an optional injection",()=>{
    expect(at(540).obs.some(o=>o.kind==="911")).toBe(false);
    expect(advanceTo(authorize(at(540)),780).obs.some(o=>o.kind==="911")).toBe(true);
    expect(advanceTo(initialState("B"),1200).obs.some(o=>o.kind==="911")).toBe(false);
  });
});
