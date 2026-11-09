import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RotateCcw, RefreshCw, Satellite } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEMO_GOES, SATELLITES, demoObservation, fetchOrbits, orbitPaths, position, readCache, surfacePoint, type OrbitCache } from '@/satellites/orbits';
import type { SimState } from '@/sim/engine';
import coastlines from '@/satellites/coastlines.json';
import { SCAN_SECONDS, scanProgress, footprint } from '@/satellites/observation';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
const Earth=lazy(()=>import('./SatelliteEarth'));
const utc=(ms:number)=>new Date(ms).toISOString().replace('T',' ').replace(/\.\d+Z$/,' UTC');
export function SatellitesView({s,back,observationEntry=false}:{s:SimState;back:()=>void;observationEntry?:boolean}) {
  const [mode,setMode]=useState<'live'|'demo'>(observationEntry?'demo':'live');
  const reduced=useReducedMotion();
  const [scan,setScan]=useState(0);
  const [scanReady,setScanReady]=useState(false);
  const [staticView,setStaticView]=useState(false);
  const ready=useCallback(()=>setScanReady(true),[]);
  const [data,setData]=useState<OrbitCache|null>(null);
  const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const [now,setNow]=useState<number|null>(null);const [selected,setSelected]=useState<number>(60133);
  const [reset,setReset]=useState(0);const [webgl,setWebgl]=useState<boolean|null>(null);
  const observed=s.scenario==='A'&&demoObservation(s.fired);
  const scanVisible=mode==='demo'&&observed;
  const scanComplete=scan>=1||reduced||webgl===false||staticView;
  useEffect(()=>{
    if(!scanVisible||scanComplete||!scanReady)return;
    let frame=0;const start=performance.now();
    const draw=(time:number)=>{const progress=scanProgress((time-start)/1000);setScan(progress);if(progress<1)frame=requestAnimationFrame(draw);};
    frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[scanVisible,scanComplete,scanReady,reset]);
  const refresh=async()=>{setLoading(true);setError('');try{setData(await fetchOrbits());}catch(e){setError(e instanceof Error?e.message:'Refresh failed');}finally{setLoading(false);}};
  useEffect(()=>{setData(readCache());void refresh();setNow(Date.now());const id=setInterval(()=>setNow(Date.now()),1000);const c=document.createElement('canvas');const gl=c.getContext('webgl2')??c.getContext('webgl');setWebgl(!!gl);gl?.getExtension('WEBGL_lose_context')?.loseContext();return()=>clearInterval(id);},[]);
  const element=data?.elements.find(e=>Number(e.NORAD_CAT_ID)===selected);
  const live=useMemo(()=>now&&data?data.elements.flatMap(e=>{const pos=position(e,new Date(now));return pos?[{id:Number(e.NORAD_CAT_ID),pos}]:[];}):[],[now,data]);
  const paths=useMemo(()=>element&&now?orbitPaths(element,new Date(Math.floor(now/60000)*60000)):{orbit:[],ground:[]},[element,now?Math.floor(now/60000):0]);
  const demoPaths=useMemo(()=>({orbit:Array.from({length:161},(_,i)=>surfacePoint(0,i/160*360,6.617)),ground:Array.from({length:161},(_,i)=>surfacePoint(0,i/160*360,1.006))}),[]);
  const shown=mode==='live'?live:[{id:60133,pos:DEMO_GOES}];
  const chosen=shown.find(x=>x.id===selected)?.pos;
  return <section aria-label="Satellites" className="absolute inset-0 z-40 flex flex-col bg-background">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
      <Button variant="ghost" onClick={back}><ArrowLeft/>Back to incident</Button>
      <div className="flex gap-1" aria-label="Tracking mode">{(['live','demo'] as const).map(m=><Button key={m} variant={mode===m?'secondary':'ghost'} aria-pressed={mode===m} onClick={()=>{setMode(m);setSelected(60133);setScan(0);setReset(x=>x+1);}}>{m==='live'?'Live tracking':'Demo scenario'}</Button>)}</div>
      <Button variant="outline" size="icon" aria-label="Reset view" title="Reset view" onClick={()=>setReset(x=>x+1)}><RotateCcw/></Button>
    </div>
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,45fr)_minmax(0,55fr)] md:grid-cols-[minmax(0,1fr)_300px] md:grid-rows-1">
      <div className="relative min-h-0 overflow-hidden" data-testid="satellite-earth">
        {webgl&&!staticView&&shown.length>0?<Suspense fallback={<p className="p-6 text-muted-foreground">Loading Earth…</p>}><Earth satellites={shown} selected={selected} select={setSelected} orbit={mode==='live'?paths.orbit:demoPaths.orbit} ground={mode==='live'?paths.ground:demoPaths.ground} demoLink={scanVisible} reset={reset} scan={scanVisible?(scanComplete?1:scan):null} focusObservation={scanVisible} ready={ready}/></Suspense>:<div className="flex h-full flex-col items-center justify-center gap-3 p-6">{webgl===false||staticView?<svg viewBox="0 0 360 180" className="w-full max-w-xl" aria-label="Static Earth ground positions"><rect width="360" height="180" fill="var(--background)"/>{coastlines.map((line,i)=><path key={i} d={line.map((p,j)=>`${j?'L':'M'}${p[0]+180},${90-p[1]}`).join('')} fill="none" stroke="var(--terrain)" strokeWidth=".4"/>)}{shown.map(x=><circle key={x.id} cx={180+x.pos.lon} cy={90-x.pos.lat} r={2} fill="var(--observation)"/>)}{scanVisible&&<><path d={footprint(1).map((p,i)=>`${i?'L':'M'}${180+p[1]},${90-p[0]}`).join('')} fill="none" stroke="var(--observation)" strokeWidth="1"/><text x="87" y="47" fill="var(--foreground)" fontSize="5">Greenwood County</text></>}</svg>:<Satellite className="size-10 text-observation"/>}<p className="text-muted-foreground">{staticView?'Static observation view':webgl===false?'Static tracking view · WebGL unavailable':loading?'Retrieving orbital data…':'Tracking unavailable'}</p>{!loading&&!data&&mode==='live'&&<Button variant="outline" onClick={refresh}><RefreshCw/>Retry</Button>}</div>}
        <div className="pointer-events-none absolute left-4 top-4 max-w-[90%] bg-background/90 px-3 py-2 text-xs text-observation">{mode==='live'?'Live tracking · estimated positions':'SIMULATED POSITION & OBSERVATION'}</div>
        <p className="pointer-events-none absolute bottom-3 left-4 text-[10px] text-muted-foreground">Not to scale · satellite symbols enlarged · orbital altitudes visually compressed</p>
      </div>
      <aside className="min-h-0 overflow-y-auto border-l border-border bg-card p-4 text-sm">
        <h2 className="mb-4 text-lg font-medium">{mode==='live'?'Orbital tracking':'Fictional observation'}</h2>
        {scanVisible&&<section className="mb-4 space-y-3 border-l-2 border-warning pl-3" aria-label="Simulated satellite observation"><p className="text-xs text-warning">Simulated observation · geometry illustrative.</p><p className="text-xs">Greenwood County locator · GOES-19</p>{scanComplete?<><h3 className="flex items-center gap-2 font-medium text-observation"><Satellite className="size-4 shrink-0"/>Simulated GOES observation · 2:10 PM</h3><p>Medium-probability detection: +12</p><p>Third evidence class: +5</p><p className="font-mono text-primary">Evidence index: 90 → 100 (capped)</p><Button variant="outline" size="sm" onClick={()=>{setScan(0);setReset(x=>x+1);}}>Replay animation</Button></>:<><p role="status" className="text-xs text-muted-foreground">Illustrative scanning sequence · {SCAN_SECONDS} seconds</p><Button variant="outline" size="sm" onClick={()=>setScan(1)}>Skip animation</Button></>}<Button variant="ghost" size="sm" onClick={()=>{setStaticView(x=>!x);setScan(1);}}>{staticView?'3D view':'Static view'}</Button></section>}
        {mode==='live'&&<div className="mb-4 flex flex-col gap-1">{SATELLITES.map(sat=><Button key={sat.id} variant={selected===sat.id?'secondary':'ghost'} className="justify-between" onClick={()=>setSelected(sat.id)}><span className="flex items-center gap-2"><Satellite className="size-4 text-observation"/><span className="text-observation">{sat.name}</span></span><span className="font-mono text-xs text-muted-foreground">{sat.id}</span></Button>)}</div>}
        {mode==='demo'&&<p className="mb-4 text-observation">GOES-19 · assumed equatorial position</p>}
        {chosen?<dl className="space-y-2 border-y border-border py-4">{[['Latitude',`${chosen.lat.toFixed(3)}°`],['Longitude',`${chosen.lon.toFixed(3)}°`],['Altitude',`${chosen.altitude.toFixed(0)} km`]].map(([label,value])=><div key={label} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value}</dd></div>)}</dl>:<p className="text-warning">{loading?'Loading elements…':'Tracking unavailable for this satellite'}</p>}
        {mode==='live'?<div className="mt-4 space-y-3 text-xs"><p className="text-muted-foreground">{SATELLITES.find(x=>x.id===selected)?.sensor}</p><p>Current UTC<br/><time className="font-mono text-primary">{now?utc(now):'—'}</time></p><p>Orbital-data epoch<br/><span className="font-mono">{element?element.EPOCH.replace('T',' ')+' UTC':'—'}</span></p><p>Last successful fetch<br/><span className="font-mono">{data?utc(data.fetchedAt):'—'}</span></p>{data&&now&&<p className={error?'text-warning':'text-muted-foreground'}>{error?'Cached orbital data':'Stored orbital data'} · fetched {Math.max(0,Math.floor((now-data.fetchedAt)/60000))} min ago{element?` · epoch ${Math.floor((now-Date.parse(element.EPOCH+'Z'))/3600000)} h old`:''}</p>}{error&&<p role="alert" className="text-warning">{error}{data?' · Using cached estimates.':''}</p>}<Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw/>{error?'Retry':'Refresh data'}</Button><p className="text-muted-foreground">CelesTrak GP / SGP4 estimates. Data cached for two hours; movement calculated locally.</p><p className="text-muted-foreground">Orbit line: space trajectory. Surface line: ground track. Proximity does not guarantee imagery, fire detection or sensor coverage.</p><a className="text-primary" href="https://celestrak.org/usage-policy.php" target="_blank" rel="noreferrer">CelesTrak usage policy</a></div>:<div className="mt-4 space-y-3 text-xs"><p>Scenario {s.scenario} · existing timeline</p><p className="text-observation">{observed?'Recorded GOES evidence · medium category · +12':'No GOES observation recorded yet'}</p><p className="text-muted-foreground">{observed?'Assumed valid Greenwood County observation; link illustrative.':'Only the existing GOES timeline event can add evidence.'}</p><p className="text-muted-foreground">Positions are scripted, not orbital estimates. GOES stays over the equator. This view does not change the score.</p></div>}
      </aside>
    </div>
  </section>;
}