import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, FileText, Radio, Camera, Satellite, Phone, Zap, CloudSun, Cpu, Plane, Truck } from "lucide-react";
import { APPARATUS, DEMO_STATIONS, activeAssignment } from "@/sim/resources";
import { Button } from "@/components/ui/button";
import { acknowledge, authorize, canAuthorize, closeIncident, continueMonitoring, fmtClock, score, type SimState } from "@/sim/engine";
import { evidenceStatus, type Obs } from "@/sim/scoring";
import { SCORING, SCENARIO_WEATHER, THRESHOLDS } from "@/sim/config";
import { sim } from "@/sim/store";
import type { Selection } from "./types";
import { cn } from "@/lib/utils";
import { displayedScore, eventEffect } from "@/sim/presentation";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { TopographicBackground } from "./TopographicBackground";
import { CountyCapacity } from "./DispatcherActions";
import { FootprintReadout } from "./FootprintReadout";
import { pendingMissionActions, readiness, C_STRIKE } from "@/sim/drone-verification";

const sourceLabel: Record<Obs["kind"], string> = { drone: "Drone · Ground optical", camera: "Ground optical", utility: "Outage feed", sms: "Enrolled reporter", goes: "GOES · orbital", "911": "911 · human" };
function describe(o: Obs) {
  if (o.kind === "camera") return o.clearView ? "TW-01 · clear view, no smoke (−15 floored at zero)" : `${o.cameraId === "TWR-A" ? "TW-01 (Camera A)" : "TW-02 (Camera B)"} · confidence ${o.confidence.toFixed(2)}${o.growing ? " · growing plume" : o.crossingBearing ? " · crossing bearing" : " · smoke"}`;
  if (o.kind === "sms") return `${o.witnessName} · ${o.trusted ? "GPS · trusted reporter" : "GPS pin · plume report, not flames"}`;
  if (o.kind === "utility") return `Outage reported${o.cause ? ` · cause: ${o.cause}` : ""} · locked until smoke or heat matches`;
  if (o.kind === "goes") return `${o.category} probability category · next available frame`;
  return sourceLabel[o.kind];
}

/** Step chart of the total evidence index over scenario time, from audited log totals. */
function EvidenceChart({ s }: { s: SimState }) {
  const points = s.log.filter(l => l.total != null).map(l => ({ t: l.t, total: l.total ?? 0 }));
  const W = 300, H = 84, maxT = Math.max(s.scenario==='C'?600:1860, s.t, ...points.map(p => p.t));
  const x = (t: number) => (t / maxT) * (W - 8) + 4;
  const y = (v: number) => H - 6 - (v / 100) * (H - 16);
  // Step path: horizontal to each event time, then vertical to its audited total.
  let d = `M${x(0)},${y(0)}`;
  let prev = 0;
  for (const p of points) {
    d += `L${x(p.t)},${y(prev)}L${x(p.t)},${y(p.total)}`;
    prev = p.total;
  }
  d += `L${x(Math.max(s.t, points.at(-1)?.t ?? 0))},${y(prev)}`;
  return (
    <section>
      <h3 className="text-xs uppercase text-muted-foreground">Evidence over time</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full rounded border border-border bg-background" aria-label="Total evidence index over time">
        {[THRESHOLDS.log, THRESHOLDS.verify.redFlag, THRESHOLDS.confirmed].map(v => (
          <g key={v}>
            <line x1={4} x2={W - 4} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray="3 3" />
            <text x={W - 6} y={y(v) - 2} textAnchor="end" fontSize={7} fill="var(--muted-foreground)">{v === 30 ? "Watch 30" : v === 40 ? "Verify 40" : "Confirmed 80"}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth={1.6} />
        <circle cx={x(Math.max(s.t, points.at(-1)?.t ?? 0))} cy={y(prev)} r={2.4} fill="var(--primary)" />
        <text x={4} y={H - 1} fontSize={7} fill="var(--muted-foreground)">{s.scenario==='C'?'3:00 PM':'2:00 PM'}</text>
        <text x={W - 4} y={H - 1} textAnchor="end" fontSize={7} fill="var(--muted-foreground)">{fmtClock(maxT,s.scenario).replace(":00 PM", " PM")}</text>
      </svg>
    </section>
  );
}

/** The four-step outage confirmation loop, distinct from continuous monitoring. */
function OutageLoop({ s }: { s: SimState }) {
  const steps = [
    { label: s.scenario==='C'?'Simulated utility outage location and start time':"Outage API reports an event", done: s.outageAt != null },
    { label: "Fusion engine prompts cameras to inspect the affected line, checks the next available satellite frame and retrieves weather", done: s.fired.includes("weather") || s.fired.includes("c-weather") },
    { label: "Findings return to the engine", done: s.fired.includes("cam1") || s.fired.includes("clear") || s.fired.includes("c-cam1") },
    { label: "Engine evaluates whether the outage evidence index unlocks", done: s.outageUnlocked || s.fired.includes("window-closed") },
  ];
  const current = steps.findIndex(x => !x.done);
  return (
    <section className="rounded border border-border bg-background p-3">
      <h3 className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Zap className="size-3.5 text-warning"/>Outage confirmation loop</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">Targeted checks · earns no points until matching smoke or heat evidence exists. PrairieWatch does not control satellite image acquisition.</p>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={i} className={cn("flex items-start gap-2 text-xs leading-relaxed", step.done ? "text-foreground" : i === current ? "text-warning" : "text-muted-foreground")}>
            <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px]", step.done ? "border-primary text-primary" : i === current ? "border-warning text-warning" : "border-border")}>{step.done ? <Check className="size-2.5"/> : i + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
        {s.outageUnlocked ? s.scenario==='C'?'Outcome: simulated smoke match +10; no wind bonus or cause modifier.':"Outcome: unlocked — smoke matched the outage (+10 match, +5 wind)." : s.fired.includes("window-closed") ? "Outcome: match window closed — index stays locked at 0." : "Outcome: pending findings."}
      </p>
    </section>
  );
}

export function SidePanel({ s, select, openCamera, openDrone, openResources }: { s: SimState; select: (x: Selection) => void; openCamera: () => void; openDrone: () => void; openResources: () => void }) {
  const [tab, setTab] = useState<"incident" | "activity" | "about">("incident");
  const [reason, setReason] = useState("");
  const b = score(s);
  const reduced = useReducedMotion();
  const visibleScore = displayedScore(s, reduced);
  const highlight = Math.max(...["cam1","cam2","cam-b","sms","goes"].map(id=>eventEffect(s,id,reduced)));
  const st = evidenceStatus(b, s.weather, false);
  const noInc = s.incidentAt == null;
  const alert = s.alertAt != null && s.authorizedAt == null && !s.closed;
  const cards = [
    ...(s.scenario==='C'?[{label:"Drone · proposed",icon:Camera,group:b.drone,cap:40,accent:true}]:[]),
    { label: "Tower cameras", icon: Camera, group: b.camera, cap: SCORING.camera.cap, accent: true },
    { label: "GOES satellite", icon: Satellite, group: b.goes, cap: SCORING.goes.cap, accent: true },
    { label: "Resident SMS", icon: Radio, group: b.sms, cap: SCORING.sms.cap, accent: false },
    { label: "911 calls", icon: Phone, group: b.e911, cap: SCORING.e911.cap, accent: false },
    { label: "Outage feed", icon: Zap, group: b.outage, cap: SCORING.outage.cap, accent: false },
  ] as const;
  return <aside className="relative isolate flex h-full min-h-0 flex-col border-l border-border bg-card">
    <TopographicBackground variant="sidebar"/>
    <div className="relative flex shrink-0 gap-1 bg-card px-3 py-3">
      {(["incident", "activity", "about"] as const).map(k => <Button key={k} variant="ghost" size="sm" onClick={() => setTab(k)} className={cn("flex-1", tab === k && "bg-secondary text-secondary-foreground")}>{k === "activity" ? `Activity · ${s.log.length}` : k === "incident" ? "Overview" : "About"}</Button>)}
    </div>
    <div className="pw-panel-scroll relative min-h-0 flex-1 overflow-y-auto p-5">
      {tab === "incident" && <div className="space-y-4">
        <section>
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="uppercase">{noInc ? "Observation status" : `Incident ${s.scenario}-0203`}</span><Radio className="size-4 text-observation"/></div>
          <h2 className="mt-3 text-xl font-semibold">{s.closed ? "Incident closed" : s.authorizedAt != null ? s.dispatchMode==='override'?"Response initiated by override":"Response authorized" : st.state === "Confirmed" ? "Confirmed — dispatcher review" : noInc ? s.fired.includes("window-closed") ? "Checks complete — no escalation" : s.clearViewAt != null ? "No fire evidence" : "Monitoring" : st.state}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{st.state === "Confirmed" && s.authorizedAt == null ? "The total reached 80. The dispatcher alert package is ready for review; no deployment authorized." : s.clearViewAt != null ? "No fire evidence observed in the checked view." : noInc ? "Awaiting fire observations." : "Evidence under review"}</p>
          {s.scenario === "B" && s.clearViewAt != null && <p className="mt-4 border-l-2 border-muted-foreground pl-3 text-sm leading-relaxed">Outage logged. No fire evidence. No resources mobilized.</p>}
        </section>

        <section className={cn("border-t border-border py-4",highlight>0 && "border-primary")}>
          <div className="flex items-end justify-between"><span className="text-sm text-muted-foreground">Total evidence index</span><div className="font-mono"><strong data-testid="evidence-score" aria-label={`${b.total} evidence points`} className="text-4xl font-medium text-primary">{visibleScore}</strong><span className="ml-2 text-sm text-muted-foreground">/ 100</span></div></div>
          <div className="relative mt-4 h-2 overflow-hidden rounded bg-border" aria-label="Threshold bands: Watch 30, Verify 40, Confirmed 80">
            <div className="absolute inset-y-0 left-[30%] w-[10%] bg-warning/15"/>
            <div className="absolute inset-y-0 left-[40%] w-[40%] bg-primary/10"/>
            <div className="absolute inset-y-0 left-[80%] w-[20%] bg-danger/15"/>
            <div className="relative h-full bg-primary" style={{width:`${visibleScore}%`}}/>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground"><span>Log</span><span>Watch 30</span><span>Verify {st.verifyAt}</span><span>Confirmed 80</span></div>
          <p className="mt-2 text-xs"><span className="text-muted-foreground">Evidence state: </span><span className={st.state === "Confirmed" ? "text-primary" : "text-foreground"}>{st.state}</span></p>
          <p className="mt-1 text-xs text-muted-foreground">Rule-based evidence index · not a probability or percentage confidence</p>
        </section>

        <section>
          <h3 className="text-xs uppercase text-muted-foreground">Source evidence indexes</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {cards.map(({ label, icon: Icon, group, cap, accent }) => (
              <div key={label} className="rounded border border-border bg-background p-2.5">
                <div className={cn("flex items-center gap-1.5 text-[11px]", accent ? "text-observation" : "text-muted-foreground")}><Icon className="size-3.5"/>{label}</div>
                <p className="mt-1.5 font-mono text-lg"><span className={group.points > 0 ? "text-primary" : "text-foreground"}>{group.points}</span><span className="text-xs text-muted-foreground"> / {cap}</span></p>
                {label === "Outage feed" && b.outage.locked && <p className="mt-0.5 text-[10px] text-warning">Locked · no smoke/heat match</p>}
              </div>
            ))}
            <div className="rounded border border-border bg-background p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-warning"><CloudSun className="size-3.5"/>Weather</div>
              <p className="mt-1.5 text-[11px] leading-snug">Red flag warning · {s.scenario==='C'?s.verification.wind:SCENARIO_WEATHER.windMph} mph wind{s.scenario==='C'&&` · gusts ${s.verification.gusts}`}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">No index · sets Verify threshold {st.verifyAt}</p>
            </div>
          </div>
        </section>

        <section className="rounded border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Cpu className="size-3.5 text-primary"/>Fusion engine</h3>
          <p className="mt-2 font-mono text-xs leading-relaxed" data-testid="fusion-calc">
            MIN(100, {b.camera.points} cam + {b.goes.points} GOES + {b.sms.points} SMS + {b.e911.points} 911 + {b.outage.points} outage + {b.cross.points} agreement{s.scenario==='C'&&` + ${b.drone.points} drone`}) = <span className="text-primary">{b.total}</span>
          </p>
          {b.cross.classes.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Agreeing classes: {b.cross.classes.join(", ")}</p>}
          <details className="mt-3 text-sm"><summary className="flex cursor-pointer items-center justify-between text-primary">Why these points <ChevronDown className="size-4"/></summary><div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">Each index is capped at its own limit and floored at zero. Indexes keep updating during Respond, even at the 100 cap.</p>{([["Tower cameras",b.camera],["GOES satellite",b.goes],["Resident SMS",b.sms],["911 calls",b.e911],["Outage feed",b.outage],["Cross-class agreement",b.cross]] as const).map(([label,g]) => <div key={label}><div className="flex justify-between text-xs"><span>{label}</span><span className="font-mono">{g.points}</span></div>{g.lines.map((line,i) => <p key={i} className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{line}</p>)}</div>)}</div></details>
        </section>

        {s.scenario!=='C' && <OutageLoop s={s}/>}
        {s.scenario==='C' && <section className="rounded border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Zap className="size-3.5 text-lightning"/>Lightning context · simulated</h3>
          <p className="mt-2 text-xs leading-relaxed">Earlier strike recorded {fmtClock(C_STRIKE.t,'C').replace(':00 PM',' PM')} near remote pasture · ±{C_STRIKE.uncertaintyKm} km location uncertainty.</p>
          <p className="mt-2 text-xs text-warning">{C_STRIKE.label}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Context only — zero points. A nearby strike does not establish cause, and an earlier strike does not mean current flight conditions are safe.</p>
        </section>}
        {(()=>{const actions=pendingMissionActions(s);const ph=readiness(s,false);const st=ph.some(c=>c.status==='Unknown')?'Unknown':ph.some(c=>c.status==='Blocked')?'Blocked':'Ready';const label=s.scenario==='C'?(s.awaitingPilotApproval?'Drone verification recommended · pilot approval required':`Drone mission · ${s.verification.phase} · readiness ${st}`):s.scenario==='A'?'Drone · deployment blocked by wind':'Drone · docked, no mission requested';return (
          <button type="button" onClick={openDrone} className="flex w-full items-center justify-between gap-3 rounded border border-observation/40 bg-background p-3 text-left" aria-label={`${label}${actions.length?`, ${actions.length} pending action`:""}`}>
            <span className="flex min-w-0 items-center gap-2 text-xs text-observation"><Plane className="size-3.5 shrink-0"/><span className="whitespace-normal">{label}</span></span>
            {actions.length>0?<span className="shrink-0 rounded-full bg-warning px-2 py-0.5 font-mono text-[10px] text-background">{actions.length} action{actions.length===1?"":"s"}</span>:<span className="shrink-0 font-mono text-[10px] text-muted-foreground">Open Drone tab</span>}
          </button>);})()}
        <CountyCapacity/>
        {(()=>{const asn=activeAssignment(s.resources);if(!asn)return null;const unit=APPARATUS.find(a=>a.id===asn.apparatusId);const station=DEMO_STATIONS.find(d=>d.id===asn.stationId);const rows:[string,number|null][]=[["Requested",asn.requestedAt],["Acknowledged",asn.acknowledgedAt],["En route",asn.enRouteAt],["On scene",asn.onSceneAt]];return (
          <section className="rounded border border-border bg-background p-3" data-testid="response-resource-card">
            <h3 className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Truck className="size-3.5 text-primary"/>Response resource · simulated</h3>
            <p className="mt-2 text-sm font-medium">{unit?.name ?? "Unit"} · <span className="text-primary">{asn.status}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{station?.name} · fictional demonstration station</p>
            <p className="mt-1 text-xs text-muted-foreground">Assigned personnel: {asn.personnel.length} · {asn.personnel.join(", ")}</p>
            <dl className="mt-2 space-y-1 font-mono text-[11px]">
              {rows.map(([label,at]) => <div key={label} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd>{at != null ? fmtClock(at, s.scenario) : "—"}</dd></div>)}
              {asn.onSceneAt == null && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">ETA</dt><dd>{fmtClock(asn.eta, s.scenario)}</dd></div>}
            </dl>
            <p className="mt-2 text-[10px] text-muted-foreground">Personnel stay assigned until explicitly returned to service.</p>
          </section>);})()}
        <Button variant="outline" className="h-auto min-h-10 w-full whitespace-normal" onClick={openResources}>Dispatch Resources · review roster and assignment</Button>
        <EvidenceChart s={s}/>
        <FootprintReadout s={s}/>
        {(s.incidentAt != null || s.outageAt != null) && <Button variant="outline" className="w-full text-observation" onClick={openCamera}><Camera/>View tower cameras</Button>}
        {!noInc && <section className="space-y-3"><h3 className="text-xs uppercase text-muted-foreground">Dispatcher actions</h3>
          {s.alertAt != null && <Button variant="outline" className="w-full justify-start" disabled={s.acknowledgedAt != null || !!s.closed} onClick={() => sim.set(acknowledge)}><Check/>{s.acknowledgedAt != null ? "Alert acknowledged" : "Acknowledge alert"}</Button>}
          {canAuthorize(s) == null && <Button className="h-auto min-h-10 w-full whitespace-normal text-left" onClick={() => sim.set(authorize)}>Confirm Incident / Begin Response</Button>}
          {s.authorizedAt == null && <p className="text-xs leading-relaxed text-muted-foreground">{canAuthorize(s)}</p>}
          <Button variant="outline" className="w-full" disabled={!!s.closed} onClick={() => sim.set(continueMonitoring)}>Continue monitoring</Button>
          {s.authorizedAt != null && <p className="text-xs text-muted-foreground">Response initiated {fmtClock(s.authorizedAt,s.scenario)} · evidence keeps updating during Respond.</p>}
          {s.packetId && <Button variant="link" className="h-auto w-full justify-start px-0 whitespace-normal" onClick={() => select({type:"packet"})}><FileText/>Inspect alert package</Button>}
        </section>}
        {s.scenario==='A' && s.droneRequestedAt != null && <details className="border-l-2 border-warning pl-3"><summary className="cursor-pointer text-sm font-medium text-warning">Drone grounded · wind limit</summary><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Unavailable — drone grounded by wind. The scenario's {SCENARIO_WEATHER.windMph} mph wind exceeds the safe operating limit.</p><p className="mt-2 text-xs text-foreground">Verification continues through cameras, satellite and residents.</p></details>}
        {alert && <section role="alert" className="border-l-2 border-warning pl-4"><div className="flex items-center gap-2 text-warning"><AlertTriangle className="size-5"/><h3 className="font-semibold">Dispatcher alert</h3></div><p className="mt-2 text-sm">Response awaiting dispatcher confirmation.</p><p className="mt-2 font-mono text-xs text-muted-foreground">Created {fmtClock(s.alertAt ?? s.t,s.scenario)}</p></section>}
        {s.awaitingDecision && <p className="border-l-2 border-warning pl-3 text-sm leading-relaxed text-warning">Playback paused for your decision.</p>}

        {s.tasks.length > 0 && <section className="space-y-4 border-t border-border pt-5"><h3 className="text-sm font-semibold">Simulated response actions</h3>{s.tasks.map(task => <details key={task.id}><summary className="cursor-pointer text-sm"><span>{task.name}</span><span className="mt-1 block text-xs text-primary">{task.completedAt != null ? "Completed · packet delivery only" : task.acknowledgedAt != null ? "Acknowledged" : task.sentAt != null ? "Sent" : "Requested"}</span></summary><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{task.detail}</p>{([["Requested",task.requestedAt],["Sent",task.sentAt],["Acknowledged",task.acknowledgedAt],["Completed",task.completedAt]] as const).map(([label,t]) => <p key={label} className="mt-1 flex justify-between text-xs"><span>{label}</span><span className="font-mono text-muted-foreground">{t == null ? "—" : fmtClock(t,s.scenario)}</span></p>)}</details>)}<p className="text-xs leading-relaxed text-warning">Electrical line potentially energized. A request or acknowledgment is not de-energization. All communications are simulated.</p></section>}
        {s.authorizedAt != null && <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm">Authorized closure</summary><label className="mt-3 block text-xs text-muted-foreground" htmlFor="closure">Closure reason (required)</label><input id="closure" value={reason} disabled={!!s.closed} onChange={e=>setReason(e.target.value)} className="mt-2 w-full rounded border border-border bg-background p-2 text-sm"/><Button variant="outline" className="mt-3 w-full" disabled={!reason.trim() || !!s.closed} onClick={()=>{sim.set(x=>closeIncident(x,reason));setReason("");}}>Close incident</Button>{s.closed && <p className="mt-2 text-xs">{fmtClock(s.closed.t,s.scenario)} · {s.closed.reason}</p>}</details>}
      </div>}
      {tab === "activity" && <div className="space-y-5"><h2 className="text-lg font-semibold">Activity & evidence</h2>{s.obs.slice().reverse().map(o=><div key={o.id} className="border-l border-observation/40 pl-3 text-sm"><div className="flex justify-between text-xs text-observation"><span className="flex items-center gap-2">{o.kind==="camera"?<Camera className="size-3"/>:o.kind==="goes"?<Satellite className="size-3"/>:o.kind==="911"?<Phone className="size-3"/>:o.kind==="utility"?<Zap className="size-3"/>:<Radio className="size-3"/>}{sourceLabel[o.kind]}</span><time>{fmtClock(o.t,s.scenario).replace(":00 PM"," PM")}</time></div><p className="mt-2 leading-relaxed">{describe(o)}</p>{o.kind === "camera" && !o.clearView && <Button variant="link" size="sm" className="px-0 text-observation" onClick={()=>select({type:"camera",id:o.cameraId})}>Inspect assumed frame</Button>}</div>)}<details open><summary className="cursor-pointer text-sm font-semibold">Complete audit · {s.log.length}</summary><ol className="mt-4 space-y-4">{s.log.map(l=><li key={l.id} className="text-xs leading-relaxed"><div className="mb-1 flex justify-between font-mono text-muted-foreground"><span>{l.source}{l.total != null ? ` · total ${l.total}` : ""}</span><time>{fmtClock(l.t,s.scenario)}</time></div>{l.text}</li>)}</ol></details></div>}
      {tab === "about" && <div className="space-y-5 text-sm leading-relaxed"><h2 className="text-lg font-semibold">Two outages, two outcomes</h2><p>The same outage-check process escalates Scenario A while leaving Scenario B at zero. Fictional scripted observations; no APIs, real messages, aircraft or responders are involved.</p><p className="text-muted-foreground">Continuous monitoring — cameras, satellites and resident reports — contributes evidence independently, including after Respond begins. The outage confirmation loop runs targeted checks in parallel and earns points only when smoke or heat matches.</p><p className="text-muted-foreground">County boundary, roads and town points: U.S. Census Bureau, 2023 Cartographic Boundary and TIGER/Line data. Bundled locally; boundary generalized, town points are representative locations. No elevation data.</p><p className="text-muted-foreground">Cameras, utility alignment, reporter, GOES footprint and fire shapes are illustrative. Response approach: US-54 and Twp Rd 286 with an assumed junction, not validated operational routing or a real fire-station address.</p><p className="text-muted-foreground">No evidence decay, containment, acreage savings, baseline time savings or guaranteed fire-free area is claimed. The chosen 250-acre illustration is not proof of acres saved.</p><p className="text-warning">Wind values and aircraft operating limits are demonstration assumptions, not operational guidance.</p></div>}
    </div>
  </aside>;
}
