import { describe, it, expect } from 'vitest';
import { advanceTo, initialState, score, dispatchEarly, canDispatchEarly, authorize, syncDispatchState } from '@/sim/engine';
import { approveVerificationMission } from '@/sim/drone-verification';
import { COUNTY_RESPONSE_CAPACITY } from '@/sim/config';
import { presentationStage } from '@/sim/stages';

const atScore=(total:number)=>({...advanceTo(initialState('C'),60),crossBonus:total-50});
const reviewed={reviewed:true,reason:'Respond before further verification.'};
describe('Manual early-dispatch override',()=>{
  it('county network has 200 volunteers and 13 stations, never fabricated staffing',()=>{
    expect(COUNTY_RESPONSE_CAPACITY.volunteerFirefighters).toBe(200);
    expect(COUNTY_RESPONSE_CAPACITY.fireStations).toBe(13);
  });
  it.each([49,50,79,80])('revalidates the exact %s boundary',total=>{
    const s=atScore(total);expect(score(s).total).toBe(total);
    const n=dispatchEarly(s,reviewed);
    expect(n.authorizedAt!=null).toBe(total>=50&&total<80);
    expect(score(n).total).toBe(total);
    expect(n.dispatchAudit.at(-1)?.outcome).toBe(total>=50&&total<80?'initiated':'rejected');
  });
  it('requires acknowledgement and a nonblank reason',()=>{
    expect(dispatchEarly(atScore(60),{reviewed:false,reason:'Reason'}).authorizedAt).toBeNull();
    expect(dispatchEarly(atScore(60),{reviewed:true,reason:'  '}).authorizedAt).toBeNull();
  });
  it('revalidates dispatcher permission',()=>{
    const s=atScore(60);expect(dispatchEarly({...s,dispatcher:{...s.dispatcher,permitted:false}},reviewed).authorizedAt).toBeNull();
  });
  it('A dispatches at55 while grounded; B stays zero and cannot dispatch',()=>{
    const a=dispatchEarly(advanceTo(initialState('A'),360),reviewed);
    expect(score(a).total).toBe(55);expect(a.authorizedAt).toBe(360);expect(a.droneRequestedAt).toBe(300);expect(a.verification.launchAt).toBeNull();
    const b=advanceTo(initialState('B'),1200);expect(score(b).total).toBe(0);expect(canDispatchEarly(b)).not.toBeNull();expect(dispatchEarly(b,reviewed).authorizedAt).toBeNull();
  });
  it('override does not confirm evidence or substitute for pilot approval',()=>{
    const n=dispatchEarly(advanceTo(initialState('C'),75),reviewed);
    expect(score(n).total).toBe(60);expect(n.awaitingPilotApproval).toBe(true);expect(n.verification.launchAt).toBeNull();expect(presentationStage(n).current).toBe('respond');
    expect(authorize(atScore(60)).authorizedAt).toBeNull();
  });
  it('mission continues to100, without duplicate response after confirmation',()=>{
    const early=dispatchEarly(advanceTo(initialState('C'),75),reviewed);
    const n=advanceTo(approveVerificationMission(early),400);
    expect(score(n).total).toBe(100);expect(n.verification.snapshots).toHaveLength(4);expect(n.verification.phase).toBe('returned');expect(n.authorizedAt).toBe(65);
    expect(authorize(n)).toBe(n);expect(dispatchEarly(n,reviewed)).toBe(n);expect(n.dispatchAudit.filter(a=>a.outcome==='initiated')).toHaveLength(1);
  });
  it('score changes during review reject49 and redirect80; repeated clicks do not dispatch twice',()=>{
    const s=atScore(60);
    expect(dispatchEarly({...s,crossBonus:-1},reviewed).authorizedAt).toBeNull();
    expect(dispatchEarly({...s,crossBonus:30},reviewed).authorizedAt).toBeNull();
    const n=dispatchEarly(s,reviewed);expect(dispatchEarly(n,reviewed)).toBe(n);
  });
  it('audits current evidence and alerts on decline without canceling resources',()=>{
    const n=dispatchEarly(atScore(60),reviewed);
    expect(n.dispatchAudit[0]).toMatchObject({incidentId:'C-0300',dispatcher:'Dispatcher M. Ellis (simulated)',score:60,t:60,reason:reviewed.reason,outcome:'initiated'});
    expect(n.dispatchAudit[0]?.evidenceReferences).toEqual(n.obs.map(o=>o.id));
    const lower=syncDispatchState({...n,crossBonus:0});expect(score(lower).total).toBe(50);expect(lower.reassessRequired).toBe(true);expect(lower.tasks).toEqual(n.tasks);expect(lower.authorizedAt).toBe(n.authorizedAt);
  });
  it('eligibility notification fires once; reset clears pending state',()=>{
    const s=advanceTo(initialState('A'),360);expect(s.earlyDispatchNotice?.read).toBe(false);
    expect(syncDispatchState(s).earlyDispatchNotice).toBe(s.earlyDispatchNotice);
    const n=initialState('A');expect(n.earlyDispatchNotice).toBeNull();expect(n.dispatchAudit).toEqual([]);expect(n.reassessRequired).toBe(false);
  });
});