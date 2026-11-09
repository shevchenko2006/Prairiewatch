import { useEffect, useMemo, useRef, useState } from "react";
import {
  CAMERAS, COUNTY, DOCK, DOCK_LABEL, FAULT_POS, IGNITION, ROADS, STATION, TOWNS, UTILITY_LINE,
  REPORTER, GOES_FOOTPRINT, type Camera,
} from "@/sim/geo";
import { APPARATUS, DEMO_STATIONS, activeAssignment } from "@/sim/resources";
import { droneState, resourcePos, resourceProgress, resourceRoute, type SimState } from "@/sim/engine";
import type { Pt } from "@/sim/scoring";
import { Button } from "@/components/ui/button";
import type { Selection } from "./types";
import { Eye, EyeOff, LocateFixed } from "lucide-react";
import { eventEffect, incidentPing, presentationView, PRESENTATION } from "@/sim/presentation";
import { OBLIQUE, projectPoint, unprojectDelta, projectionMatrix } from "./map-projection";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { sim } from "@/sim/store";
import { visibleFireFootprint, geographicScale } from "@/sim/measurements";
import { C_TARGET, C_AIRCRAFT, C_STRIKE, verificationPosition } from "@/sim/drone-verification";

const X = (p: Pt) => p[0] * 10;
const Y = (p: Pt) => (50 - p[1]) * 10;
const path = (pts: Pt[], close = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${X(p).toFixed(2)},${Y(p).toFixed(2)}`).join("") + (close ? "Z" : "");

function wedge(c: Camera) {
  const a0 = ((c.azimuth - c.fov / 2) * Math.PI) / 180;
  const a1 = ((c.azimuth + c.fov / 2) * Math.PI) / 180;
  const p = (a: number): Pt => [c.pos[0] + Math.sin(a) * c.range, c.pos[1] + Math.cos(a) * c.range];
  const A = p(a0), B = p(a1);
  return `M${X(c.pos)},${Y(c.pos)}L${X(A)},${Y(A)}A${c.range * 10},${c.range * 10} 0 0 1 ${X(B)},${Y(B)}Z`;
}

export function MapView({ s, select, selected }: { s: SimState; select: (x: Selection) => void; selected: Selection }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [follow, setFollow] = useState(true);
  const [manual, setManual] = useState({ c: [28, 24] as Pt, w: 62 });
  const [enabled, setEnabled] = useState(true);
  const reduced = useReducedMotion();
  const frame = follow && enabled ? presentationView(s, reduced) : manual;
  const overviewFit = Math.max(68, 60 * size.w / Math.max(1,size.h));
  const disp = { t: s.t, ...frame, w: frame.w >= 70 && follow && enabled ? Math.max(frame.w, overviewFit) : frame.w };
  const followRef = useRef(follow);
  followRef.current = follow;
  const manualRef = useRef(manual);
  manualRef.current = manual;
  const roadPaths = useMemo(() => ROADS.map(r => ({ ...r, d: path(r.pts), minX: Math.min(...r.pts.map(p=>p[0])), maxX: Math.max(...r.pts.map(p=>p[0])), minY: Math.min(...r.pts.map(p=>p[1])), maxY: Math.max(...r.pts.map(p=>p[1])) })), []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset and scenario switches restore framing without remounting the SVG.
  useEffect(() => {
    if (s.fired.length === 0) { setFollow(true); setEnabled(true); setManual(PRESENTATION.overview); }
  }, [s.scenario, s.fired.length, s.log]);
  useEffect(() => {
    if (s.playing) { setFollow(true); setEnabled(true); }
  }, [s.playing]);

  const h = (disp.w * size.h) / size.w;
  const k = (disp.w * 10) / size.w; // svg units per pixel
  const center: Pt = [X(disp.c), Y(disp.c)];
  const groundMatrix = projectionMatrix(center, reduced);
  const { a, b, c, d } = OBLIQUE;
  const det = a*d-b*c;
  const inverseMatrix = reduced ? "matrix(1 0 0 1 0 0)" : `matrix(${d/det} ${-b/det} ${-c/det} ${a/det} ${center[0]-(d*center[0]-c*center[1])/det} ${center[1]-(-b*center[0]+a*center[1])/det})`;
  const closeUp = s.scenario === "A" && s.incidentAt != null && disp.w <= 4;
  const focusOffset = s.scenario === "A" && s.incidentAt != null ? Math.max(0,Math.min(1,(10-disp.w)/6))*Math.min(70, size.h*.14) * k : 0;
  const vb = `${(disp.c[0] - disp.w / 2) * 10} ${(50 - disp.c[1] - h / 2) * 10 + focusOffset} ${disp.w * 10} ${h * 10}`;
  const ping = incidentPing(s, reduced);
  // A horizontal screen segment corresponds to this inverse-projected ground distance.
  const scaleDelta = unprojectDelta([disp.w / Math.max(1, size.w), 0], reduced);
  const scale = geographicScale(Math.hypot(...scaleDelta));

  const takeManual = () => {
    if (followRef.current) {
      setManual({ c: disp.c, w: disp.w });
      manualRef.current = { c: disp.c, w: disp.w };
      setFollow(false);
    }
  };

  // wheel zoom anchored at cursor
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    takeManual();
    const element = wrap.current;
    if (!element) return;
    const r = element.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const m = manualRef.current;
    const nw = Math.min(90, Math.max(3, m.w * Math.exp(dy * 0.0015)));
    const mh = (m.w * r.height) / r.width;
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const delta = unprojectDelta([(px-.5)*m.w, (py-.5)*mh], reduced);
    const ax = m.c[0] + delta[0];
    const ay = m.c[1] - delta[1];
    const kk = nw / m.w;
    const next = { c: [ax - (ax - m.c[0]) * kk, ay - (ay - m.c[1]) * kk] as Pt, w: nw };
    manualRef.current = next;
    setManual(next);
  };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  const drag = useRef<{ x: number; y: number; c: Pt; moved: boolean } | null>(null);
  const touches = useRef(new Map<number, Pt>());
  const pinch = useRef<{ distance: number; w: number } | null>(null);

  const t = disp.t;
  const fire = visibleFireFootprint(s);
  const drone = droneState(s, t);
  const responseUnit=APPARATUS.find(a=>a.id===activeAssignment(s.resources)?.apparatusId);
  const res = resourcePos(s, t);
  const resProgress = resourceProgress(s, t);
  const assignment = activeAssignment(s.resources);
  const assignedStation = assignment ? DEMO_STATIONS.find(d => d.id === assignment.stationId) : null;
  const showIncident = s.incidentAt != null;
  const incidentPos = s.scenario==="C"?C_TARGET:FAULT_POS;
  const dronePos=verificationPosition(s.verification,s.t);
  const searchR = s.scenario==="C"?(s.verification.locationAttached ? .15 : 1.8):t < 540 ? 1.8 : 0.9;
  const fs = 12 * k;
  const camA = CAMERAS.find(c => c.id === "TWR-A");
  const camB = CAMERAS.find(c => c.id === "TWR-B");
  const fx = (id: string) => s.awaitingDecision ? 0 : eventEffect(s, id, reduced);
  const reportFx = fx("sms");
  const outageFx = Math.max(fx("transformer"), fx("outage"), fx("outage-match"));
  const cameraFx = (id: string) => id === "TWR-A" ? Math.max(fx("cam1"), fx("cam2"), fx("clear")) : id === "TWR-B" ? fx("cam-b") : 0;

  const Label = ({ p, text, sel, onClick, color = "var(--foreground)", dy = -14 }: { p: Pt; text: string; sel: Selection; onClick?: () => void; color?: string; dy?: number }) => {
    if (closeUp) return null;
    if (s.acceptedAt != null && sel?.type !== "resource" && !(sel?.type === "incident" && text.startsWith("Search area"))) return null;
    const width = text.length * fs * .59 + 10*k;
    const point = projectPoint([X(p),Y(p)],center,reduced);
    const left = (disp.c[0] - disp.w/2)*10;
    const top = (50-disp.c[1]-h/2)*10;
    const cx = Math.max(left+width/2+8*k,Math.min(left+disp.w*10-width/2-8*k,point[0]));
    const cy = Math.max(top+100*k,Math.min(top+h*10-165*k,point[1]+dy*k));
    // Don't pin off-screen asset labels to map edges.
    if (point[0]<left || point[0]>left+disp.w*10 || point[1]<top || point[1]>top+h*10) return null;
    return <g transform={inverseMatrix}><g transform={`translate(${cx},${cy})`} className="cursor-pointer" onClick={e=>{e.stopPropagation();(onClick??(()=>select(sel)))();}}>
      <rect x={-width/2} y={-fs*.85} width={width} height={fs*1.45} rx={3*k} fill="var(--background)" fillOpacity={.9} stroke={color} strokeOpacity={.35} strokeWidth={k}/>
      <text textAnchor="middle" y={fs*.2} fontSize={fs} fill={color} fontFamily="var(--font-sans)">{text}</text>
    </g></g>;
  };

  return (
    <div
      ref={wrap}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-background"
      onPointerDown={(e) => {
        if ((e.target as Element).closest("button,a")) return;
        if (e.pointerType === "touch") {
          touches.current.set(e.pointerId,[e.clientX,e.clientY]);
          const pts = [...touches.current.values()];
          if (pts.length === 2) {
            pinch.current = { distance: Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]), w: disp.w };
            drag.current = null;
            return;
          }
        }
        drag.current = { x: e.clientX, y: e.clientY, c: follow ? disp.c : manual.c, moved: false };
      }}
      onPointerMove={(e) => {
        if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId,[e.clientX,e.clientY]);
        if (pinch.current) {
          const pts = [...touches.current.values()];
          if (pts.length !== 2) return;
          const distance = Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);
          if (Math.abs(distance-pinch.current.distance)<10) return;
          takeManual();
          const next = { c: manualRef.current.c, w: Math.max(2,Math.min(90,pinch.current.w*pinch.current.distance/Math.max(1,distance))) };
          manualRef.current = next; setManual(next);
          return;
        }
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < (e.pointerType === "touch" ? 14 : 6)) return;
        if (!d.moved) { d.moved = true; takeManual(); e.currentTarget.setPointerCapture(e.pointerId); }
        const kmPerPx = manualRef.current.w / size.w;
        const delta = unprojectDelta([dx * kmPerPx, dy * kmPerPx], reduced);
        const next = { c: [d.c[0] - delta[0], d.c[1] + delta[1]] as Pt, w: manualRef.current.w };
        manualRef.current = next;
        setManual(next);
      }}
      onPointerUp={(e) => { touches.current.delete(e.pointerId); pinch.current=null; drag.current=null; }}
      onPointerCancel={(e) => { touches.current.delete(e.pointerId); pinch.current=null; drag.current=null; }}
      onLostPointerCapture={() => (drag.current = null)}
    >
      <svg aria-label="Greenwood County, Kansas · Census geography with illustrative scenario layers" data-testid="county-map" data-view-width={disp.w} className="h-full w-full" viewBox={vb} preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="var(--terrain)" strokeOpacity="0.12" strokeWidth={k} />
          </pattern>
        </defs>
        <g transform={groundMatrix}>
        <path className="pw-depth pw-boundary-shadow" d={path(COUNTY,true)} transform={`translate(0,${7*k})`} strokeWidth={k}/>
        <path data-testid="county-boundary" d={path(COUNTY, true)} fill="var(--terrain)" fillOpacity={0.055} stroke="var(--terrain)" strokeOpacity={.8} strokeWidth={1.5 * k} />
        {roadPaths.filter(r=>r.maxX>=disp.c[0]-disp.w && r.minX<=disp.c[0]+disp.w && r.maxY>=disp.c[1]-Math.max(h,disp.w) && r.minY<=disp.c[1]+Math.max(h,disp.w)).map((r) => (
          <path key={r.id} data-road-id={r.id} d={r.d} fill="none" stroke="var(--road)" strokeOpacity={r.major ? 0.55 : closeUp ? .38 : disp.w < 36 ? 0.18 : 0.07} strokeWidth={(r.major ? 1.05 : .5) * k} />
        ))}
        <path d={path(UTILITY_LINE)} fill="none" stroke="var(--gold)" strokeOpacity={closeUp ? .2 : .6} strokeWidth={1.4 * k} strokeDasharray={`${2 * k} ${3 * k}`} />
        {outageFx > 0 && <path d={path(UTILITY_LINE)} fill="none" stroke={s.scenario === "B" ? "var(--muted-foreground)" : "var(--warning)"} strokeWidth={(2+outageFx*4)*k} opacity={outageFx*.7}/>}

        {CAMERAS.filter(c=>!closeUp && (c.id!=="TWR-C" || disp.w<30)).map((c) => (
          <path key={c.id} d={wedge(c)} fill="var(--observation)" fillOpacity={((c.id === "TWR-A" && s.fired.includes("cam1")) || (c.id === "TWR-B" && s.fired.includes("cam-b"))) ? 0.025 : 0.012} stroke="var(--observation)" strokeOpacity={((c.id === "TWR-A" && s.fired.includes("cam1")) || (c.id === "TWR-B" && s.fired.includes("cam-b"))) ? 0.45 : 0.15} strokeWidth={k} />
        ))}
        {CAMERAS.map(c => cameraFx(c.id)>0 && <path key={`check-${c.id}`} d={wedge(c)} fill="var(--observation)" fillOpacity={cameraFx(c.id)*.13} stroke="var(--observation)" strokeOpacity={cameraFx(c.id)*.7} strokeWidth={2*k}/>)}

        {camA && (s.fired.includes("cam1") || s.fired.includes("c-cam1")) && (
          <line x1={X(camA.pos)} y1={Y(camA.pos)} x2={X(s.scenario==="C"?C_TARGET:IGNITION)} y2={Y(s.scenario==="C"?C_TARGET:IGNITION)} pathLength={1} stroke="var(--observation)" strokeWidth={1.2 * k} strokeDasharray="1" strokeDashoffset={Math.max(fx("cam1"),fx("cam2"),fx("cam-b"))} opacity={0.8} className={fx("cam1")>0 || fx("cam-b")>0 ? "pw-observation-glow" : undefined} />
        )}
        {s.fired.includes("goes") && (
          <g><path d={path(GOES_FOOTPRINT,true)} fill="var(--observation)" fillOpacity={.04+fx("goes")*.12} stroke="var(--observation)" strokeOpacity={.45} strokeWidth={k} strokeDasharray={`${3*k} ${3*k}`}/><Label p={GOES_FOOTPRINT[0] ?? IGNITION} text="GOES footprint · illustrative" sel={{type:"incident"}} color="var(--observation)" dy={-22}/></g>
        )}

        {camB && s.fired.includes("cam-b") && <line x1={X(camB.pos)} y1={Y(camB.pos)} x2={X(s.scenario==="C"?C_TARGET:IGNITION)} y2={Y(s.scenario==="C"?C_TARGET:IGNITION)} pathLength={1} stroke="var(--observation)" strokeWidth={1.2*k} strokeDasharray="1" strokeDashoffset={fx("cam-b")} />}
        {s.outageAt != null && <g data-testid="outage-marker"><circle cx={X(incidentPos)} cy={Y(incidentPos)} r={7*k} fill="var(--muted-foreground)" stroke="var(--foreground)" strokeWidth={k}/>{s.scenario === "B" && <Label p={FAULT_POS} text={s.clearViewAt != null ? "Checked view · no smoke" : "Outage context"} sel={{type:"incident"}} color="var(--muted-foreground)" dy={-22}/>}</g>}
        {s.scenario === "C" && !closeUp && (
          <g data-testid="lightning-strike-marker" className="cursor-pointer" onClick={(e) => { e.stopPropagation(); select({ type: "incident" }); }}>
            <circle cx={X(C_STRIKE.pos)} cy={Y(C_STRIKE.pos)} r={C_STRIKE.uncertaintyKm * 10} fill="var(--lightning)" fillOpacity={0.05} stroke="var(--lightning)" strokeOpacity={0.35} strokeWidth={k} strokeDasharray={`${3 * k} ${3 * k}`} />
            <g transform={`translate(${X(C_STRIKE.pos)},${Y(C_STRIKE.pos)}) scale(${k})`}>
              <path d="M1.5,-7 L-2.5,0.5 L-0.2,0.5 L-1.5,7 L2.5,-1.5 L0.2,-1.5 Z" fill="var(--lightning)" stroke="var(--background)" strokeWidth={0.8} strokeLinejoin="round" />
            </g>
            <Label p={C_STRIKE.pos} text="Earlier lightning · 2:30 PM · context only" sel={{ type: "incident" }} color="var(--lightning)" dy={-20} />
          </g>
        )}
        {showIncident && !closeUp && (
          <g>
            <circle cx={X(incidentPos)} cy={Y(incidentPos)} r={searchR * 10} fill="var(--warning)" fillOpacity={0.06} stroke="var(--warning)" strokeWidth={1.2 * k} strokeDasharray={`${6 * k} ${4 * k}`}  />
            <circle cx={X(incidentPos)} cy={Y(incidentPos)} r={searchR * 10 * 1.5} fill="none" stroke="var(--warning)" strokeOpacity={0.25} strokeWidth={k}  />
          </g>
        )}

        {fire && (
          <path data-testid="fire-perimeter" d={path(fire, true)} fill="var(--fire)" fillOpacity={0.28} stroke="var(--fire)" strokeWidth={1.6 * k} strokeLinejoin="round" />
        )}
        {s.scenario === "A" && s.fired.includes("sms") && <g data-testid="reporter-marker"><line x1={X(REPORTER)} y1={Y(REPORTER)} x2={X(IGNITION)} y2={Y(IGNITION)} stroke="var(--primary)" strokeOpacity={.35} strokeDasharray={`${2*k} ${4*k}`} strokeWidth={k}/><circle cx={X(REPORTER)} cy={Y(REPORTER)} r={4*k} fill="var(--primary)"/>{reportFx>0 && <circle cx={X(REPORTER)} cy={Y(REPORTER)} r={(8+(1-reportFx)*20)*k} fill="none" stroke="var(--primary)" opacity={reportFx} strokeWidth={1.5*k}/>}<Label p={REPORTER} text="Rancher GPS · fictional" sel={{type:"incident"}} color="var(--primary)" dy={28}/></g>}

        {s.scenario==='C'&&s.verification.launchAt!=null&&<g data-testid="verification-flight"><path d={path([DOCK,C_AIRCRAFT])} fill="none" stroke="var(--primary)" strokeWidth={2*k} strokeDasharray={`${5*k} ${3*k}`}/><circle data-testid="verification-aircraft" cx={X(dronePos)} cy={Y(dronePos)} r={6*k} fill="var(--observation)" stroke="var(--foreground)" strokeWidth={k}/><Label p={dronePos} text={`Drone · ${s.verification.phase} · simulated`} sel={{type:'drone'}} color="var(--observation)"/></g>}
        {s.scenario==='C'&&s.verification.locationAttached&&<circle data-testid="observed-fire-location" cx={X(C_TARGET)} cy={Y(C_TARGET)} r={4*k} fill="var(--fire)"/>}
        {res && <path data-testid="approved-route" d={path(resourceRoute(s))} fill="none" stroke="var(--primary)" strokeOpacity={0.3} strokeWidth={2 * k} strokeDasharray={`${4 * k} ${3 * k}`} />}
        {res && resProgress > 0 && <path className="pw-map-glow" data-testid="completed-route" d={path(resourceRoute(s))} pathLength={1} strokeDasharray={`${resProgress} 1`} fill="none" stroke="var(--primary)" strokeOpacity={0.9} strokeWidth={2.4 * k} />}

        {TOWNS.filter(tw=>disp.w<42 || tw.name==="Eureka" || tw.name==="Madison").map(tw=><g key={tw.id}><circle cx={X(tw.pos)} cy={Y(tw.pos)} r={2*k} fill="var(--muted-foreground)"/><Label p={tw.pos} text={tw.name} sel={{type:"station"}} color="var(--muted-foreground)" dy={14}/></g>)}

        {CAMERAS.filter(c=>c.id!=="TWR-C" || disp.w<30).map((c) => (
          <g key={c.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); select({ type: "camera", id: c.id }); }}>
            <rect x={X(c.pos) - 4 * k} y={Y(c.pos) - 4 * k} width={8 * k} height={8 * k} fill={(c.id === "TWR-A" && (s.fired.includes("cam1") || s.clearViewAt != null)) || (c.id === "TWR-B" && s.fired.includes("cam-b")) ? "var(--observation)" : "var(--card)"} stroke="var(--observation)" strokeWidth={1.2 * k} transform={`rotate(45 ${X(c.pos)} ${Y(c.pos)})`} />
          </g>
        ))}
        {CAMERAS.filter(c=>(c.id!=="TWR-C" || disp.w<30) && (disp.w<45 || (c.id==="TWR-A" && s.fired.includes("cam1")) || (c.id==="TWR-B" && s.fired.includes("cam-b")))).map((c) => (
          <Label key={c.id} p={c.pos} text={`${c.id==='TWR-A'?'TW-01':c.id==='TWR-B'?'TW-02':'TW-03'} · ${c.name}`} sel={{ type: "camera", id: c.id }} color={(c.id === "TWR-A" && (s.fired.includes("cam1") || s.clearViewAt != null)) || (c.id === "TWR-B" && s.fired.includes("cam-b")) ? "var(--observation)" : "var(--muted-foreground)"} dy={c.id === "TWR-A" ? -24 : -18} />
        ))}

        <g role="button" tabIndex={0} aria-label={DOCK_LABEL} data-testid="central-drone-dock" data-x={DOCK[0]} data-y={DOCK[1]} className="cursor-pointer" onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select({type:'drone'});}}} onClick={(e) => { e.stopPropagation(); select({ type: "drone" }); }}>
          <rect x={X(DOCK) - 7 * k} y={Y(DOCK) - 7 * k} width={14 * k} height={14 * k} fill="var(--background)" stroke="var(--gold)" strokeWidth={1.2 * k} />
        </g>
        {!closeUp && <Label p={DOCK} text={DOCK_LABEL} sel={{ type: "drone" }} color="var(--gold)" dy={32} />}

        <g className="cursor-pointer" data-testid="station-marker" onClick={(e) => { e.stopPropagation(); select({ type: "station" }); }}>
          <circle cx={X(STATION.pos)} cy={Y(STATION.pos)} r={4.5 * k} fill="var(--card)" stroke={assignedStation ? "var(--primary)" : "var(--foreground)"} strokeWidth={1.2 * k} />
        </g>
        {!closeUp && disp.w < 45 && <Label p={STATION.pos} text={assignedStation ? `${assignedStation.name} · simulated` : STATION.name} sel={assignedStation ? { type: "resource" } : { type: "station" }} color={assignedStation ? "var(--primary)" : "var(--muted-foreground)"} dy={18} />}

        {showIncident && disp.w<45 && <Label p={incidentPos} text={s.scenario==="C"?(s.verification.locationAttached?"Observed location · simulated":"Single bearing · uncertain source"):"Search area · illustrative"} sel={{ type: "incident" }} color="var(--warning)" dy={-(searchR * 10) / k - 14} />}

        {res && (
          <g data-testid="response-resource" className="cursor-pointer" onClick={(e) => { e.stopPropagation(); select({ type: "resource" }); }} transform={`translate(${X(res)},${Y(res)})`}>
            <rect x={-6 * k} y={-4 * k} width={12 * k} height={8 * k} rx={2 * k} fill="var(--foreground)" stroke="var(--primary)" strokeWidth={1.2 * k} />
          </g>
        )}
        {res && <Label p={res} text={`${responseUnit?.name??"Unit"} · ${activeAssignment(s.resources)?.status??"simulated"}`} sel={{ type: "resource" }} dy={-16} />}

        {fire && t > 30 && disp.w<24 && <Label p={[IGNITION[0] -.5, IGNITION[1] - .4]} text="Scripted fire" sel={{ type: "incident" }} color="var(--fire)" dy={34} />}
        {ping && <g transform={inverseMatrix} data-testid="incident-beacon" onClick={()=>select({type:"incident"})}>
          {(()=>{const p=projectPoint([X(incidentPos),Y(incidentPos)],center,reduced);return <g transform={`translate(${p[0]},${p[1]})`} className="cursor-pointer">
            <g data-testid="incident-radar" opacity={ping.entrance}>
              {ping.rings.map((ring,i)=><circle key={i} data-testid={`radar-ring-${i}`} r={ring.radius*k} fill="none" stroke="var(--danger)" strokeWidth={1.2*k} opacity={ring.opacity}/>)}
              <circle r={(7+5*ping.entrance)*k} fill="var(--danger)" opacity={.08*ping.entrance}/>
              <circle data-testid="incident-dot" r={6*k*(.5+.5*ping.entrance)} fill="var(--danger)" opacity={ping.entrance}/>
            </g>
            {closeUp && <g transform={`translate(${18*k},${-24*k})`}><rect y={-14*k} width={150*k} height={24*k} rx={3*k} fill="var(--background)" fillOpacity={.9}/><text fontSize={12*k} fill="var(--foreground)" fontFamily="var(--font-sans)">Smoke observation</text></g>}
          </g>;})()}
        </g>}
        </g>
      </svg>

      <div className="absolute left-4 top-4 right-4 flex flex-wrap items-start justify-between gap-2">
      <div className="pointer-events-none bg-background/90 py-1"><p className="text-sm font-semibold">Greenwood County <span className="text-muted-foreground">· Kansas</span></p><p className="pw-map-caption mt-1 text-[10px] text-muted-foreground">Census geography · illustrative assets & depth</p></div>
      <div className="flex gap-1.5 bg-background/90">
        <Button variant="outline" size="sm"
          onClick={() => { sim.set(x=>({...x,cameraSeek:null,pingStartedAt:x.pingStartedAt==null?null:Math.min(x.pingStartedAt,x.motionTime-2),responseCameraAt:null})); setFollow(true); setEnabled(true); }}
          disabled={follow && enabled}
          className="bg-card/90 px-2.5 py-1 text-[11px] text-foreground disabled:text-muted-foreground"
        >
          <LocateFixed className="size-3"/>Follow incident
        </Button>
        <Button variant="outline" size="icon" className="size-9" aria-label={enabled ? "Turn off presentation camera" : "Turn on presentation camera"} title={enabled ? "Turn off presentation camera" : "Turn on presentation camera"} onClick={()=>{setManual({c:disp.c,w:disp.w});setEnabled(!enabled);setFollow(true);}}>{enabled ? <Eye/> : <EyeOff/>}</Button>
      </div></div>
      <div className="pointer-events-none absolute top-20 left-4 bg-background/90 px-2 py-1 text-[10px] text-foreground max-[700px]:top-16" aria-label={`Geographic scale: ${scale.label}`} data-testid="geographic-scale"><span>{scale.label}</span><div className="mt-1 h-1.5 border-x border-b border-foreground" style={{width:scale.pixels}}/><span className="text-[8px] text-muted-foreground">Approx. ground distance</span></div>
      <div className="pw-attribution absolute bottom-2 left-5 right-5 flex flex-wrap justify-between gap-1 text-[9px] text-muted-foreground"><a className="text-primary" href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html" target="_blank" rel="noreferrer">© U.S. Census Bureau · TIGER/Line & CB 2023</a><span>Illustrative depth · no elevation · unvalidated response route</span></div>
      {selected?.type === "camera" && null}
    </div>
  );
}
