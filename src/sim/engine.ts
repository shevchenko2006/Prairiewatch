// Pure event engine: one scenario clock, ordered transitions, no component timers.
import { CAMERA_TRANSITION_SECONDS, PLAYBACK, RESPONSE_TIMING, SCENARIO_START, SCENARIO_WEATHER, THRESHOLDS, type WeatherLevel } from "./config";
import { DOCK, RESOURCE_ROUTE, alongPath } from "./geo";
import { scoreEvidence, type Obs, type Pt } from "./scoring";
import { initialDroneDemo, type DroneDemo } from './drone-demo';
import { initialVerification, C_TRAVEL_SECONDS, C_AIRCRAFT, C_TARGET, verificationPosition, requestVerificationReturn, captureAutomaticPair, acceptVerification, syncMissionNotifications, readiness, type VerificationMission, type MissionNotification } from './drone-verification';
import { DRONE_POLICY } from './config';
import { initialResources, availableCrew, reserveResource, transitionResource, activeAssignment, APPARATUS, DEMO_STATIONS, INSUFFICIENT_RESOURCES, type ResourceState, type ResourceStatus } from './resources';

export type ScenarioId = "A" | "B" | "C";
export const SCENARIOS = { A: "Downed power line ignites dry grass", B: "Transformer failure without fire", C: "Suspected Lightning Ignition" } as const;
export interface Explain { happened: string; did: string; human: string }
export interface LogEntry { id: string; t: number; source: "scenario" | "system" | "dispatcher" | "simulated-response" | "camera-demo" | "drone-mission"; text: string; total?: number }
export type TaskId = "district" | "utility" | "equipment" | "roads";
export interface CoordinationTask { id: TaskId; name: string; detail: string; requestedAt: number; sentAt: number | null; acknowledgedAt: number | null; completedAt: number | null }
export interface DispatchAudit { incidentId: string; dispatcher: string; t: number; score: number; evidenceReferences: string[]; reason: string; outcome: 'initiated' | 'rejected' }
export interface SimState {
  scenario: ScenarioId;
  t: number; playing: boolean; speed: 1 | 2 | 4; weather: WeatherLevel;
  holdRemaining: number;
  /** Presentation-only seek boundary; skipped effects settle rather than replay. */
  settledAt: number | null;
  /** Presentation seconds advanced only by the shared clock, never scenario events. */
  motionTime: number;
  motionPaused: boolean;
  pingStartedAt: number | null;
  responseCameraAt: number | null;
  cameraSeek: { from: { c: Pt; w: number }; startedAt: number } | null;
  fired: string[]; obs: Obs[]; log: LogEntry[];
  incidentAt: number | null; outageAt: number | null; clearViewAt: number | null; alertAt: number | null;
  /** Outage index unlocks only when matching smoke or heat evidence exists. */
  outageUnlocked: boolean;
  /** Cross-class agreement bonus, awarded by the scripted agreement events. */
  crossBonus: number;
  droneRequestedAt: number | null;
  acknowledgedAt: number | null; authorizedAt: number | null; notifiedAt: number | null;
  acceptedAt: number | null; arrivedAt: number | null;
  tasks: CoordinationTask[];
  satelliteRead: boolean;
  droneDemo: DroneDemo;
  verification: VerificationMission;
  monitoring: number[]; closed: { t: number; reason: string } | null;
  awaitingDecision: string | null; packetId: string | null;
  /** Guided clock pauses while the supervising pilot's approval is pending (Scenario C). */
  awaitingPilotApproval: boolean;
  /** Derived drone-mission notifications; synced by the sole clock, reset with the scenario. */
  notifications: MissionNotification[];
  dispatcher: { name: string; permitted: boolean };
  dispatchMode: 'confirmed' | 'override' | null;
  dispatchAudit: DispatchAudit[];
  earlyDispatchNotice: { t: number; read: boolean } | null;
  reassessRequired: boolean;
  resources: ResourceState;
}
export interface SimEvent { id: string; t: number; title: string; pause?: boolean; hold?: number; explain: Explain; apply: (s: SimState) => SimState }
export const initialState = (scenario: ScenarioId = "A"): SimState => ({
  scenario, t: PLAYBACK.startT, playing: false, speed: 1, weather: SCENARIO_WEATHER.level, holdRemaining: 0, settledAt: null,
  motionTime: 0, motionPaused: false, pingStartedAt: null, responseCameraAt: null, cameraSeek: null,
  fired: [], obs: [], log: [], incidentAt: null, outageAt: null, clearViewAt: null, alertAt: null,
  outageUnlocked: false, crossBonus: 0, droneRequestedAt: null, acknowledgedAt: null, authorizedAt: null,
  notifiedAt: null, acceptedAt: null, arrivedAt: null, tasks: [], monitoring: [], closed: null,
  awaitingDecision: null, packetId: null, awaitingPilotApproval: false, satelliteRead: false, notifications: [],
  droneDemo: initialDroneDemo(),
  verification: initialVerification(),
  dispatcher: { name: 'Dispatcher M. Ellis (simulated)', permitted: true }, dispatchMode: null,
  dispatchAudit: [], earlyDispatchNotice: null, reassessRequired: false, resources: initialResources(),
});
const addObs = (o: Obs) => (s: SimState): SimState => ({ ...s, incidentAt: s.incidentAt ?? (o.kind !== "utility" && o.relevant && !(o.kind === "camera" && o.clearView) ? o.t : null), obs: [...s.obs, o] });
const event = (id: string, t: number, title: string, happened: string, did: string, human: string, apply: SimEvent["apply"], extra: Partial<SimEvent> = {}): SimEvent => ({ id, t, title, explain: { happened, did, human }, apply, ...extra });

// Scenario A — downed power line ignites dry grass. Same-timestamp events fire in listed order.
export const STATIC_EVENTS: SimEvent[] = [
  event("outage", 0, "Line-down outage reported", "The utility reports a line-down outage; customers lose power.", "Outage index opens locked at 0. The fusion engine prompts cameras to inspect the affected line, checks the next satellite frame and retrieves weather.", "An outage alone is not fire evidence.", s => ({ ...addObs({ id: "obs-outage", t: 0, kind: "utility", cause: "line down", windMph: SCENARIO_WEATHER.windMph, relevant: true })(s), outageAt: 0 }), { hold: 5 }),
  event("weather", 60, "Weather · 28 mph · red flag", "Weather returns 28 mph wind and a red flag warning.", "Sets the active Verify threshold to 40. Weather supplies conditions for the rubric; it has no evidence index and adds no points.", "Weather alone never raises the evidence index.", s => s, { hold: 4 }),
  event("cam1", 180, "Camera A · faint plume · 15", "Camera A detects a faint plume at model confidence 0.62 (synthetic).", "Camera index becomes 15; total 15; Log. Continuous monitoring contributes independently of the outage check.", "Smoke is evidence, not a certainty percentage.", addObs({ id: "obs-cam1", t: 180, kind: "camera", cameraId: "TWR-A", frameId: "A-0203", confidence: 0.62, growing: false, relevant: true }), { hold: 6 }),
  event("outage-match", 180, "Outage evidence unlocks · +15", "Smoke matches the outage's location and time window.", "Outage index unlocks: smoke match +10 and wind ≥ 25 mph +5. Total 30; Watch begins and enrolled residents are texted (simulated).", "Wind or cause information alone cannot unlock the outage index.", s => ({ ...s, outageUnlocked: true }), { hold: 6 }),
  event("cam2", 300, "Camera A · growing plume · 30", "Camera A reaches confidence 0.86 and detects a growing plume.", "Camera score upgrades from 15 to 30 (replacement, not addition). Total 45; Verify begins. Drone requested but grounded — wind exceeds the scenario's safe operating limit.", "The drone never launches in this storyline.", s => ({ ...addObs({ id: "obs-cam2", t: 300, kind: "camera", cameraId: "TWR-A", frameId: "A-0205", confidence: 0.86, growing: true, relevant: true })(s), droneRequestedAt: 300 }), { hold: 7 }),
  event("goes-clear", 300, "GOES frame · no detection · +0", "The next GOES frame shows no detection; the fire is still too small.", "No points are added. PrairieWatch does not control satellite image acquisition; it checks the next available frame.", "A clear satellite frame does not clear ground evidence.", s => s, { hold: 5 }),
  event("cam-b", 360, "Camera B corroborates · cap 40", "Camera B detects the same plume and the bearings cross.", "Second camera with crossing bearings +10; the camera index reaches its cap of 40. Total 55.", "Two cameras are one evidence class — Ground optical.", addObs({ id: "obs-cam-b", t: 360, kind: "camera", cameraId: "TWR-B", frameId: "B-0206", confidence: 0.82, growing: false, crossingBearing: true, relevant: true }), { hold: 7 }),
  event("sms", 480, "Rancher SMS · GPS · 25", "An enrolled rancher confirms smoke with a GPS pin.", "SMS index: first report 15 + GPS pin 5 + trusted reporter 5 = 25. Total reaches 80 — Confirmed; the dispatcher alert package is generated.", "Reporter is fictional and enrolled. No real message is sent.", s => ({ ...addObs({ id: "obs-sms", t: 480, kind: "sms", witnessId: "R-01", witnessName: "K. Marsh (fictional enrolled rancher)", pos: [37.5, 29], gps: true, trusted: true, relevant: true })(s), alertAt: 480, packetId: "PKT-A-0208" }), { hold: 8 }),
  event("cross-2", 480, "Second evidence class agrees · +10", "Human and Ground optical evidence agree on location.", "Cross-class agreement bonus +10. Total 90.", "Outages are not an evidence class and never earn this bonus.", s => ({ ...s, crossBonus: s.crossBonus + 10 }), { hold: 5 }),
  event("decision", 540, "Dispatcher confirmation", "The dispatcher receives the alert package and reviews the incident.", "Guided playback pauses; no decision is fabricated.", "Confirm the incident to begin the simulated response, or continue monitoring.", s => s, { pause: true }),
  event("goes", 600, "GOES medium hotspot · +12", "GOES detects a medium-probability hotspot.", "GOES index +12. Raw sum exceeds 100; the total is capped at 100.", "An evidence index cap, not a probability.", addObs({ id: "obs-goes", t: 600, kind: "goes", category: "medium", scan: 1, relevant: true }), { hold: 7 }),
  event("cross-3", 600, "Third evidence class agrees · +5", "Orbital becomes the third agreeing class.", "Cross-class bonus +5. Raw sum 107; total stays capped at 100. Evidence keeps updating during Respond.", "Sources keep reporting after the response begins.", s => ({ ...s, crossBonus: s.crossBonus + 5 }), { hold: 5 }),
  event("call-911", 780, "911 · flames at named road · 50", "A driver calls 911 reporting flames at a named road.", "911 index: first call 40 + flames at a named road 10 = 50. Total remains capped at 100.", "The caller is fictional; no real call is placed.", addObs({ id: "obs-911", t: 780, kind: "911", witnessId: "W-02", witnessName: "D. Ames (fictional driver)", pos: [32.8, 28.9], content: "flames", relevant: true }), { hold: 6 }),
  event("firebreaks", 780, "Neighbors begin flank firebreaks", "First neighbors begin cutting flank firebreaks, as described in the scenario.", "Logged as scenario context. No points, no containment claim and no acres-saved estimate.", "Citizen actions are not directed by PrairieWatch.", s => s, { hold: 5 }),
];

// Scenario B — transformer failure without fire. The total remains zero throughout.
export const OUTAGE_EVENTS: SimEvent[] = [
  event("transformer", 0, "Transformer outage reported", "A transformer failure trips a breaker. No ignition occurs in this scripted ground truth.", "Outage index opens locked at 0. Targeted checks begin: cameras inspect the affected equipment, the next satellite frame is checked, weather is retrieved.", "Ground truth is for the audience only.", s => ({ ...addObs({ id: "obs-outage-b", t: 0, kind: "utility", cause: "fault", windMph: SCENARIO_WEATHER.windMph, relevant: true })(s), outageAt: 0 }), { hold: 5 }),
  event("weather", 60, "Weather · 28 mph · red flag", "Weather returns 28 mph wind and a red flag warning.", "Verify threshold is 40. Weather alone adds no points.", "Same conditions as Scenario A; only the findings differ.", s => s, { hold: 4 }),
  event("clear", 180, "Camera A · clear view · −15 floored", "Camera A has a clear view and sees no smoke.", "Camera index −15, floored at zero. The total stays 0.", "A clear checked view is not proof the whole county is fire-free.", s => ({ ...addObs({ id: "obs-clear", t: 180, kind: "camera", cameraId: "TWR-A", frameId: "A-0203", confidence: 0, growing: false, clearView: true, relevant: true })(s), clearViewAt: 180 }), { hold: 6 }),
  event("goes-clear", 300, "GOES · no hotspot · +0", "GOES shows no hotspot in the next available frame.", "Zero points added.", "PrairieWatch does not control satellite image acquisition.", s => s, { hold: 5 }),
  event("window-closed", 1200, "Match window closes · outage stays 0", "The 20-minute match window closes without smoke or heat evidence.", "Outage index stays locked at 0; the grey outage marker remains on the map. Checks complete — no escalation. Normal monitoring continues.", "Later smoke can still open an ordinary incident on its own evidence.", s => s, { hold: 6 }),
];

export const VERIFICATION_EVENTS: SimEvent[] = [
  event('c-strike',0,'Earlier lightning strike · 2:30 PM · context','A simulated lightning record shows an earlier strike near remote pasture, with location uncertainty.','Logged as context only: zero points, no fire confirmation, no launch. Lightning records are simulated; no real feed is integrated.','Suspected lightning association—cause unconfirmed. A nearby strike does not establish cause.',s=>s,{hold:2}),
  event('c-cam1',0,'TW-01 · faint plume · 15','TW-01 detects a faint plume near the earlier strike area; a ridge hides the ground source.','Camera index 15; broad uncertainty, no ground-source verification.','Plume visibility is not source visibility.',addObs({id:'obs-c-cam1',t:0,kind:'camera',cameraId:'TWR-A',frameId:'C-1',confidence:.62,growing:false,relevant:true}),{hold:2}),
  event('c-cam2',30,'TW-01 · growing plume · 30','Growing plume replaces the faint-plume score.','Camera index upgrades to 30; total 30. Ground source remains hidden.','Replacement, not addition.',addObs({id:'obs-c-cam2',t:30,kind:'camera',cameraId:'TWR-A',frameId:'C-2',confidence:.86,growing:true,relevant:true}),{hold:2}),
  event('c-gap',45,'TW-02 offline · verification gap','TW-02 is offline; other cameras lack a usable viewing angle. Satellite observations provide no usable confirmation yet.','Drone verification required; automatic flight checks follow.','Geometric range does not overcome terrain or an unavailable feed.',s=>({...s,droneRequestedAt:s.t}),{hold:2}),
  event('c-sms',60,'Resident report · GPS pin · +20 +10','A distant resident reports a plume with a location pin but cannot inspect the ignition area.','SMS index 20 (first report + GPS pin); Human and Ground optical agreement +10. Total 60. The resident confirms a plume, not flames or an uncontrolled ground fire.','Reporter is fictional; no real message is sent.',s=>({...addObs({id:'obs-c-sms',t:60,kind:'sms',witnessId:'R-C1',witnessName:'L. Vann (fictional distant resident)',gps:true,trusted:false,relevant:true})(s),crossBonus:s.crossBonus+10}),{hold:2}),
  event('c-recommend',65,'Flight checks pass · pilot approval required','Current conditions meet the configured flight requirements, including the lightning-proximity check; the incident is within the central dock’s configured mission range.','Guided time pauses. Launch only after the supervising pilot approves; Unknown or blocked checks prevent approval.','Aircraft, pilot and commands are simulated.',s=>{const st={...s,verification:{...s.verification,weatherAt:s.t,...(s.verification.branch==='blocked'?{wind:28,gusts:35}:{})}};const checks=readiness(st,false);if(checks.some(c=>c.status!=='Ready'))return{...st,playing:false,verification:{...st.verification,incomplete:true,reviewRequired:true}};return{...st,playing:false,awaitingPilotApproval:true};},{hold:2}),
];
export function verificationEvents(s:SimState):SimEvent[] {
  const m=s.verification, events:SimEvent[]=[];
  const arrival=m.launchAt==null?null:m.launchAt+DRONE_POLICY.launchSeconds+C_TRAVEL_SECONDS;
  if(arrival!=null && !['returning','returned'].includes(m.phase)) {
    if(m.branch==='deteriorating') events.push(event('c-wind-change',(m.launchAt??0)+DRONE_POLICY.launchSeconds+C_TRAVEL_SECONDS*.45,'Wind deteriorates · abort mission','Wind28 / gust35 exceeds configured limits.','Abort with configured return capability; verification incomplete.','No guaranteed safe return.',st=>requestVerificationReturn({...st,verification:{...st.verification,wind:28,gusts:35,weatherAt:st.t}},'Automatic abort: worsening conditions'),{hold:2}));
    else {
      events.push(event('c-drone-arrival',arrival,'Drone arrives beyond ridge','Clear viewing waypoint reached.','Airborne view available; automatic capture follows. No launch/video points.','Never through-ridge thermal vision.',st=>({...st,verification:{...st.verification,phase:'observing',arrivedAt:st.t}}),{hold:2}));
      events.push(event('c-capture',arrival+15,'Automatic visible + thermal capture','Paired timestamped inspection images captured.','Observation supports refined fire location; score remains40.','Thermal is illustrative, not calibrated temperature.',st=>captureAutomaticPair(st),{hold:2}));
      events.push(event('c-successive',arrival+30,'Successive paired observation','A later simulated observation is captured.','Successive observations support scripted apparent-spread assessment.','A single image pair cannot establish growth.',st=>captureAutomaticPair(st,true),{hold:2}));
      events.push(event('c-assessment',arrival+45,'Simulated AI assessment','Scripted flames, corresponding hotspot and apparent spread across successive observations.','Simulated AI assessment—scripted demonstration. No points yet.','No trained or validated classifier claim.',st=>({...st,verification:{...st.verification,assessmentAt:st.t}}),{hold:2}));
      events.push(event('c-burn',arrival+55,'Burn registry · no matching scheduled burn','Simulated burn registry returns no matching scheduled burn.','Context only, combined with flames, heat and apparent spread.','No record alone is not proof of an uncontrolled burn.',st=>({...st,verification:{...st.verification,burnCheckedAt:st.t}}),{hold:2}));
      events.push(event('c-evidence',arrival+65,'Qualifying Drone evidence · +40 once','Scripted qualifying evidence accepted under proposed C rule.','Camera30 + SMS20 + agreement10 + drone40 =100, capped; no extra class bonus.','Proposed simulation weighting requires validation.',st=>acceptVerification(st),{hold:2}));
      events.push(event('c-decision',arrival+75,'Dispatcher package delivered','Location, uncertainty, paired images, times, weather, source scores, assessment and burn result delivered.','Suspected uncontrolled fire—dispatcher review required. Fire-response decisions stay with the dispatcher.','Dispatcher actions that follow are simulated human actions.',st=>({...st,packetId:'PKT-C-DRONE'}),{hold:2}));
      if(s.fired.includes('c-decision')) events.push(event('c-return',arrival+85,'Inspection complete · return to dock','Simulated aircraft returns after evidence delivery.','Evidence remains available; configured return capability used.','No universal safe-return guarantee.',st=>requestVerificationReturn(st,'Automatic return after inspection'),{hold:1}));
    }
  }
  if(m.returnAt!=null) {
    const duration=Math.hypot(m.returnFrom[0]-DOCK[0],m.returnFrom[1]-DOCK[1])/DRONE_POLICY.speedKmPerSecond;
    events.push(event('c-returned',m.returnAt+duration,'Drone returned to central dock','Scripted return finishes.','Evidence preserved; incomplete missions still require dispatcher review.','All telemetry simulated.',st=>({...st,playing:false,verification:{...st.verification,phase:'returned'}})));
  }
  return events;
}

const taskDefinitions: Pick<CoordinationTask, "id" | "name" | "detail">[] = [
  { id: "district", name: "District paging", detail: "Simulated page to the fire district with the alert package and access information" },
  { id: "utility", name: "Utility de-energization", detail: "Simulated request to assess and de-energize; line potentially energized" },
  { id: "equipment", name: "Disk-crew notifications", detail: "Simulated notification of opt-in disk crews; command-approved assignment only" },
  { id: "roads", name: "Road alerts", detail: "Simulated smoke-related road alert review" },
];
/** Scenario C uses a shorter illustrative route so the first engine arrives before 3:18 PM. */
const travelFor = (s: Pick<SimState, "scenario">) => s.scenario === "C" ? RESPONSE_TIMING.travelC : RESPONSE_TIMING.travel;
export function responseEvents(s: SimState): SimEvent[] {
  if (s.authorizedAt == null || !activeAssignment(s.resources)) return [];
  const a = s.authorizedAt;
  const acc = a + RESPONSE_TIMING.acceptDelay;
  const travel = travelFor(s);
  const pageMinutes = Math.round((RESPONSE_TIMING.acceptDelay + travel) / 60);
  return [
    event("notify", a + RESPONSE_TIMING.sendDelay, "Coordination requests sent", "Four simulated coordination requests are sent: district paging, utility de-energization, disk-crew notifications and road alerts.", "Records Sent separately from Requested. No real contacts or messages.", "A sent request does not establish de-energization or completion.", st => ({ ...st, notifiedAt: a + RESPONSE_TIMING.sendDelay, tasks: st.tasks.map(x => ({ ...x, sentAt: a + RESPONSE_TIMING.sendDelay })) })),
    event("coord-ack", a + RESPONSE_TIMING.ackDelay, "District / utility / roads acknowledge", "Simulated recipients acknowledge receipt.", "Acknowledged is not completed. Electrical line status remains potentially energized.", "Command retains control of assignments and any road action.", st => ({ ...st, resources: transitionResource(st.resources,"Acknowledged",st.t), tasks: st.tasks.map(x => x.id === "equipment" ? x : ({ ...x, acknowledgedAt: a + RESPONSE_TIMING.ackDelay })) })),
    event("accept", acc, "Equipment acceptance / field update", "Opt-in equipment accepts a command-approved assignment; illustrative authorized field-action update.", "Records acknowledgment and starts the first engine's illustrative access-road route.", "No independent landowner directions or supposedly safe firebreak routes.", st => ({ ...st, resources: transitionResource(st.resources,"En Route",st.t), acceptedAt: acc, tasks: st.tasks.map(x => x.id === "equipment" ? ({ ...x, acknowledgedAt: acc }) : x) }), { hold: 6 }),
    event("arrive", acc + travel, "First engine arrival (illustrative)", `Engine 1 reports arrival, about ${pageMinutes} minutes after the page; incident remains under monitoring.`, "Completes packet/access delivery task only. Other field tasks remain acknowledged, not completed.", "No containment or acres-saved claim. Authorized closure requires a reason.", st => ({ ...st, resources: transitionResource(st.resources,"On Scene",st.t), arrivedAt: acc + travel, tasks: st.tasks.map(x => x.id === "district" ? ({ ...x, completedAt: acc + travel }) : x) }), { hold: 6 }),
  ];
}
function resourceTimelineEvents(s:SimState):SimEvent[] {
  return s.resources.assignments.flatMap(a=>[
    event(`resource-request-${a.id}`,a.requestedAt,`Calling ${DEMO_STATIONS.find(x=>x.id===a.stationId)?.name} · ${APPARATUS.find(x=>x.id===a.apparatusId)?.name} · ${a.personnel.length} personnel`,'Simulated station request.','Resources reserved once; acknowledgement pending.','No real call.',st=>st),
    ...(a.returningAt==null?[]:[event(`resource-return-${a.id}`,a.returningAt,'Unit returning · simulated','Crew released from scene, returning.','Crew remains assigned until available.','Simulated.',st=>st)]),
    ...(a.releasedAt==null?[]:[event(`resource-release-${a.id}`,a.releasedAt,`Unit ${a.status} · resources released`,'Simulated release.','Available personnel restored; roster unchanged.','Simulated.',st=>st)])
  ]);
}
function resourceFailure(s:SimState):SimState {
  return log({...s,resources:{...s.resources,error:INSUFFICIENT_RESOURCES}},{t:s.t,source:'dispatcher',text:INSUFFICIENT_RESOURCES});
}
export function updateResourceStatus(s:SimState,status:ResourceStatus):SimState {
  const resources=transitionResource(s.resources,status,s.t);
  if(resources===s.resources)return s;
  return log({...s,resources},{t:s.t,source:'simulated-response',text:`Simulated unit status: ${status}. ${['Available','Cancelled','Declined'].includes(status)?'Assignment explicitly released; available crew restored.':'Personnel remain assigned.'}`});
}
export const allEvents = (s: SimState) => [...resourceTimelineEvents(s), ...(s.scenario === "A" ? STATIC_EVENTS : s.scenario==='C'?[...VERIFICATION_EVENTS,...verificationEvents(s)]:OUTAGE_EVENTS), ...responseEvents(s)].sort((a, b) => a.t - b.t);
export const scenarioEnd = (s: SimState) => s.scenario === "C" ? Math.max(600,s.authorizedAt==null?0:s.authorizedAt+RESPONSE_TIMING.acceptDelay+travelFor(s)) : s.scenario === "B" && s.incidentAt == null ? 1200 : s.authorizedAt != null ? s.authorizedAt + RESPONSE_TIMING.acceptDelay + travelFor(s) : PLAYBACK.endT;
const log = (s: SimState, e: Omit<LogEntry, "id">): SimState => ({ ...s, log: [...s.log, { ...e, id: `log-${s.log.length}` }] });
export function applyEvent(s: SimState, ev: SimEvent): SimState {
  if (s.fired.includes(ev.id)) return s;
  let n = ev.apply({ ...s, fired: [...s.fired, ev.id] });
  if (ev.id === "cam1" || ev.id === "c-cam1") n = { ...n, pingStartedAt: s.motionTime };
  if (ev.id === "accept") n = { ...n, responseCameraAt: s.motionTime, cameraSeek: null };
  if (ev.id === "arrive") n = { ...n, responseCameraAt: null, cameraSeek: null };
  n = log(n, { t: ev.t, source: ["notify", "coord-ack", "accept", "arrive"].includes(ev.id) ? "simulated-response" : ["outage", "transformer", "firebreaks"].includes(ev.id) ? "scenario" : "system", text: `${ev.title} — ${ev.explain.did}`, total: score(n).total });
  if (ev.pause && n.authorizedAt == null && !n.closed) n = { ...n, playing: false, awaitingDecision: ev.explain.human };
  return syncDispatchState(n);
}
export function advanceTo(s: SimState, target: number): SimState {
  let n = s;
  const end = Math.min(target, scenarioEnd(s));
  for (;;) {
    if (n.awaitingDecision || n.awaitingPilotApproval || n.closed) return syncMissionNotifications({ ...n, playing: false });
    const next = allEvents(n).find(e => !n.fired.includes(e.id) && e.t <= end);
    if (!next) break;
    n = applyEvent({ ...n, t: Math.max(n.t, next.t) }, next);
  }
  n = { ...n, t: Math.max(n.t, end) };
  if (n.t >= scenarioEnd(n)) n = { ...n, playing: false };
  return syncMissionNotifications(n);
}
/** Playback holds are consumed here by the sole clock, never by UI timers. */
export function tick(s: SimState, dt: number): SimState {
  return syncMissionNotifications(tickInner(s, dt));
}
function tickInner(s: SimState, dt: number): SimState {
  const seeking = !s.motionPaused && s.cameraSeek != null && s.motionTime - s.cameraSeek.startedAt < CAMERA_TRANSITION_SECONDS;
  if (!s.awaitingDecision && !s.awaitingPilotApproval && !s.closed && (s.playing || seeking)) {
    s = { ...s, motionTime: s.motionTime + dt * s.speed };
    if (s.cameraSeek && s.motionTime-s.cameraSeek.startedAt >= CAMERA_TRANSITION_SECONDS) s = { ...s, cameraSeek: null };
  }
  if (!s.playing || s.awaitingDecision || s.awaitingPilotApproval || s.closed) return s;
  if (s.holdRemaining > 0) return { ...s, holdRemaining: Math.max(0, s.holdRemaining - dt * s.speed) };
  const rate = s.scenario === "B" ? PLAYBACK.outageSecondsPerRealSecond : PLAYBACK.scenarioSecondsPerRealSecond;
  const target = s.t + dt * rate * s.speed;
  const pending = nextPending(s);
  if (pending && pending.t <= target) {
    // One event per step: same-timestamp events fire in listed order, each with its own hold.
    const n = applyEvent({ ...s, t: Math.max(s.t, pending.t) }, pending);
    return { ...n, holdRemaining: pending.hold ?? 0 };
  }
  return advanceTo(s, target);
}
export const nextPending = (s: SimState) => allEvents(s).find(e => !s.fired.includes(e.id));
export function nextEvent(s: SimState): SimState {
  if (s.awaitingDecision || s.awaitingPilotApproval || s.closed) return s;
  const ev = nextPending(s);
  if (!ev) return s;
  const n = applyEvent({ ...s, playing: false, holdRemaining: 0, t: Math.max(s.t, ev.t) }, ev);
  return syncMissionNotifications({ ...n, settledAt: n.t });
}
export function canAuthorize(s: SimState): string | null {
  if (!s.dispatcher.permitted) return "Dispatcher permission required (simulated).";
  if (s.scenario === "B") return "No dispatcher fire-response review in this storyline.";
  if (s.incidentAt == null) return "No active fire incident.";
  if (s.closed) return "Incident is closed.";
  if (s.authorizedAt != null) return "Response already authorized.";
  const b = score(s);
  if(s.scenario==='C') {
    if(b.total<80)return 'Below normal confirmation threshold (80); use reviewed early dispatch at 50–79.';
    if(!s.fired.includes('c-decision'))return 'Awaiting dispatcher evidence package delivery.';
    return null;
  }
  if (b.total < THRESHOLDS.confirmed || b.cross.classes.length < 2 || b.nonHumanPoints <= 0) return "Gathering evidence—response authorization not yet available.";
  if (!s.fired.includes("decision") || s.alertAt == null) return "Evidence threshold met; awaiting dispatcher review.";
  return null;
}
export const satelliteUnread = (s: SimState) => s.scenario === "A" && s.fired.includes("goes") && !s.satelliteRead;
export function openSatelliteObservation(s: SimState): SimState {
  return { ...s, satelliteRead: s.satelliteRead || satelliteUnread(s), playing: false, motionPaused: true };
}
export function acknowledge(s: SimState): SimState {
  if (s.alertAt == null || s.acknowledgedAt != null || s.closed) return s;
  return log({ ...s, acknowledgedAt: s.t }, { t: s.t, source: "dispatcher", text: "Dispatcher acknowledged the alert" });
}
export function authorize(s: SimState): SimState {
  if (canAuthorize(s)) return s;
  if (!availableCrew(s.resources,s.resources.proposedId)) return resourceFailure(s);
  return log({...startResponse(s),dispatchMode:'confirmed'}, {t:s.t,source:'dispatcher',text:'Dispatcher confirmed the incident; simulated response begins — coordination requested; county totals are not available staffing'});
}
function startResponse(s:SimState):SimState {
  const resources=reserveResource(s.resources,{incidentId:`${s.scenario}-${s.scenario==='C'?'0300':'0203'}`,t:s.t,destination:s.scenario==='C'?'Remote pasture · suspected lightning ignition (illustrative)':'Twp Rd 286 · illustrative incident',eta:s.t+RESPONSE_TIMING.acceptDelay+travelFor(s)});
  const unit=APPARATUS.find(a=>a.id===activeAssignment(resources)?.apparatusId);
  const station=DEMO_STATIONS.find(x=>x.id===unit?.stationId);
  s=log({...s,resources},{t:s.t,source:'simulated-response',text:`Calling ${station?.name} — ${unit?.name} — ${unit?.crewSize} personnel. Requested · simulated; acknowledgement pending.`});
  return {...s,...(s.scenario==='C'&&!s.awaitingPilotApproval?{playing:true,motionPaused:false}:{}),authorizedAt:s.t,awaitingDecision:null,holdRemaining:0,packetId:s.packetId??`PKT-${s.scenario}-${Math.round(s.t)}`,tasks:taskDefinitions.filter(x=>s.scenario!=='C'||x.id==='district'||x.id==='roads').map(x=>({...x,requestedAt:s.t,sentAt:null,acknowledgedAt:null,completedAt:null}))};
}
export function canDispatchEarly(s:SimState):string|null {
  if(s.authorizedAt!=null)return 'Response already initiated; no duplicate dispatch.';
  if(!s.dispatcher.permitted)return 'Dispatcher permission required (simulated).';
  if(s.closed)return 'Incident is closed.';
  const total=score(s).total;
  if(total<THRESHOLDS.earlyDispatch)return 'Early dispatch requires an evidence index of 50.';
  if(total>=THRESHOLDS.confirmed)return 'Evidence reached 80; use normal confirmed-alert review.';
  if(s.incidentAt==null)return 'No active fire incident.';
  return null;
}
export function dispatchEarly(s:SimState,input:{reviewed:boolean;reason:string}):SimState {
  if(s.authorizedAt!=null)return s;
  const error=canDispatchEarly(s)??(!input.reviewed?'Evidence review acknowledgement required.':!input.reason.trim()?'A dispatch reason is required.':!availableCrew(s.resources,s.resources.proposedId)?INSUFFICIENT_RESOURCES:null);
  const audit:DispatchAudit={incidentId:`${s.scenario}-${s.scenario==='C'?'0300':'0203'}`,dispatcher:s.dispatcher.name,t:s.t,score:score(s).total,evidenceReferences:s.obs.map(o=>o.id),reason:input.reason.trim(),outcome:error?'rejected':'initiated'};
  const n=error?{...s,resources:{...s.resources,error:error===INSUFFICIENT_RESOURCES?error:s.resources.error}}:{...startResponse(s),dispatchMode:'override' as const};
  return syncDispatchState(log({...n,dispatchAudit:[...s.dispatchAudit,audit]}, {t:s.t,source:'dispatcher',total:audit.score,text:`SIMULATED early dispatch ${audit.outcome} · incident ${audit.incidentId} · ${audit.dispatcher} · evidence ${audit.score} · references ${audit.evidenceReferences.join(', ')} · reason: ${audit.reason||'none'} · ${error??'Response initiated by dispatcher override; evidence not forced to Confirmed.'}`}));
}
/** Notifications consumed by the shared clock/store, never component timers. */
export function syncDispatchState(s:SimState):SimState {
  const total=score(s).total;
  let n=s;
  if(!s.earlyDispatchNotice&&s.authorizedAt==null&&total>=THRESHOLDS.earlyDispatch&&total<THRESHOLDS.confirmed&&s.incidentAt!=null)n={...n,earlyDispatchNotice:{t:s.t,read:false}};
  if(s.dispatchMode==='override'&&s.authorizedAt!=null&&total<(s.dispatchAudit.find(a=>a.outcome==='initiated')?.score??0)&&!s.reassessRequired)n=log({...n,reassessRequired:true},{t:s.t,source:'dispatcher',total,text:'Evidence fell after dispatcher override — reassess response; resources are not automatically canceled.'});
  return n;
}

export function continueMonitoring(s: SimState): SimState {
  if (s.incidentAt == null || s.closed) return s;
  return log({ ...s, monitoring: [...s.monitoring, s.t], awaitingDecision: null, holdRemaining: 0 }, { t: s.t, source: "dispatcher", text: "Dispatcher chose to continue monitoring" });
}
export function closeIncident(s: SimState, reason: string): SimState {
  if (s.authorizedAt == null || s.closed || !reason.trim()) return s;
  return log({ ...s, closed: { t: s.t, reason: reason.trim() }, playing: false, awaitingDecision: null }, { t: s.t, source: "dispatcher", text: `Authorized incident closure — ${reason.trim()}` });
}
/** Later positive smoke can open an ordinary fire incident even after an outage-only check. */
export function receiveObservation(s: SimState, o: Obs): SimState {
  return syncDispatchState(log(addObs(o)(s), { t: s.t, source: "system", text: `New ${o.kind} observation received` }));
}
/** Append an audit entry without touching evidence (e.g. simulated camera snapshots). */
export function logAudit(s: SimState, text: string): SimState {
  return log(s, { t: s.t, source: "camera-demo", text });
}

// Derived movement uses the exact same clock as scoring and events.
export type DronePhase = "docked" | "unavailable";
export function droneState(s: Pick<SimState, "droneRequestedAt">, _t: number): { phase: DronePhase; pos: Pt; battery: number } {
  return { phase: s.droneRequestedAt == null ? "docked" : "unavailable", pos: DOCK, battery: 100 };
}
/** Reuse bundled access geometry, with an illustrative final connector to C's incident. */
export function resourceRoute(s: { scenario?: ScenarioId }): Pt[] {
  if (s.scenario !== "C") return RESOURCE_ROUTE;
  const nearest = RESOURCE_ROUTE.reduce((best, p, i) => {
    const q = RESOURCE_ROUTE[best];
    return !q || Math.hypot(p[0]-C_TARGET[0],p[1]-C_TARGET[1]) < Math.hypot(q[0]-C_TARGET[0],q[1]-C_TARGET[1]) ? i : best;
  }, 0);
  return [...RESOURCE_ROUTE.slice(0, nearest+1), C_TARGET];
}
export function resourcePos(s: Pick<SimState, "authorizedAt"> & {scenario?:ScenarioId;resources?:ResourceState}, t: number): Pt | null {
  if (s.authorizedAt == null || (s.resources && !activeAssignment(s.resources))) return null;
  const acc = s.authorizedAt + RESPONSE_TIMING.acceptDelay;
  const route = resourceRoute(s);
  const origin = route[0];
  if (!origin) return null;
  const travel = s.scenario === "C" ? RESPONSE_TIMING.travelC : RESPONSE_TIMING.travel;
  return t < acc ? origin : alongPath(route, (t - acc) / travel);
}
/** Fraction of the response route completed at scenario time t (0 before departure, 1 at arrival). */
export function resourceProgress(s: Pick<SimState, "authorizedAt"> & { scenario?: ScenarioId }, t: number): number {
  if (s.authorizedAt == null) return 0;
  const acc = s.authorizedAt + RESPONSE_TIMING.acceptDelay;
  const travel = s.scenario === "C" ? RESPONSE_TIMING.travelC : RESPONSE_TIMING.travel;
  return Math.max(0, Math.min(1, (t - acc) / travel));
}
export function score(s: SimState) {
  return scoreEvidence(s.obs, { outageUnlocked: s.outageUnlocked, crossBonus: s.crossBonus, droneRuleEnabled:s.scenario==='C' });
}

export function fmtClock(t: number, scenario: ScenarioId = "A") {
  const total = (scenario === "C" ? 15 : SCENARIO_START.h) * 3600 + SCENARIO_START.m * 60 + SCENARIO_START.s + Math.floor(t + 1e-7);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const sec = total % 60;
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export function fmtDur(sec: number) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
