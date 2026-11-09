import { DRONE_POLICY as P } from './config';
import { DOCK, geographicCoordinates, lerpPt } from './geo';
import type { Pt } from './scoring';
import type { SimState } from './engine';
import visibleImage from '@/assets/drone-pasture-verification.jpg';
import thermalImage from '@/assets/drone-thermal-verification.jpg';
import successiveImage from '@/assets/drone-pasture-successive.jpg';

export type WeatherBranch = 'suitable' | 'blocked' | 'deteriorating' | 'lightning';
export const WEATHER_BRANCHES = { suitable: 'Suitable conditions', blocked: 'Launch blocked', deteriorating: 'Conditions deteriorate during flight', lightning: 'Storm remains nearby' } as const;
/** Fictional pasture and viewing waypoint; ridge is story context, not sourced elevation. */
export const C_TARGET: Pt = [DOCK[0] + 1.05, DOCK[1] - .2];
/** Simulated lightning record: earlier strike near the pasture, 2:30 PM (t=-1800 on the 3 PM scenario clock). Context only — never evidence or points. */
export const C_STRIKE = { t: -1800, pos: [DOCK[0] + 1.1, DOCK[1] - .15] as Pt, uncertaintyKm: 1.3, label: 'Suspected lightning association—cause unconfirmed.' } as const;
/** Simulated supervising pilot identity; approval is a scripted demo action, not an FAA authorization. */
export const C_PILOT = 'Pilot J. Reyes (simulated)';
export const C_AIRCRAFT: Pt = [DOCK[0] + 1.2, DOCK[1]];
export const C_DISTANCE = Math.hypot(C_AIRCRAFT[0]-DOCK[0], C_AIRCRAFT[1]-DOCK[1]);
export const C_TRAVEL_SECONDS = Math.round(C_DISTANCE / P.speedKmPerSecond * 1e9) / 1e9;
export interface VerificationMission {
  branch: WeatherBranch; wind: number | null; gusts: number | null; weatherSource: string | null; weatherAt: number | null;
  precipitation: boolean | null; visibilityKm: number | null; lightning: boolean | null;
  battery: number | null; dockPower: boolean | null; dockReady: boolean | null;
  command: boolean | null; video: boolean | null; routeChecked: boolean | null; operator: boolean | null;
  authorized: boolean; returnAvailable: boolean | null; pilotName: string;
  phase: 'docked' | 'en route' | 'observing' | 'returning' | 'returned';
  launchAt: number | null; arrivedAt: number | null; returnAt: number | null; returnFrom: Pt;
  incomplete: boolean; reviewRequired: boolean; snapshots: { mode: 'Visible' | 'Thermal'; t: number; url: string }[];
  locationAttached: boolean; accepted: boolean; assessmentAt: number | null; burnCheckedAt: number | null;
}
export const initialVerification = (branch: WeatherBranch = 'suitable'): VerificationMission => ({
  branch, wind:8, gusts:12, weatherSource:'Simulated local weather station', weatherAt:0,
  precipitation:false, visibilityKm:12, lightning:branch==='lightning'?true:false, battery:100, dockPower:true, dockReady:true,
  command:true, video:true, routeChecked:true, operator:true, authorized:false, returnAvailable:true, pilotName:C_PILOT,
  phase:'docked', launchAt:null, arrivedAt:null, returnAt:null, returnFrom:DOCK,
  incomplete:false, reviewRequired:false, snapshots:[], locationAttached:false, accepted:false, assessmentAt:null, burnCheckedAt:null,
});
export function verificationPosition(m: VerificationMission, t: number): Pt {
  if (m.phase==='returned' || m.phase==='docked') return DOCK;
  if (m.phase==='returning' && m.returnAt!=null) {
    const seconds=Math.hypot(m.returnFrom[0]-DOCK[0],m.returnFrom[1]-DOCK[1])/P.speedKmPerSecond;
    return lerpPt(m.returnFrom,DOCK,Math.min(1,(t-m.returnAt)/Math.max(1,seconds)));
  }
  return lerpPt(DOCK,C_AIRCRAFT,m.phase==='observing'?1:Math.max(0,Math.min(1,(t-(m.launchAt??t)-P.launchSeconds)/C_TRAVEL_SECONDS)));
}
export function returnReserve(m: VerificationMission) { return m.battery==null?null:m.battery-2*C_DISTANCE*P.batteryPercentPerKm; }
export interface ReadinessCheck { label:string; status:'Ready'|'Blocked'|'Unknown'; reason:string }
export function readiness(s: SimState, requireAuthorization=true): ReadinessCheck[] {
  const m=s.verification;
  const check=(label:string,known:boolean,pass:boolean,reason:string):ReadinessCheck=>({label,status:!known?'Unknown':pass?'Ready':'Blocked',reason});
  const bool=(label:string,v:boolean|null,reason:string)=>check(label,v!=null,v===true,reason);
  const reserve=returnReserve(m);
  return [
    check('Sustained wind',m.wind!=null,(m.wind??Infinity)<P.sustainedBelowMph,`${m.wind??'Unknown'} mph · must be below ${P.sustainedBelowMph}`),
    check('Wind gusts',m.gusts!=null,(m.gusts??Infinity)<P.gustBelowMph,`${m.gusts??'Unknown'} mph · must be below ${P.gustBelowMph}`),
    check('Weather source / age',!!m.weatherSource&&m.weatherAt!=null,m.weatherAt!=null&&s.t>=m.weatherAt&&s.t-m.weatherAt<=P.maxWeatherAgeSeconds,`${m.weatherSource??'Missing source'} · ${m.weatherAt==null?'unknown age':Math.round(s.t-m.weatherAt)+'s old'}`),
    check('Precipitation',m.precipitation!=null,m.precipitation===false,'No precipitation required'),
    check('Visibility',m.visibilityKm!=null,(m.visibilityKm??0)>=P.minVisibilityKm,`${m.visibilityKm??'Unknown'} km · minimum ${P.minVisibilityKm}`),
    check('Lightning proximity',m.lightning!=null,m.lightning===false,m.lightning?'Launch blocked—lightning proximity':'No nearby lightning activity'),
    check('Battery / return reserve',m.battery!=null&&reserve!=null,(m.battery??0)>=P.minBatteryPercent&&(reserve??0)>=P.minReturnReservePercent,`${m.battery??'Unknown'}% battery · ${reserve?.toFixed(0)??'Unknown'}% estimated return reserve`),
    bool('Dock power',m.dockPower,'Simulated dock power available'),bool('Dock readiness',m.dockReady,'Simulated dock ready'),
    bool('Command connection',m.command,'Simulated command link available'),bool('Video connection',m.video,'Simulated video link available'),
    check('Route / operating range',m.routeChecked!=null,m.routeChecked===true&&C_DISTANCE<=P.maxRangeKm,`${C_DISTANCE.toFixed(2)} km · configured range ${P.maxRangeKm} km · fictional route checked`),
    bool('Authorized remote operator',m.operator,'Simulated authorized operator available'),
    bool('Configured return capability',m.returnAvailable,'Available for this scripted branch; not a universal safe-return guarantee'),
    ...(requireAuthorization?[check('Mission authorization',true,m.authorized,m.authorized?'Operator authorized simulated mission':'Operator authorization required')]:[]),
  ];
}
export function missionAudit(s:SimState,text:string):SimState {
  return {...s,log:[...s.log,{id:`log-${s.log.length}`,t:s.t,source:'drone-mission',text:`SIMULATED · ${text}`,...(s.verification.accepted?{total:100}:{})} ]};
}

// Mission notifications: derived state with stable ids, synced by the sole clock and store.
export type MissionNotificationKind='request'|'weather-block'|'arrival'|'evidence'|'abort'|'returned'|'assessment'|'dispatcher';
export interface MissionNotification { id:string; kind:MissionNotificationKind; t:number; title:string; body:string; read:boolean; dismissed:boolean }
const notify=(list:MissionNotification[],n:MissionNotification)=>list.some(x=>x.id===n.id)?list:[...list,n];
/** Append any newly-due mission notifications. Idempotent; one entry per kind per mission. */
export function syncMissionNotifications(s:SimState):SimState {
  if(s.scenario!=='C')return s.notifications.length?{...s,notifications:[]}:s;
  const m=s.verification;let list=s.notifications;
  if(s.awaitingPilotApproval)
    list=notify(list,{id:'drone-request',kind:'request',t:s.droneRequestedAt??s.t,title:'Drone verification recommended—pilot approval required',body:'Automatic flight checks passed. Review Mission opens the Drone tab; one click authorizes the simulated mission under pilot supervision.',read:false,dismissed:false});
  if(m.launchAt!=null)
    list=notify(list,{id:'drone-start',kind:'request',t:m.launchAt,title:'Pilot-supervised automated mission starting',body:`${m.pilotName} approved. Automated flight, capture, assessment and return under pilot supervision.`,read:false,dismissed:false});
  if(m.reviewRequired&&m.phase==='docked')
    list=notify(list,{id:'drone-weather-block',kind:'weather-block',t:s.droneRequestedAt??s.t,title:'Launch blocked — verification incomplete',body:'A required flight check is blocked or unknown. Aircraft remains docked; dispatcher emergency review remains available.',read:false,dismissed:false});
  if(m.arrivedAt!=null)
    list=notify(list,{id:'drone-arrival',kind:'arrival',t:m.arrivedAt,title:'Drone reached the observation area',body:'Clear viewing angle reached beyond the ridge. Automatic paired visible and thermal capture is scheduled.',read:false,dismissed:false});
  if(m.locationAttached&&m.snapshots.some(x=>x.mode==='Visible')&&m.snapshots.some(x=>x.mode==='Thermal'))
    list=notify(list,{id:'drone-evidence',kind:'evidence',t:m.snapshots[0]?.t??s.t,title:'Paired evidence captured automatically',body:'Timestamped visible and illustrative thermal images are attached to the supported observation location.',read:false,dismissed:false});
  if(m.assessmentAt!=null) list=notify(list,{id:'drone-assessment',kind:'assessment',t:m.assessmentAt,title:'Simulated AI assessment complete',body:'Scripted flames, corresponding heat and apparent spread across successive observations. Burn-record check follows; no validated classifier is connected.',read:false,dismissed:false});
  if(s.fired.includes('c-decision')) list=notify(list,{id:'drone-dispatcher',kind:'dispatcher',t:m.arrivedAt==null?s.t:m.arrivedAt+65,title:'Dispatcher evidence package delivered',body:'Suspected uncontrolled fire—dispatcher review required. Simulated human acknowledgement is scheduled; no real dispatch occurs.',read:false,dismissed:false});
  if(m.branch==='deteriorating'&&m.reviewRequired&&(m.phase==='returning'||m.phase==='returned'))
    list=notify(list,{id:'drone-abort',kind:'abort',t:m.returnAt??s.t,title:'Mission aborted — worsening conditions',body:'Wind exceeded configured demo limits during flight; the aircraft is returning with configured capability. No safe return is guaranteed in every condition.',read:false,dismissed:false});
  if(m.phase==='returned')
    list=notify(list,{id:'drone-returned',kind:'returned',t:s.t,title:'Drone returned to dock',body:m.accepted?'Mission complete; accepted evidence is available for dispatcher review.':'Verification incomplete — dispatcher review required.',read:false,dismissed:false});
  return list===s.notifications?s:{...s,notifications:list};
}
export const unreadMissionNotifications=(s:SimState)=>s.notifications.filter(n=>!n.read).length;
export function markMissionNotificationsRead(s:SimState):SimState {
  if(!s.notifications.some(n=>!n.read))return s;
  return {...s,notifications:s.notifications.map(n=>({...n,read:true}))};
}
/** Dismissal closes the popup only; the request stays in the notification center and is audited. */
export function dismissMissionNotification(s:SimState,id:string):SimState {
  const n=s.notifications.find(x=>x.id===id);
  if(!n||n.dismissed)return s;
  return missionAudit({...s,notifications:s.notifications.map(x=>x.id===id?{...x,dismissed:true}:x)},`Operator dismissed notification "${n.title}"; the request remains pending in the notification center and Drone tab.`);
}
/** Unresolved operator actions, surfaced as the Drone tab badge. */
export function pendingMissionActions(s:SimState):string[] {
  if(s.scenario!=='C'||!s.fired.includes('c-recommend'))return [];
  const m=s.verification;
  if(m.accepted)return [];
  if(s.awaitingPilotApproval)return ['Pilot approval requested'];
  if(m.phase==='docked'&&m.reviewRequired)return ['Review blocked mission'];
  if(m.reviewRequired)return ['Review incomplete mission'];
  return [];
}
/** One-click pilot approval: re-runs every readiness check, then starts the automated mission under pilot supervision. Never an FAA authorization. */
export function approveVerificationMission(s:SimState):SimState {
  if(s.scenario!=='C'||!s.awaitingPilotApproval||s.verification.phase!=='docked'||s.verification.reviewRequired)return s;
  const checks=readiness(s,false);
  if(checks.some(c=>c.status!=='Ready'))return missionAudit({...s,playing:false,awaitingPilotApproval:false,verification:{...s.verification,incomplete:true,reviewRequired:true}},'Launch prevented: '+checks.filter(c=>c.status!=='Ready').map(c=>c.label).join(', '));
  return missionAudit({...s,playing:true,motionPaused:false,awaitingPilotApproval:false,verification:{...s.verification,authorized:true,launchAt:s.t,phase:'en route'}},`${s.verification.pilotName} approved the pilot-supervised automated mission; simulated launch from central dock. Simulation—required operating authorizations assumed; no physical command or FAA approval.`);
}
export function requestVerificationReturn(s:SimState,reason='Operator requested return'):SimState {
  const m=s.verification;
  if(s.scenario!=='C'||!['observing','en route'].includes(m.phase))return s;
  if(m.returnAvailable!==true)return missionAudit({...s,playing:false,verification:{...m,incomplete:!m.accepted,reviewRequired:true}},'Return capability unavailable—operator contingency review required; no safe return claimed');
  return missionAudit({...s,playing:true,motionPaused:false,verification:{...m,phase:'returning',returnAt:s.t,returnFrom:verificationPosition(m,s.t),incomplete:!m.accepted,reviewRequired:!m.accepted}},`${reason}; simulated return with configured capability available. Verification ${m.accepted?'complete':'incomplete'}.`);
}
export function captureVerification(s:SimState,mode:'Visible'|'Thermal',url:string):SimState {
  if(s.scenario!=='C'||s.verification.phase!=='observing'||!url)return s;
  return missionAudit({...s,verification:{...s.verification,snapshots:[...s.verification.snapshots,{mode,t:s.t,url}]}},`${mode} timestamped evidence snapshot captured beyond ridge`);
}
export function attachVerificationLocation(s:SimState):SimState {
  if(s.scenario!=='C'||s.verification.phase!=='observing'||!s.verification.snapshots.length||s.verification.locationAttached)return s;
  const p=geographicCoordinates(C_TARGET);
  return missionAudit({...s,verification:{...s.verification,locationAttached:true}},`Supported observed fire location attached ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}; distinct from aircraft coordinates. Illustrative uncertainty reduced.`);
}
export function acceptVerification(s:SimState):SimState {
  const m=s.verification;
  if(s.scenario!=='C'||m.phase!=='observing'||m.accepted||m.assessmentAt==null||m.burnCheckedAt==null||new Set(m.snapshots.map(x=>x.t)).size<2||!m.locationAttached||!m.snapshots.some(x=>x.mode==='Visible')||!m.snapshots.some(x=>x.mode==='Thermal'))return s;
  return missionAudit({...s,alertAt:s.t,packetId:'PKT-C-DRONE',obs:[...s.obs,{id:'obs-drone-c',t:s.t,kind:'drone',visibleFlames:true,thermalHotspot:true,operatorAccepted:true,relevant:true}],verification:{...m,accepted:true,incomplete:false}},'Scripted assessment accepted qualifying flames, corresponding thermal hotspot and successive observations with burn-record context: proposed Drone index +40 once, total 100 (capped). Proposed simulation rule—requires validation.');
}
/** Automatic captures are bundled illustrative assets, independent of whether the Drone tab is mounted. */
export function captureAutomaticPair(s:SimState,successive=false):SimState {
  if(s.verification.phase!=='observing'||s.verification.reviewRequired)return s;
  let n=captureVerification(s,'Visible',successive?successiveImage:visibleImage);
  n=captureVerification(n,'Thermal',thermalImage);
  return attachVerificationLocation(n);
}
