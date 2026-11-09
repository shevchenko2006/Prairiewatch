import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { MapView } from "@/components/pw/MapView";
import { SidePanel } from "@/components/pw/SidePanel";
import { Timeline } from "@/components/pw/Timeline";
import { DecisionDialog, ExplainCard, Inspector, Results } from "@/components/pw/Overlays";
import { DispatcherActions, EarlyDispatchDialog } from "@/components/pw/DispatcherActions";
import { StageBar } from "@/components/pw/StageBar";
import type { Selection } from "@/components/pw/types";
import { ChevronUp, ChevronDown, Satellite, Camera, Plane, Bell } from "lucide-react";
import { TowerCamerasView } from '@/components/pw/TowerCamerasView';
import { DroneMissionView } from '@/components/pw/DroneMissionView';
import { Button } from "@/components/ui/button";
import { SCENARIOS, fmtClock, score, satelliteUnread, openSatelliteObservation } from "@/sim/engine";
import { pendingMissionActions, unreadMissionNotifications, markMissionNotificationsRead, dismissMissionNotification } from "@/sim/drone-verification";
import { sim, useSim, useSimClock } from "@/sim/store";
import logoUrl from "@/assets/prairiewatch-lavender-w.png";
import { TopographicBackground } from "@/components/pw/TopographicBackground";
import { DispatchResources } from '@/components/pw/DispatchResources';
const Satellites = lazy(()=>import('@/components/pw/SatellitesView').then(m=>({default:m.SatellitesView})));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PrairieWatch — Wildfire Evidence & Drone Verification" },
      { name: "description", content: "Explore three simulated wildfire verification outcomes with evidence indexes, weather-gated drone missions and dispatcher-confirmed response." },
      { property: "og:title", content: "PrairieWatch — Wildfire Evidence & Drone Verification" },
      { property: "og:description", content: "Fictional outage-check workflow: Detect, Confirm, Decide, Respond — evidence indexes, thresholds and a dispatcher-confirmed simulated response." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useSimClock();
  const s = useSim();
  const [sel, setSel] = useState<Selection>(null);
  const [results, setResults] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [satellitesOpen,setSatellitesOpen]=useState(false);
  const [cameraOpen,setCameraOpen]=useState(false);
  const [droneOpen,setDroneOpen]=useState(false);
  const [notifOpen,setNotifOpen]=useState(false);
  const [dispatchReview,setDispatchReview]=useState(false);
  const [resourcesOpen,setResourcesOpen]=useState(false);
  const headerRef=useRef<HTMLElement>(null);
  const [headerHeight,setHeaderHeight]=useState(109);
  useEffect(()=>{const header=headerRef.current;if(!header)return;const observer=new ResizeObserver(()=>setHeaderHeight(header.getBoundingClientRect().height));observer.observe(header);return()=>observer.disconnect();},[]);
  const openDispatchReview=()=>{sim.set(x=>({...x,earlyDispatchNotice:x.earlyDispatchNotice?{...x.earlyDispatchNotice,read:true}:null}));setDispatchReview(true);};
  const [inspectionTab,setInspectionTab]=useState<'camera'|'satellites'|'drone'>('camera');
  const [observationEntry,setObservationEntry]=useState(false);
  const unread = satelliteUnread(s);
  const missionActions = pendingMissionActions(s);
  const earlyEligible = s.earlyDispatchNotice && s.authorizedAt==null && score(s).total>=50 && score(s).total<80;
  const unreadNotifs = unreadMissionNotifications(s)+(earlyEligible&&!s.earlyDispatchNotice?.read?1:0);
  const activeNotif = s.notifications.filter(n=>!n.read&&!n.dismissed).at(-1);
  const openSatellites = () => {
    setInspectionTab('satellites');
    setCameraOpen(false);
    setDroneOpen(false);
    setObservationEntry(unread);
    sim.set(x=>({...openSatelliteObservation(x),playing:x.playing,motionPaused:x.motionPaused}));
    setSatellitesOpen(true);
  };
  const openCamera = () => { setInspectionTab('camera');setSatellitesOpen(false);setDroneOpen(false);setCameraOpen(true); };
  const openDrone = () => { sim.set(markMissionNotificationsRead);setInspectionTab('drone');setSatellitesOpen(false);setCameraOpen(false);setDroneOpen(true); };
  const backToIncident = () => {setCameraOpen(false);setSatellitesOpen(false);setDroneOpen(false); };
  // Reviewing a past event opens the relevant tab without changing simulation state.
  const openEventTab = (id: string) => {
    if (["c-recommend","c-drone-arrival","c-wind-change","c-returned","c-capture","c-successive","c-assessment","c-burn","c-evidence","c-decision"].includes(id)) openDrone();
    else if (["cam1","cam2","cam-b","clear","c-cam1","c-cam2"].includes(id)) openCamera();
    else if (["goes","goes-clear"].includes(id)) openSatellites();
  };
  useEffect(() => { if (s.awaitingDecision) setSheetOpen(true); }, [s.awaitingDecision]);
  const shownFor = useRef<number | null>(null);

  useEffect(() => {
    if (s.arrivedAt != null && shownFor.current !== s.arrivedAt) {
      shownFor.current = s.arrivedAt;
      setResults(true);
    }
    if (s.fired.length === 0) {
      shownFor.current = null;
      setResults(false);
      setSel(null);
      setSatellitesOpen(false);
      setCameraOpen(false);
      setDroneOpen(false);
      setNotifOpen(false);
      setDispatchReview(false);
      setResourcesOpen(false);
      setObservationEntry(false);
    }
  }, [s.arrivedAt, s.fired.length]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (satellitesOpen || cameraOpen || droneOpen) return;
      if (["INPUT","SELECT","TEXTAREA"].includes((e.target as HTMLElement).tagName) || dispatchReview) return;
      if (e.code === "Space") {
        e.preventDefault();
        sim.set((x) => (x.awaitingDecision || x.awaitingPilotApproval || x.closed ? { ...x, playing: false } : { ...x, playing: !x.playing, motionPaused: x.playing }));
      }
    };
      window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [satellitesOpen,cameraOpen,droneOpen,dispatchReview]);
  const eventId = sel?.type === "event" ? sel.id : null;
  return (
    <div className="pw-layout grid h-dvh overflow-hidden bg-background font-sans text-foreground">
      <header ref={headerRef} className="pw-header relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-5 py-3 sm:flex sm:justify-between">
        <TopographicBackground/>
        <div className="relative flex min-w-0 items-center gap-3"><h1 className="min-w-0"><img src={logoUrl} alt="PrairieWatch" width={1906} height={623} className="pw-logo block h-auto max-w-full object-contain"/></h1><span className="hidden border-l border-border pl-3 text-sm text-muted-foreground xl:block">Greenwood County, KS</span></div>
        <div className="pw-header-status relative flex shrink-0 items-center gap-5"><span className="hidden text-[9px] uppercase text-muted-foreground sm:inline">SIMULATION</span><time data-testid="scenario-time" className="whitespace-nowrap font-mono text-sm text-foreground">{fmtClock(s.t,s.scenario)}</time>
          <div className="relative">
            <Button variant="outline" size="sm" aria-label={unreadNotifs?`Notifications, ${unreadNotifs} unread`:"Notifications"} aria-expanded={notifOpen} onClick={()=>setNotifOpen(!notifOpen)}><Bell className="size-3.5"/>{unreadNotifs>0&&<span className="flex size-4 items-center justify-center rounded-full bg-warning font-mono text-[10px] text-background">{unreadNotifs}</span>}</Button>
            {notifOpen&&<div role="list" aria-label="Notification center" className="absolute right-0 top-full z-[60] mt-2 max-h-[65dvh] w-80 max-w-[80vw] overflow-y-auto rounded border border-border bg-card p-2 shadow-lg">
              {earlyEligible&&<Button variant="ghost" className="h-auto w-full whitespace-normal text-left text-warning" onClick={()=>{setNotifOpen(false);openDispatchReview();}}>Early dispatch available—review incident evidence.</Button>}
              {s.notifications.length===0&&!s.earlyDispatchNotice&&<p className="p-3 text-xs text-muted-foreground">No notifications.</p>}
              {s.notifications.slice().reverse().map(n=>(
                <button key={n.id} type="button" role="listitem" className="mt-1 block w-full rounded border border-border bg-background p-3 text-left first:mt-0" onClick={()=>{sim.set(x=>markMissionNotificationsRead(x));setNotifOpen(false);openDrone();}}>
                  <span className="flex items-center justify-between gap-2 text-xs font-semibold"><span className={n.read?"text-muted-foreground":"text-foreground"}>{n.title}</span>{!n.read&&<span className="size-2 shrink-0 rounded-full bg-warning" aria-label="unread"/>}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{n.body}</span>
                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{fmtClock(n.t,s.scenario)} · SIMULATED</span>
                </button>
              ))}
            </div>}
          </div>
          <Button variant="outline" size="sm" onClick={()=>setResults(true)}>Results</Button></div>
      </header>
      <nav aria-label="Scenario selector" className="pw-selector flex items-center gap-3 border-b border-border bg-background px-5 py-2"><span className="hidden text-xs uppercase text-muted-foreground lg:block">Scenario</span>{(["A","B","C"] as const).map(id=><Button key={id} variant={s.scenario===id?"secondary":"ghost"} aria-pressed={s.scenario===id} className="h-auto min-h-10 whitespace-normal text-left" onClick={()=>{sim.switchScenario(id);setSel(null);setResults(false);setSheetOpen(false);}}><span className="font-mono text-primary">{id}</span>{SCENARIOS[id]}</Button>)}</nav>
      <div className="pw-stages"><StageBar s={s}/></div>
       <div className="pw-dispatch"><DispatcherActions s={s} openReview={openDispatchReview} openResources={()=>setResourcesOpen(true)}/></div>
      <main className="pw-map relative min-h-0 overflow-hidden"><MapView s={s} select={setSel} selected={sel}/><div className="absolute right-4 top-16 flex max-w-[240px] flex-col items-end gap-2"><Button variant="outline" size="sm" className={unread ? "pw-satellite-unread border-observation/50 text-observation" : "border-observation/50 text-observation"} aria-label={unread ? "Satellites, 1 unread observation" : "Satellites"} onClick={openSatellites}><Satellite className="size-3"/>Satellites{unread && <span className="flex size-4 items-center justify-center rounded-full bg-warning font-mono text-[10px] text-background">1</span>}</Button><Button variant="outline" size="sm" className="text-observation border-observation/50" onClick={openCamera}><Camera className="size-3"/>Tower Cameras</Button><Button variant="outline" size="sm" className="border-observation/50 text-observation" aria-label={missionActions.length?`Drone, ${missionActions.length} pending action`:"Drone"} onClick={openDrone}><Plane className="size-3"/>Drone{missionActions.length>0&&<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 font-mono text-[10px] text-background">{missionActions.length} action{missionActions.length===1?"":"s"}</span>}</Button>{unread ? <Button variant="ghost" size="sm" className="pw-observation-message h-auto whitespace-normal bg-background/90 text-xs text-warning" onClick={openSatellites}>New satellite observation—view.</Button> : s.scenario === "A" && s.fired.includes("cam2") && !s.fired.includes("goes") && <p role="status" className="bg-background/90 px-2 py-1 text-xs text-muted-foreground">Satellite check requested.</p>}</div><ExplainCard s={s} eventId={eventId}/><Inspector s={s} sel={sel} onClose={()=>setSel(null)}/><DecisionDialog s={s}/>{results&&<Results s={s} onClose={()=>setResults(false)}/>}
        {activeNotif&&!droneOpen&&<section role="alert" className="absolute left-4 top-4 z-40 w-80 max-w-[calc(100%-2rem)] rounded border border-warning/60 bg-card p-4 shadow-lg">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Plane className="size-4 text-observation"/>{activeNotif.title}</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{activeNotif.body}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{fmtClock(activeNotif.t,s.scenario)} · SIMULATED</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={()=>{sim.set(x=>markMissionNotificationsRead(x));openDrone();}}>View Mission</Button>
            <Button size="sm" variant="outline" onClick={()=>sim.set(x=>dismissMissionNotification(x,activeNotif.id))}>Dismiss</Button>
          </div>
        </section>}
      </main>
       <div className="pw-panel min-h-0" data-open={sheetOpen} key={s.scenario}><Button variant="ghost" className="pw-sheet-toggle" aria-expanded={sheetOpen} onClick={()=>setSheetOpen(!sheetOpen)}><span>Incident details · {s.scenario}</span>{sheetOpen ? <ChevronDown/> : <ChevronUp/>}</Button><div className="pw-panel-content h-full"><SidePanel s={s} select={setSel} openCamera={openCamera} openDrone={openDrone} openResources={()=>setResourcesOpen(true)}/></div></div>
      <div className="pw-playback min-h-0"><Timeline s={s} select={setSel} selectedId={eventId} openEvent={openEventTab}/></div>
       {(satellitesOpen||cameraOpen||droneOpen)&&<div style={{top:headerHeight}} className="pw-inspection fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background">
        <StageBar s={s}/>
         <DispatcherActions s={s} openReview={openDispatchReview} openResources={()=>setResourcesOpen(true)}/>
        <div role="tablist" aria-label="Observation views" className="flex shrink-0 flex-wrap gap-1 border-b border-border px-3 py-2"><Button role="tab" aria-selected={false} variant="ghost" onClick={backToIncident}>Map</Button><Button role="tab" aria-selected={inspectionTab==='satellites'} variant={inspectionTab==='satellites'?'secondary':'ghost'} onClick={openSatellites}><Satellite className="text-observation"/>Satellite</Button><Button role="tab" aria-selected={inspectionTab==='camera'} variant={inspectionTab==='camera'?'secondary':'ghost'} onClick={openCamera}><Camera className="text-observation"/>Tower Cameras</Button><Button role="tab" aria-selected={inspectionTab==='drone'} variant={inspectionTab==='drone'?'secondary':'ghost'} onClick={openDrone}><Plane className="text-observation"/>Drone{missionActions.length>0&&<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 font-mono text-[10px] text-background">{missionActions.length} action{missionActions.length===1?"":"s"}</span>}</Button></div>
        <div className="relative min-h-0 flex-1">{droneOpen?<DroneMissionView s={s} back={backToIncident}/>:cameraOpen?<TowerCamerasView s={s} back={backToIncident}/>:<ClientOnly fallback={null}><Suspense fallback={<p className="p-5">Loading Satellites…</p>}><Satellites s={s} observationEntry={observationEntry} back={backToIncident}/></Suspense></ClientOnly>}</div><div className="h-28 shrink-0"><Timeline s={s} select={setSel} selectedId={eventId} openEvent={openEventTab}/></div>
      </div>}
      {dispatchReview&&<EarlyDispatchDialog key={`dispatch-${s.scenario}`} s={s} onClose={()=>setDispatchReview(false)}/>}
      {resourcesOpen&&<DispatchResources s={s} onClose={()=>setResourcesOpen(false)}/>}
    </div>
  );
}
