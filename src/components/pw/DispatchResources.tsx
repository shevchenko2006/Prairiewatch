import { Building2, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APPARATUS, DEMO_STATIONS, activeAssignment, availableCrew, rosterCounts, INSUFFICIENT_RESOURCES } from '@/sim/resources';
import { fmtClock, updateResourceStatus, type SimState } from '@/sim/engine';
import { sim } from '@/sim/store';

export function ResourceProposal({s}:{s:SimState}) {
  const assignment=activeAssignment(s.resources);
  const unit=APPARATUS.find(a=>a.id===(assignment?.apparatusId??s.resources.proposedId));
  const station=DEMO_STATIONS.find(x=>x.id===unit?.stationId);
  return <section aria-label="Dispatch assignment" className="space-y-2 border-y border-border py-3 text-xs">
    <h3 className="flex items-center gap-2 font-semibold"><Truck className="size-4 shrink-0"/>{assignment?'Assigned resource':'Proposed dispatch resource'} · fictional demo</h3>
    {!assignment&&s.authorizedAt==null&&<><label htmlFor="dispatch-apparatus">Station / apparatus</label><select id="dispatch-apparatus" value={s.resources.proposedId??''} className="w-full rounded border border-input bg-background p-2 text-xs" onChange={e=>sim.set(x=>({...x,resources:{...x.resources,proposedId:e.target.value,error:null}}))}>
      <option value="">Select a resource</option>{APPARATUS.map(a=><option key={a.id} value={a.id}>{DEMO_STATIONS.find(x=>x.id===a.stationId)?.name} · {a.name} · {a.crewSize} personnel{availableCrew(s.resources,a.id)?'':' · unavailable'}</option>)}
    </select></>}
    <p className="break-words">{station?.name??'No station selected'} · {station?.id??'—'}</p>
    <p>{unit?.name??'No apparatus'} · {unit?.id??'—'} · {assignment?.personnel.length??unit?.crewSize??0} personnel</p>
    <p>Destination: {assignment?.destination??(s.scenario==='C'?'Remote pasture · illustrative suspected ignition':'Twp Rd 286 · illustrative incident')}</p>
    <p>Status: <span className="text-primary">{assignment?.status??(s.authorizedAt!=null?s.resources.assignments.at(-1)?.status??'No assignment':'Proposed only · not reserved')}</span></p>
    {assignment&&<><p>Acknowledgement: {assignment.acknowledgedAt==null?'Pending · request is not acknowledgement':`${fmtClock(assignment.acknowledgedAt,s.scenario)} · automatic, simulated`}</p><p>Estimated arrival: {fmtClock(assignment.eta,s.scenario)} · simulated</p></>}
    {!assignment&&s.authorizedAt==null&&<p className="text-muted-foreground">Availability is checked again at confirmation. Reviewing does not reserve a crew.</p>}
    {(s.resources.error||(!assignment&&s.authorizedAt==null&&!availableCrew(s.resources,s.resources.proposedId)))&&<p role="alert" className="text-warning">{s.resources.error??INSUFFICIENT_RESOURCES}</p>}
  </section>;
}
export function DispatchResources({s,onClose}:{s:SimState;onClose:()=>void}) {
  const counts=rosterCounts(s.resources),active=activeAssignment(s.resources);
  return <div className="fixed inset-0 z-[78] flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-label="Dispatch Resources" className="flex max-h-full w-full max-w-2xl flex-col rounded border border-border bg-card">
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border p-4"><h2 className="text-lg font-semibold">Dispatch Resources · simulated</h2><Button variant="ghost" size="icon" aria-label="Close dispatch resources" onClick={onClose}><X/></Button></header>
    <dl aria-label="County demo roster" className="grid shrink-0 grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-4">{[['On-duty personnel',counts.onDuty],['Available',counts.available],['Assigned',counts.assigned],['Availability unknown',`${counts.unknownStations} station`]].map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-xl">{value}</dd></div>)}</dl>
    <div className="min-h-0 space-y-4 overflow-y-auto p-4">
      <p className="text-xs text-warning">Fictional demo stations and staffing, not Greenwood County operational records. County totals: 200 volunteers / 13 stations (user-provided), not personnel on duty.</p>
      <p className="text-xs text-muted-foreground">{DEMO_STATIONS.length} listed demo stations · {DEMO_STATIONS.filter(x=>x.personnel!=null).length} with known demo staffing · {DEMO_STATIONS.filter(x=>APPARATUS.some(a=>a.stationId===x.id&&availableCrew(s.resources,a.id))).length} currently able to respond. Missing roster personnel count: unknown, never assumed available.</p>
      <ResourceProposal s={s}/>
      {active&&<><p className="text-xs leading-relaxed">Requested → Acknowledged → En Route → On Scene → Returning → Available</p><div className="flex flex-wrap gap-2">
        {['Requested','Acknowledged'].includes(active.status)&&<><Button size="sm" variant="outline" onClick={()=>sim.set(x=>updateResourceStatus(x,'Cancelled'))}>Cancel request · release crew</Button><Button size="sm" variant="outline" onClick={()=>sim.set(x=>updateResourceStatus(x,'Declined'))}>Simulate station decline</Button></>}
        {active.status==='On Scene'&&<Button size="sm" onClick={()=>sim.set(x=>updateResourceStatus(x,'Returning'))}>Return unit to station · simulated</Button>}
        {active.status==='Returning'&&<Button size="sm" onClick={()=>sim.set(x=>updateResourceStatus(x,'Available'))}>Confirm returned to service · simulated</Button>}
      </div><p className="text-xs text-muted-foreground">On-scene crews remain assigned. Returning alone does not release personnel; confirmed return to service does.</p></>}
      <div className="space-y-3">{DEMO_STATIONS.map(st=>{const c=rosterCounts(s.resources,st.id);return <section key={st.id} className="border-t border-border pt-3 text-xs"><h3 className="flex items-start gap-2 font-semibold"><Building2 className="size-4 shrink-0"/>{st.name}</h3><p className="mt-1 text-muted-foreground">{st.id} · fictional demo</p><p className="mt-2">{st.personnel?`On duty ${c.onDuty} · Available ${c.available} · Assigned ${c.assigned}`:'On duty unknown · Available unknown · Assigned 0 · roster missing'}</p><p className="mt-1">{APPARATUS.filter(a=>a.stationId===st.id).map(a=>`${a.name} (${a.id}) · ${availableCrew(s.resources,a.id)?'available':st.personnel?'assigned':'staffing unknown'}`).join(' · ')}</p></section>;})}</div>
      {s.resources.assignments.length>0&&<section className="border-t border-border pt-3 text-xs"><h3 className="font-semibold">Assignment history</h3>{s.resources.assignments.map(a=><p key={a.id} className="mt-2">{a.apparatusId} · {a.personnel.length} personnel · {a.status} · requested {fmtClock(a.requestedAt,s.scenario)}{a.releasedAt!=null?` · released ${fmtClock(a.releasedAt,s.scenario)}`:''}</p>)}</section>}
    </div>
  </section></div>;
}