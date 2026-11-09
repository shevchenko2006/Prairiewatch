import { json2satrec, propagate, gstime, eciToGeodetic, eciToEcf, degreesLat, degreesLong, type OMMJsonObject } from 'satellite.js';
import { z } from 'zod';

export const SATELLITES = [
  { id: 60133, name: 'GOES-19', sensor: 'ABI · geostationary' },
  { id: 51850, name: 'GOES-18', sensor: 'ABI · geostationary' },
  { id: 37849, name: 'Suomi NPP', sensor: 'VIIRS · polar orbit' },
  { id: 43013, name: 'NOAA-20', sensor: 'VIIRS · polar orbit' },
  { id: 54234, name: 'NOAA-21', sensor: 'VIIRS · polar orbit' },
] as const;
const elementSchema = z.object({ OBJECT_NAME:z.string(), OBJECT_ID:z.string(), EPOCH:z.string(), NORAD_CAT_ID:z.coerce.number(), MEAN_MOTION:z.coerce.number().positive(), ECCENTRICITY:z.coerce.number(), INCLINATION:z.coerce.number(), RA_OF_ASC_NODE:z.coerce.number(), ARG_OF_PERICENTER:z.coerce.number(), MEAN_ANOMALY:z.coerce.number(), ELEMENT_SET_NO:z.coerce.number(), BSTAR:z.coerce.number(), MEAN_MOTION_DOT:z.coerce.number(), MEAN_MOTION_DDOT:z.coerce.number() });
export function parseElements(raw: unknown): OMMJsonObject[] {
  return z.array(elementSchema).parse(raw).filter(e=>SATELLITES.some(s=>s.id===e.NORAD_CAT_ID) && Number.isFinite(Date.parse(e.EPOCH+'Z')));
}
export type OrbitPosition = { lat:number; lon:number; altitude:number; xyz:[number,number,number] };
export const EARTH_KM = 6371;
export function surfacePoint(lat:number,lon:number,r=1): [number,number,number] {
  const a=lat*Math.PI/180,b=lon*Math.PI/180;
  return [r*Math.cos(a)*Math.cos(b),r*Math.sin(a),-r*Math.cos(a)*Math.sin(b)];
}
export function position(element:OMMJsonObject,time:Date): OrbitPosition | null {
  try {
    const result=propagate(json2satrec(element),time);
    if (!result) return null;
    const gmst=gstime(time), geo=eciToGeodetic(result.position,gmst), ecf=eciToEcf(result.position,gmst);
    const lat=degreesLat(geo.latitude),lon=degreesLong(geo.longitude);
    if (![lat,lon,geo.height].every(Number.isFinite)) return null;
    return { lat,lon,altitude:geo.height,xyz:[ecf.x/EARTH_KM,ecf.z/EARTH_KM,-ecf.y/EARTH_KM] };
  } catch { return null; }
}
export function orbitPaths(element:OMMJsonObject,time:Date) {
  const period=86400/Number(element.MEAN_MOTION);
  const orbit:[number,number,number][]=[],ground:[number,number,number][]=[];
  const fixedSidereal=gstime(time);
  const rec=json2satrec(element);
  for(let i=0;i<=160;i++) {
    const at=new Date(time.getTime()+period*1000*(i/160-.1));
    const result=propagate(rec,at); if(!result) continue;
    const inertial=eciToEcf(result.position,fixedSidereal);
    orbit.push([inertial.x/EARTH_KM,inertial.z/EARTH_KM,-inertial.y/EARTH_KM]);
    const p=position(element,at); if(p) ground.push(surfacePoint(p.lat,p.lon,1.006));
  }
  return {orbit,ground};
}
export const DEMO_GOES: OrbitPosition={lat:0,lon:-75.2,altitude:35786,xyz:surfacePoint(0,-75.2,1+35786/EARTH_KM)};
export function demoObservation(fired:readonly string[]) { return fired.includes('goes'); }

export const CACHE_MS=2*60*60*1000;
export type OrbitCache={ elements:OMMJsonObject[]; fetchedAt:number; attemptedAt:number };
const KEY='prairiewatch-orbits-v1';
let pending:Promise<OrbitCache>|null=null;
let memory:OrbitCache|null=null;
let lastAttempt=0;
export function readCache():OrbitCache|null {
  try {const value=JSON.parse(localStorage.getItem(KEY)??'null');if(!value)return memory;return {elements:parseElements(value.elements),fetchedAt:Number(value.fetchedAt),attemptedAt:Number(value.attemptedAt)};}catch{return memory;}
}
export async function fetchOrbits():Promise<OrbitCache> {
  if(pending)return pending;
  const cached=readCache(),now=Date.now();
  if(cached && now-cached.fetchedAt<CACHE_MS && cached.elements.length===SATELLITES.length)return cached;
  if(now-Math.max(lastAttempt,cached?.attemptedAt??0)<60000)throw new Error('Retry available after one minute.');
  lastAttempt=now;
  if(cached)try{localStorage.setItem(KEY,JSON.stringify({...cached,attemptedAt:now}));}catch{/* storage unavailable */}
  pending=(async()=>{
    const results=await Promise.all(SATELLITES.map(async sat=>{
      if(cached?.elements.some(e=>Number(e.NORAD_CAT_ID)===sat.id) && now-cached.fetchedAt<CACHE_MS)return cached.elements.find(e=>Number(e.NORAD_CAT_ID)===sat.id);
      const r=await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.id}&FORMAT=JSON`,{signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error(`CelesTrak returned ${r.status}`);
      const elements=parseElements(await r.json());return elements.find(e=>Number(e.NORAD_CAT_ID)===sat.id);
    }));
    const elements=results.filter((e):e is OMMJsonObject=>e!=null);
    if(elements.length!==SATELLITES.length)throw new Error('Incomplete orbital data.');
    const value={elements,fetchedAt:Date.now(),attemptedAt:now};
    memory=value;
    try{localStorage.setItem(KEY,JSON.stringify(value));}catch{/* usable in memory */}
    return value;
  })().finally(()=>{pending=null;});
  return pending;
}