/** Fictional demonstration roster. No real station names, locations or operational availability. */
export interface DemoStation { id: string; name: string; personnel: string[] | null }
export interface Apparatus { id: string; stationId: string; name: string; crewSize: number }
export const DEMO_STATIONS: DemoStation[] = [
  { id: 'DEMO-01', name: 'Demo Central Prairie Volunteer Response Station', personnel: Array.from({length:12},(_,i)=>`D1-P${i+1}`) },
  { id: 'DEMO-02', name: 'Demo North Pasture Response Station', personnel: Array.from({length:8},(_,i)=>`D2-P${i+1}`) },
  { id: 'DEMO-03', name: 'Demo Reserve Station — roster unknown', personnel: null },
];
export const APPARATUS: Apparatus[] = [
  { id:'DEMO-E1',stationId:'DEMO-01',name:'Engine 1',crewSize:4 },
  { id:'DEMO-E2',stationId:'DEMO-02',name:'Engine 2',crewSize:4 },
  { id:'DEMO-E3',stationId:'DEMO-03',name:'Engine 3',crewSize:4 },
];
export type ResourceStatus = 'Requested'|'Acknowledged'|'En Route'|'On Scene'|'Returning'|'Available'|'Cancelled'|'Declined';
export interface ResourceAssignment { id:string; incidentId:string; apparatusId:string; stationId:string; personnel:string[]; destination:string; status:ResourceStatus; requestedAt:number; acknowledgedAt:number|null; enRouteAt:number|null; onSceneAt:number|null; returningAt:number|null; releasedAt:number|null; eta:number }
export interface ResourceState { proposedId:string|null; assignments:ResourceAssignment[]; error:string|null }
export const initialResources=():ResourceState=>({proposedId:APPARATUS[0]?.id??null,assignments:[],error:null});
export const activeAssignment=(r:ResourceState)=>r.assignments.find(a=>a.releasedAt==null);
export function rosterCounts(r:ResourceState,stationId?:string) {
  const stations=DEMO_STATIONS.filter(s=>!stationId||s.id===stationId);
  const personnel=stations.flatMap(s=>s.personnel??[]);
  const assigned=new Set(r.assignments.filter(a=>a.releasedAt==null&&(!stationId||a.stationId===stationId)).flatMap(a=>a.personnel));
  return {onDuty:personnel.length,assigned:personnel.filter(p=>assigned.has(p)).length,available:personnel.filter(p=>!assigned.has(p)).length,unknownStations:stations.filter(s=>s.personnel==null).length};
}
export const INSUFFICIENT_RESOURCES='Insufficient available resources—review another station or mutual aid.';
export function availableCrew(r:ResourceState,apparatusId:string|null):string[]|null {
  const unit=APPARATUS.find(a=>a.id===apparatusId);
  if(!unit||r.assignments.some(a=>a.apparatusId===unit.id&&a.releasedAt==null))return null;
  const station=DEMO_STATIONS.find(s=>s.id===unit.stationId);
  if(!station?.personnel)return null;
  const busy=new Set(r.assignments.filter(a=>a.releasedAt==null).flatMap(a=>a.personnel));
  const crew=station.personnel.filter(p=>!busy.has(p)).slice(0,unit.crewSize);
  return crew.length===unit.crewSize?crew:null;
}
export function suitableApparatus(r:ResourceState):string|null {
  return APPARATUS.find(a=>availableCrew(r,a.id)!=null)?.id??null;
}
export function reserveResource(r:ResourceState,input:{incidentId:string;t:number;destination:string;eta:number}):ResourceState {
  if(r.assignments.some(a=>a.incidentId===input.incidentId&&a.releasedAt==null))return r;
  const id=r.proposedId;
  const unit=APPARATUS.find(a=>a.id===id),crew=availableCrew(r,id);
  if(!unit||!crew)return {...r,error:INSUFFICIENT_RESOURCES};
  return {...r,error:null,assignments:[...r.assignments,{id:`${input.incidentId}-${r.assignments.length+1}`,incidentId:input.incidentId,apparatusId:unit.id,stationId:unit.stationId,personnel:crew,destination:input.destination,status:'Requested',requestedAt:input.t,acknowledgedAt:null,enRouteAt:null,onSceneAt:null,returningAt:null,releasedAt:null,eta:input.eta}]};
}
export function transitionResource(r:ResourceState,status:ResourceStatus,t:number):ResourceState {
  const current=activeAssignment(r);
  if(!current)return r;
  const allowed:Partial<Record<ResourceStatus,ResourceStatus[]>>={Requested:['Acknowledged','Cancelled','Declined'],Acknowledged:['En Route','Cancelled','Declined'],'En Route':['On Scene'],'On Scene':['Returning'],Returning:['Available']};
  if(!allowed[current.status]?.includes(status))return r;
  const times=status==='Acknowledged'?{acknowledgedAt:t}:status==='En Route'?{enRouteAt:t}:status==='On Scene'?{onSceneAt:t}:status==='Returning'?{returningAt:t}:['Available','Cancelled','Declined'].includes(status)?{releasedAt:t}:{};
  return {...r,error:null,assignments:r.assignments.map(a=>a.id===current.id?{...a,...times,status}:a)};
}