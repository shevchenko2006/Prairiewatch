import { useState } from 'react';
import { Plane, Check, AlertTriangle, ChevronDown, Home, ArrowLeft, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sim } from '@/sim/store';
import { fmtClock, type SimState } from '@/sim/engine';
import { DRONE_POLICY, SCENARIO_WEATHER } from '@/sim/config';
import { readiness, requestVerificationReturn, returnReserve, C_DISTANCE, C_TRAVEL_SECONDS, pendingMissionActions, verificationPosition, C_TARGET, C_STRIKE, approveVerificationMission, type WeatherBranch } from '@/sim/drone-verification';
import { initialState } from '@/sim/engine';
import { initialVerification, WEATHER_BRANCHES } from '@/sim/drone-verification';
import { COUNTY, DOCK, DOCK_COORDINATES, DOCK_LABEL, geographicCoordinates } from '@/sim/geo';
import { cn } from '@/lib/utils';

const STAGES = ['Requested', 'Readiness Review', 'Pilot Approved', 'En Route', 'Observing', 'Returning', 'Docked'] as const;

function stageIndex(s: SimState): number {
  const m = s.verification;
  if (!s.fired.includes('c-recommend')) return 0;
  if (m.phase === 'en route') return 3;
  if (m.phase === 'observing') return 4;
  if (m.phase === 'returning') return 5;
  if (m.phase === 'returned') return 6;
  return m.authorized ? 2 : 1;
}

/** Automatic imagery is retained in state regardless of the active tab. Complete images use object-contain with dark letterboxing; expand opens a fit-to-screen overlay with zoom. */
function DroneViewer({s}:{s:SimState}) {
 const [mode,setMode]=useState<'Visible'|'Thermal'>('Visible');
 const [expanded,setExpanded]=useState<null|'Visible'|'Thermal'>(null);
 const [zoom,setZoom]=useState(false);
 const m=s.verification;
 const latest=(x:'Visible'|'Thermal')=>m.snapshots.filter(y=>y.mode===x).at(-1);
 const expandedFrame=expanded?latest(expanded):undefined;
 const observed=geographicCoordinates(C_TARGET);
 const empty=m.phase==='observing'?'Clear viewing position reached · automatic capture pending':m.phase==='en route'?'En route · no fire imagery before arrival':m.reviewRequired?'Verification incomplete · no airborne feed':'Docked · no airborne feed';
 const panel=(x:'Visible'|'Thermal')=>{const f=latest(x);return <figure className="min-w-0">
   <div className="pw-drone-image relative flex aspect-[3/2] items-center justify-center overflow-hidden border border-border bg-background">
     {m.arrivedAt!=null&&f?<img src={f.url} width={1200} height={800} alt={`${x} simulated inspection beyond ridge`} className="h-full w-full object-contain"/>:<figcaption className="p-5 text-center text-sm text-muted-foreground">{empty}</figcaption>}
   </div>
   <figcaption className="mt-1 flex items-center justify-between gap-2 text-[11px]"><span>{x} · {f?fmtClock(f.t,s.scenario):'—'} · simulated</span>{f&&<Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-[11px] text-observation" onClick={()=>{setExpanded(x);setZoom(false);}}>Expand</Button>}</figcaption>
 </figure>;};
  return <section aria-label="Drone camera viewer" className="space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Drone imagery · automatic paired capture</h3>{m.snapshots.length>0&&<Button variant="outline" size="sm" onClick={()=>{setExpanded(mode);setZoom(false);}}>Expand Images · Fit to Screen</Button>}</div>
   {/* Wide screens: Visible and Thermal side by side. Small screens: switch. */}
   <div className="hidden gap-3 lg:grid lg:grid-cols-2">{panel('Visible')}{panel('Thermal')}</div>
   <div className="lg:hidden">
     {panel(mode)}
     <div className="mt-2 flex gap-2">{(['Visible','Thermal'] as const).map(x=><Button key={x} aria-pressed={mode===x} variant={mode===x?'secondary':'ghost'} size="sm" onClick={()=>setMode(x)}>{x}</Button>)}</div>
   </div>
   <p className="text-xs text-warning">AI-generated simulated stills · thermal is illustrative, not a temperature measurement. Clear angle beyond ridge, never through terrain.</p>
   <p className="text-xs text-muted-foreground">Observed fire location: {m.locationAttached?`${observed.lat.toFixed(5)}, ${observed.lon.toFixed(5)} · supported simulated observation`:'Uncertain · broad suspected source area'}</p>
   {expanded&&<div role="dialog" aria-label={`${expanded} image expanded`} className="fixed inset-0 z-[80] flex flex-col bg-background/95 p-4 backdrop-blur-sm">
     <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
       <div className="flex gap-2">{(['Visible','Thermal'] as const).map(x=><Button key={x} size="sm" aria-pressed={expanded===x} variant={expanded===x?'secondary':'ghost'} onClick={()=>setExpanded(x)}>{x}</Button>)}</div>
       <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-pressed={zoom} onClick={()=>setZoom(!zoom)}>{zoom?'Fit to Screen':'Zoom'}</Button><Button size="sm" variant="outline" aria-label="Close expanded image" onClick={()=>setExpanded(null)}>Close</Button></div>
     </div>
     <div className="mt-3 flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background">
       {expandedFrame?<img src={expandedFrame.url} width={1200} height={800} alt={`${expanded} simulated inspection expanded`} className={zoom?'max-w-none':'max-h-full max-w-full object-contain'}/>:<p className="text-sm text-muted-foreground">No capture yet.</p>}
     </div>
     <p className="shrink-0 pt-2 text-center text-[11px] text-muted-foreground">{expanded} · {expandedFrame?fmtClock(expandedFrame.t,s.scenario):'—'} · simulated · thermal illustrative</p>
   </div>}
   <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">All captures · {m.snapshots.length}</summary><div className="mt-2 grid grid-cols-2 gap-3">{m.snapshots.map((x,i)=><a key={i} href={x.url} download className="min-w-0 border border-border"><img loading="lazy" src={x.url} width={1200} height={800} alt={`${x.mode} ${i<2?'initial':'successive'} simulated observation`} className="aspect-[3/2] w-full object-contain bg-background"/><p className="p-2 text-[11px]">{x.mode} · {fmtClock(x.t,s.scenario)} · {i<2?'initial':'successive'}</p></a>)}</div></details>
   <details className="border-y border-border py-3" aria-label="AI Assessment">
     <summary className="cursor-pointer text-sm font-semibold">AI Assessment · simulated</summary>
     <p className="mt-2 text-xs text-warning">Simulated AI assessment—scripted demonstration.</p>
     {m.assessmentAt!=null?<ul className="mt-3 space-y-2 text-xs"><li>Visible flames detected · scripted</li><li>Corresponding thermal hotspot · illustrative</li><li>Apparent spread across successive simulated observations</li></ul>:<p className="mt-2 text-xs text-muted-foreground">Assessment pending successive observations.</p>}
     <p className="mt-3 text-xs">Burn-record result: {m.burnCheckedAt!=null?'No matching scheduled burn found · simulated registry':'Pending'}</p>
     <p className="mt-2 text-xs text-muted-foreground">No record alone does not prove an uncontrolled fire. Intended production assessment would require a model trained on labeled fire/non-fire examples and independent validation; no such classifier is connected here.</p>
     {m.accepted&&<p className="mt-3 text-sm text-warning">Suspected uncontrolled fire—dispatcher review required.</p>}
   </details>
   {s.fired.includes('c-decision')&&<section aria-label="Dispatcher package" className="space-y-2 border-l-2 border-warning pl-3"><h3 className="text-sm font-semibold">Simulated dispatcher package · PKT-C-DRONE</h3><p className="text-xs">Camera30 + SMS20 + agreement10 + drone40 =100 (capped). Paired timestamped images, supported location above, wind {m.wind} / gusts {m.gusts} mph, scripted assessment and burn-record context.</p><p className="text-xs text-warning">{s.authorizedAt!=null?'Simulated dispatcher response authorized '+fmtClock(s.authorizedAt,s.scenario):'Simulated human dispatcher review pending.'} Response initiation is not engine arrival; no real communications occur.</p></section>}
 </section>;
}

function DockSection() {
  return (
    <section>
      <h3 className="text-sm font-semibold">Dock and aircraft</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Dock</dt><dd className="mt-1 font-mono">{DOCK_LABEL}</dd></div>
        <div><dt className="text-muted-foreground">Dock coordinates</dt><dd className="mt-1 font-mono">{DOCK_COORDINATES.lat.toFixed(5)}, {DOCK_COORDINATES.lon.toFixed(5)}</dd></div>
        <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1 font-mono">Proposed · simulated</dd></div>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">County polygon centroid · pending physical site assessment. No physical aircraft or commands are involved.</p>
    </section>
  );
}

/** Drone tab — available in every scenario with scenario-specific states. All content is simulated. */
export function DroneMissionView({ s, back }: { s: SimState; back: () => void }) {
  const m = s.verification;
  const [checksOpen, setChecksOpen] = useState(false);
  const checks = readiness(s,false);
  const physical = readiness(s, false);
  const ready = physical.every(c => c.status === 'Ready');
  const recommended = s.fired.includes('c-recommend');
  const status = physical.some(c => c.status === 'Unknown') ? 'Unknown' : physical.some(c => c.status === 'Blocked') ? 'Blocked' : 'Ready';
  const blocked = physical.find(c => c.status !== 'Ready');
  const actions = pendingMissionActions(s);
  const stage = stageIndex(s);
  const history = s.log.filter(l => l.source === 'drone-mission'||l.text.startsWith('c-')||l.source==='system'||l.source==='dispatcher');
  const evidenceReady = m.locationAttached && m.snapshots.some(x => x.mode === 'Visible') && m.snapshots.some(x => x.mode === 'Thermal');

  if (s.scenario === 'A') {
    return (
      <section aria-label="Drone mission" className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
          <Button variant="ghost" onClick={back}><ArrowLeft />Back to incident</Button>
          <span className="text-xs text-warning">SIMULATED — NO PHYSICAL COMMAND</span>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <div className="border-l-2 border-warning pl-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-warning"><Wind className="size-5" />Deployment blocked by wind</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A drone was requested when the fire reached Verify, but the scenario's weather exceeds the configured demo operating limits. The drone never launches in this storyline; there is no airborne feed.</p>
          </div>
          <section>
            <h3 className="text-sm font-semibold">Failed weather checks</h3>
            <div className="mt-3 divide-y divide-border">
              {[
                { label: 'Sustained wind', value: `${SCENARIO_WEATHER.windMph} mph · must be below ${DRONE_POLICY.sustainedBelowMph} mph` },
                { label: 'Wind gusts', value: `35 mph · must be below ${DRONE_POLICY.gustBelowMph} mph` },
              ].map(c => (
                <div key={c.label} className="py-2">
                  <div className="flex justify-between gap-2 text-xs"><span>{c.label}</span><span className="text-warning"><AlertTriangle className="mr-1 inline size-3" />Blocked</span></div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{c.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-warning">Illustrative demo policy — not manufacturer specifications.</p>
          </section>
          <p className="text-xs leading-relaxed text-muted-foreground">Verification continues through tower cameras, satellite checks and resident reports. Emergency services act on ground evidence, not on drone availability.</p>
          <DockSection />
        </div>
      </section>
    );
  }

  if (s.scenario === 'B') {
    return (
      <section aria-label="Drone mission" className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
          <Button variant="ghost" onClick={back}><ArrowLeft />Back to incident</Button>
          <span className="text-xs text-warning">SIMULATED — NO PHYSICAL COMMAND</span>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <div className="border-l-2 border-observation pl-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Plane className="size-5 text-observation" />Docked — no verification mission requested</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The transformer failure produced no fire evidence: the tower camera's clear view, the satellite frame and the closed match window keep the evidence index at 0 — far below the Verify threshold of {40}. No drone mission is ever requested in this scenario.</p>
          </div>
          <DockSection />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Drone mission" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
        <Button variant="ghost" onClick={back}><ArrowLeft />Back to incident</Button>
        <span className="text-xs text-warning">SIMULATED MISSION — NO PHYSICAL COMMAND</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Sticky decision area: incident, readiness summary, key weather, pilot authorization. */}
        <div className="pw-mission-summary sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase text-muted-foreground">Incident C-0300 · Suspected lightning ignition · drone verification mission</p>
              <h2 className="mt-1 text-lg font-semibold">Identify the plume source beyond the ridge</h2>
              <p className="mt-1 text-xs text-muted-foreground">Earlier simulated strike {fmtClock(C_STRIKE.t,'C').replace(':00 PM',' PM')} · ±{C_STRIKE.uncertaintyKm} km uncertainty · {C_STRIKE.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">Wind {m.wind ?? '—'} mph · gusts {m.gusts ?? '—'} mph · visibility {m.visibilityKm ?? '—'} km · red flag warning</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs', status === 'Ready' ? 'border-primary text-primary' : 'border-warning text-warning')}>
                {status === 'Ready' ? <Check className="size-3" /> : <AlertTriangle className="size-3" />}Readiness · {status}
              </span>
              <span className="text-xs text-observation">Pilot-supervised automated mission · {m.phase}</span>
              {s.awaitingPilotApproval && (
                <Button className="h-auto min-h-11 whitespace-normal px-5 text-sm" onClick={() => sim.set(approveVerificationMission)}>Authorize Simulated Mission</Button>
              )}
              {s.awaitingPilotApproval && <p className="max-w-64 text-right text-[11px] leading-snug text-muted-foreground">Supervising pilot: {m.pilotName}. One click approves; no second confirmation. Simulation—required operating authorizations assumed; this button grants no FAA approval and monitoring alone does not authorize BVLOS flight.</p>}
              {recommended && m.phase === 'docked' && !s.awaitingPilotApproval && (!ready || m.reviewRequired) && (
                <p className="max-w-64 text-right text-[11px] leading-snug text-warning">
                  {m.reviewRequired && m.branch === 'blocked' ? 'Launch blocked — wind exceeds configured demo limits.' : m.reviewRequired && m.branch === 'lightning' ? 'Launch blocked—lightning proximity.' : blocked ? `${blocked.label}: ${blocked.reason}` : 'Pilot approval required.'}
                </p>
              )}
              <button type="button" className="flex items-center gap-1 text-[11px] text-observation" aria-expanded={checksOpen} onClick={() => setChecksOpen(!checksOpen)}>
                Full readiness checklist <ChevronDown className={cn('size-3 transition-transform', checksOpen && 'rotate-180')} />
              </button>
            </div>
          </div>
          {checksOpen && (
            <div className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
              {checks.map(c => (
                <div key={c.label} className="text-xs">
                  <div className="flex justify-between gap-2"><span>{c.label}</span><span className={c.status === 'Ready' ? 'text-primary' : 'text-warning'}>{c.status}</span></div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{c.reason}</p>
                </div>
              ))}
              <p className="text-[10px] text-warning sm:col-span-2">Illustrative demo policy — not manufacturer specifications. Configured operating authorization is checked automatically and is separate from dispatcher confirmation of the fire response.</p>
            </div>
          )}
        </div>

        <div className="space-y-6 p-5">
          {/* Mission stage stepper */}
          <nav aria-label="Mission stage">
            <ol className="flex flex-wrap items-center gap-y-2">
              {STAGES.map((label, i) => (
                <li key={label} className="flex items-center">
                  <span className={cn('flex items-center gap-1.5 text-xs', i < stage ? 'text-primary' : i === stage ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    <span className={cn('flex size-5 items-center justify-center rounded-full border font-mono text-[10px]', i < stage ? 'border-primary text-primary' : i === stage ? 'border-foreground' : 'border-border')}>{i < stage ? <Check className="size-3" /> : i + 1}</span>
                    {label}
                  </span>
                  {i < STAGES.length - 1 && <span className="mx-2 h-px w-4 bg-border" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>

          {m.reviewRequired&&<details className="border-l-2 border-warning pl-3"><summary className="cursor-pointer text-sm text-warning">Emergency dispatcher review · verification incomplete</summary><p className="mt-2 text-xs text-muted-foreground">Suspected lightning association—cause unconfirmed. Camera30 + SMS20 + agreement10 =60; drone evidence incomplete. Wind {m.wind} / gusts {m.gusts} mph. Emergency services may act independently of drone verification; no automatic fire confirmation is fabricated.</p><Button variant="outline" className="mt-3" onClick={()=>sim.set(x=>({...x,log:[...x.log,{id:`log-${x.log.length}`,t:x.t,source:'dispatcher',text:'SIMULATED emergency dispatcher review requested for incomplete drone verification; no physical dispatch or automatic confirmation.'}]}))}>Request simulated emergency review</Button></details>}
          {actions.length > 0 && (
            <p role="status" className="border-l-2 border-warning pl-3 text-sm text-warning">Dispatcher review: {actions.join(' · ')}</p>
          )}

          <section className="border-l-2 border-observation pl-3">
            <h3 className="text-sm font-semibold text-observation">Why drone verification?</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {['Ground source hidden by terrain (ridge).', 'TW-02 offline; other cameras lack a usable angle.', 'No usable satellite confirmation yet.', 'Distant resident reports a plume but cannot inspect the ignition area.', 'No matching scheduled burn found.', 'Ground inspection delayed.'].map(x => <li key={x}>{x}</li>)}
            </ul>
            <p className="mt-3 text-xs leading-relaxed">Evidence warrants verification, but existing sources cannot identify what is producing the plume. The drone can obtain a closer view before ground personnel arrive.</p>
            <p className="mt-2 text-xs text-warning">Emergency services may act without drone verification.</p>
          </section>

          <section className="border-y border-border py-3">
            <h3 className="text-xs uppercase text-muted-foreground">Strike vs current flight conditions · simulated</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Earlier strike</dt><dd className="mt-1 font-mono">{fmtClock(C_STRIKE.t,'C').replace(':00 PM',' PM')} · ±{C_STRIKE.uncertaintyKm} km</dd></div>
              <div><dt className="text-muted-foreground">Weather observed</dt><dd className="mt-1 font-mono">{m.weatherAt!=null?fmtClock(m.weatherAt,s.scenario):'—'} · {m.weatherSource ?? 'source unknown'}</dd></div>
              <div><dt className="text-muted-foreground">Wind / gusts</dt><dd className="mt-1 font-mono">{m.wind ?? '—'} / {m.gusts ?? '—'} mph</dd></div>
              <div><dt className="text-muted-foreground">Precipitation / visibility</dt><dd className="mt-1 font-mono">{m.precipitation==null?'—':m.precipitation?'Yes':'None'} · {m.visibilityKm ?? '—'} km</dd></div>
              <div><dt className="text-muted-foreground">Nearby lightning now</dt><dd className={cn('mt-1 font-mono',m.lightning&&'text-warning')}>{m.lightning==null?'—':m.lightning?'Active · launch blocked—lightning proximity':'None'}</dd></div>
              <div><dt className="text-muted-foreground">Data freshness</dt><dd className="mt-1 font-mono">{m.weatherAt==null?'Unknown':`${Math.max(0,Math.round(s.t-m.weatherAt))}s old · max ${DRONE_POLICY.maxWeatherAgeSeconds}s`}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">An earlier strike does not mean current flight conditions are safe; the lightning-proximity check uses current simulated observations. Lightning records are simulated — no real feed is integrated.</p>
          </section>

          <section className="border-b border-border pb-3">
            <label htmlFor="drone-weather-branch" className="text-xs uppercase text-muted-foreground">Scenario C · weather replay</label>
            <select id="drone-weather-branch" value={m.branch} className="mt-2 w-full max-w-sm rounded border border-input bg-background p-2 text-xs" onChange={e => { const branch = e.target.value as WeatherBranch; sim.set(() => ({ ...initialState('C'), verification: initialVerification(branch) })); }}>
              {Object.entries(WEATHER_BRANCHES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">All conditions, checks, detections and actions are simulated.</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Dock and aircraft</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              {[['Aircraft', m.phase + ' · simulated'], ['Dock', 'Central county dock · proposed'], ['Route distance', C_DISTANCE.toFixed(2) + ' km'], ['Estimated flight time', Math.ceil(C_TRAVEL_SECONDS + DRONE_POLICY.launchSeconds) + 's · distance / simulated speed'], ['Estimated return reserve', (returnReserve(m)?.toFixed(0) ?? '—') + '%'], ['Ground route', DRONE_POLICY.groundRouteKm + ' km · ~' + Math.ceil(DRONE_POLICY.groundRouteKm / DRONE_POLICY.groundSpeedKmPerSecond / 60) + ' min illustrative']].map(([k, v]) => (
                <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 font-mono">{v}</dd></div>
              ))}
            </dl>
          </section>

          {/* Stage-revealed controls */}
          {['en route', 'observing'].includes(m.phase) && (
            <section className="space-y-3 rounded border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Mission status · {m.phase}</h3>
              <p className="text-xs text-muted-foreground">Supervising pilot: {m.pilotName} · launched {m.launchAt != null ? fmtClock(m.launchAt,s.scenario) : '—'} · estimated arrival {m.launchAt != null ? fmtClock(m.launchAt + DRONE_POLICY.launchSeconds + C_TRAVEL_SECONDS,s.scenario) : '—'}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => sim.set(x => requestVerificationReturn(x))}><Home />Abort / return to dock · simulated</Button>
              </div>
              {m.phase === 'observing' && !evidenceReady && <p className="text-xs text-muted-foreground">Automatic paired capture and supported location attachment follow arrival.</p>}
              {evidenceReady && !m.accepted && <p className="text-xs text-warning">Captured imagery awaits scripted assessment and burn-record context.</p>}
            </section>
          )}

          <section aria-label="Mission position" className="border-y border-border py-3"><h3 className="text-sm font-semibold">Mission position · simulated</h3><svg viewBox="0 0 60 72" className="mt-2 h-48 w-full" role="img" aria-label={`Drone position ${m.phase}`}><polygon points={COUNTY.map(p=>`${p[0]+4},${68-p[1]}`).join(' ')} fill="var(--card)" stroke="var(--border)" strokeWidth=".3"/><line x1={DOCK[0]+4} y1={68-DOCK[1]} x2={C_TARGET[0]+4} y2={68-C_TARGET[1]} stroke="var(--primary)" strokeWidth=".5"/><circle cx={verificationPosition(m,s.t)[0]+4} cy={68-verificationPosition(m,s.t)[1]} r="1" fill="var(--observation)"/></svg><p className="text-xs">Battery {m.battery??'Unknown'}% · estimated round-trip reserve {returnReserve(m)?.toFixed(0)??'Unknown'}% · {C_DISTANCE.toFixed(2)} km at 12 m/s</p></section>
          {/* Drone visible/thermal viewer lives in this tab alongside mission controls. */}
          <DroneViewer s={s} />

          {m.phase === 'returning' && <p role="status" className="text-sm text-muted-foreground">Returning to the central dock · simulated.</p>}

          {(m.phase === 'returned' || m.accepted) && (
            <section className="space-y-3 rounded border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Mission summary</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {m.accepted ? 'Visible and thermal evidence captured · observation location recorded · evidence package available for dispatcher review.' : 'Verification incomplete — dispatcher review required. No automatic fire confirmation or closure.'}
              </p>
              {m.accepted && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-muted-foreground">Before drone</p><p className="mt-1">Source obscured · broad suspected location · no timely close-range confirmation.</p></div>
                  <div><p className="text-primary">After drone</p><p className="mt-1">Visible and thermal evidence captured · observation location recorded · evidence package available for dispatcher review.</p></div>
                </div>
              )}
            </section>
          )}

          <p className="text-[10px] leading-relaxed text-muted-foreground">Proposed simulation rule — requires validation: qualifying visible flames and a corresponding thermal hotspot +40 Drone evidence, capped at 40. Launch, video and unexplained warmth earn 0. Ground optical class, shared with towers; no new class bonus.</p>

          <section>
            <h3 className="text-sm font-semibold">Mission history</h3>
            {history.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No mission actions recorded yet.</p> : (
              <ol className="mt-3 space-y-3">
                {history.map(l => (
                  <li key={l.id} className="text-xs leading-relaxed">
                    <div className="mb-0.5 flex justify-between font-mono text-muted-foreground"><span>{l.source}{l.total != null ? ` · total ${l.total}` : ''}</span><time>{fmtClock(l.t,s.scenario)}</time></div>
                    {l.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
