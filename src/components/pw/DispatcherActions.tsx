import { useState } from 'react';
import { Truck, Users, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COUNTY_RESPONSE_CAPACITY } from '@/sim/config';
import { authorize, canAuthorize, canDispatchEarly, dispatchEarly, fmtClock, score, type SimState } from '@/sim/engine';
import { evidenceStatus } from '@/sim/scoring';
import { sim } from '@/sim/store';
import { C_TARGET, C_STRIKE } from '@/sim/drone-verification';
import { geographicCoordinates, IGNITION } from '@/sim/geo';
import { SyntheticFrame } from './Overlays';
import { ResourceProposal } from './DispatchResources';

export function CountyCapacity() {
  return <section aria-label="County response capacity" className="border-t border-border pt-3">
    <h3 className="text-xs uppercase text-muted-foreground">Greenwood County · response network</h3>
    <dl className="mt-3 grid grid-cols-2 gap-3">
      <div><dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Users className="size-3.5"/>Volunteer firefighters</dt><dd className="mt-1 font-mono text-2xl">{COUNTY_RESPONSE_CAPACITY.volunteerFirefighters}</dd></div>
      <div><dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Building2 className="size-3.5"/>Fire stations</dt><dd className="mt-1 font-mono text-2xl">{COUNTY_RESPONSE_CAPACITY.fireStations}</dd></div>
    </dl>
    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">User-provided county totals · not live staffing. Station locations and available crews are unverified; all paging is simulated.</p>
  </section>;
}

export function DispatcherActions({s,openReview,openResources}:{s:SimState;openReview:()=>void;openResources:()=>void}) {
  const total=score(s).total;
  const status=evidenceStatus(score(s),s.weather,false).state;
  const earlyError=canDispatchEarly(s);
  const notice=s.earlyDispatchNotice&&!s.earlyDispatchNotice.read&&s.authorizedAt==null&&total>=50&&total<80;
  return <section aria-label="Dispatcher actions" className="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-border bg-card px-4 py-2">
    <div className="min-w-0 text-xs"><p><span className="font-mono text-primary">Evidence: {total}</span> · {status}<span className="ml-2 text-muted-foreground">{s.authorizedAt==null?'Response: not initiated':s.dispatchMode==='override'?'Response initiated by dispatcher override':'Response: initiated after confirmation'}</span></p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[10px] text-muted-foreground"><span><Users className="mr-1 inline size-3"/>{COUNTY_RESPONSE_CAPACITY.volunteerFirefighters} volunteers</span><span><Building2 className="mr-1 inline size-3"/>{COUNTY_RESPONSE_CAPACITY.fireStations} stations</span><span>County totals · user-provided · availability unknown</span></p>
      {s.reassessRequired&&<p role="alert" className="mt-1 text-warning">Evidence declined — reassess response. Resources have not been canceled.</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={openResources}><Building2 className="size-3.5"/>Dispatch Resources</Button>
      {notice&&<Button variant="link" size="sm" className="h-auto max-w-64 whitespace-normal text-left text-warning" onClick={openReview}>Early dispatch available—review incident evidence.</Button>}
      {s.authorizedAt==null&&(total<80?<div><Button variant="outline" size="sm" disabled={earlyError!=null} onClick={openReview}><Truck className="size-3.5"/>Dispatch Early</Button>{earlyError&&<p className="mt-1 max-w-64 text-[10px] text-muted-foreground">{earlyError}</p>}</div>:<div><Button size="sm" disabled={canAuthorize(s)!=null} onClick={()=>sim.set(authorize)} className="h-auto whitespace-normal">Confirm Incident / Begin Response</Button>{canAuthorize(s)&&<p className="mt-1 max-w-64 text-[10px] text-muted-foreground">{canAuthorize(s)}</p>}</div>)}
    </div>
  </section>;
}

export function EarlyDispatchDialog({s,onClose}:{s:SimState;onClose:()=>void}) {
  const [reason,setReason]=useState('');
  const [reviewed,setReviewed]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const b=score(s);
  const pos=geographicCoordinates(s.scenario==='C'?C_TARGET:IGNITION);
  const cameras=s.obs.filter(o=>o.kind==='camera'&&!o.clearView);
  const currentError=canDispatchEarly(s);
  const confirm=()=>{
    const current=sim.get();
    const issue=canDispatchEarly(current)??(!reviewed?'Acknowledge evidence review.':!reason.trim()?'Enter a reason for early dispatch.':null);
    sim.set(x=>dispatchEarly(x,{reviewed,reason}));
    if(issue||sim.get().authorizedAt==null){setError(issue??sim.get().resources.error);return;}
    onClose();
  };
  return <div className="fixed inset-0 z-[75] flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-label="Early-dispatch evidence review" className="flex max-h-full w-full max-w-2xl flex-col rounded border border-warning/50 bg-card">
    <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border p-4"><h2 className="text-lg font-semibold">Early-dispatch evidence review · {s.scenario}</h2><Button variant="ghost" size="icon" aria-label="Close dispatch review" onClick={onClose}><X/></Button></div>
    <div className="min-h-0 overflow-y-auto px-5 pb-4"><p className="mt-2 text-xs text-muted-foreground">{s.dispatcher.name} · simulation permissions assumed · fire-response decision, not aircraft approval</p>
    <p className="mt-3 text-sm">Evidence <span className="font-mono text-primary">{b.total} / 100</span> · {evidenceStatus(b,s.weather,false).state} · {s.authorizedAt==null?'Response not initiated':'Response already initiated'}</p>
    <p className="mt-2 text-xs">Illustrative incident location: {pos.lat.toFixed(5)}, {pos.lon.toFixed(5)} · {s.scenario==='C'?`broad single-bearing source uncertainty; earlier strike ±${C_STRIKE.uncertaintyKm} km is context only`:'crossing-bearing search area; accuracy unvalidated'}</p>
    <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-border py-3 text-xs">{[['Cameras',b.camera.points],['SMS',b.sms.points],['GOES',b.goes.points],['911',b.e911.points],['Outage',b.outage.points],['Agreement',b.cross.points],['Drone',b.drone.points]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-mono">{value}</dd></div>)}</dl>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{cameras.slice(-2).map(o=><figure key={o.id}><SyntheticFrame growing={o.kind==='camera'&&o.growing} label="Simulated tower-camera evidence"/><figcaption className="mt-1 text-[10px] text-muted-foreground">{o.kind==='camera'?o.cameraId:''} · {fmtClock(o.t,s.scenario)} · {o.id}</figcaption></figure>)}{s.verification.snapshots.slice(-2).map((f,i)=><figure key={`${f.mode}-${i}`}><img src={f.url} width={1200} height={800} alt={`${f.mode} simulated drone evidence`} className="aspect-[3/2] w-full object-contain bg-background"/><figcaption className="mt-1 text-[10px]">{f.mode} · {fmtClock(f.t,s.scenario)} · simulated</figcaption></figure>)}</div>
    <div className="mt-3 space-y-1 text-xs text-muted-foreground"><p>Missing / unavailable: {s.scenario==='C'?'TW-02 offline; ridge obscures ground source; no usable satellite confirmation.':'No usable satellite confirmation yet; drone grounded by wind.'} {s.verification.snapshots.length===0&&'No drone images available.'}</p><p>Frame ages: {cameras.map(o=>`${o.id}: ${Math.max(0,Math.round(s.t-o.t))}s`).join(' · ')||'No frames'}. Feed freshness is unverified; these are scripted observations.</p><p>Scheduled burn: {s.verification.burnCheckedAt==null?'No registry result available yet.':'No matching scheduled burn · simulated registry.'} Missing burn information is not proof of fire.</p></div>
    <div className="mt-4"><CountyCapacity/></div>
    <ResourceProposal s={s}/>
    <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-1 accent-primary"/>I reviewed the evidence, uncertainty and missing information.</label>
    <label htmlFor="early-dispatch-reason" className="mt-3 block text-xs">Dispatch reason (required)</label><textarea id="early-dispatch-reason" value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="Why respond before further verification?" className="mt-1 w-full rounded border border-border bg-background p-2 text-sm"/>
    {(error||currentError)&&<p role="alert" className="mt-2 text-xs text-warning">{currentError??error}</p>}
    <p className="mt-2 text-[11px] text-warning">All dispatches simulated. This override adds no evidence points, does not confirm the fire, and does not cancel drone verification.</p>
    </div><div className="flex shrink-0 flex-wrap gap-2 border-t border-border p-4"><Button disabled={!reviewed||!reason.trim()||currentError!=null} onClick={confirm} className="h-auto whitespace-normal">Confirm Simulated Early Dispatch</Button><Button variant="outline" onClick={onClose}>Cancel</Button>{b.total>=80&&s.authorizedAt==null&&<Button variant="outline" onClick={onClose}>Return to normal confirmation</Button>}</div>
  </section></div>;
}