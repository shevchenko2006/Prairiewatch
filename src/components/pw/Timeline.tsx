import { useEffect, useRef } from "react";
import { Pause, Play, RotateCcw, SkipForward, Cctv, Satellite, Phone, Zap, Wind, Plane, MessageSquare, UserCheck, Truck, Flame, Camera, Cpu, ClipboardCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAYBACK } from "@/sim/config";
import { allEvents, fmtClock, nextPending, scenarioEnd, type SimState } from "@/sim/engine";
import { sim } from "@/sim/store";
import { cn } from "@/lib/utils";
import type { Selection } from "./types";

/** Source/action icon per event id; text labels accompany every icon so meaning never depends on the icon alone. */
const EVENT_ICONS: Record<string, { Icon: typeof Zap; label: string; observation?: boolean }> = {
  outage: { Icon: Zap, label: "Utility outage" },
  transformer: { Icon: Zap, label: "Utility outage" },
  "outage-match": { Icon: Zap, label: "Utility outage match" },
  "window-closed": { Icon: Zap, label: "Utility outage window" },
  "c-strike": { Icon: Zap, label: "Lightning record · simulated" },
  "c-sms": { Icon: MessageSquare, label: "Resident report" },
  weather: { Icon: Wind, label: "Weather check" },
  "c-wind-change": { Icon: Wind, label: "Weather check · abort" },
  cam1: { Icon: Cctv, label: "Tower-camera observation", observation: true },
  cam2: { Icon: Cctv, label: "Tower-camera observation", observation: true },
  "cam-b": { Icon: Cctv, label: "Tower-camera observation", observation: true },
  clear: { Icon: Cctv, label: "Tower-camera observation", observation: true },
  "c-cam1": { Icon: Cctv, label: "Tower-camera observation", observation: true },
  "c-cam2": { Icon: Cctv, label: "Tower-camera observation", observation: true },
  goes: { Icon: Satellite, label: "Satellite observation", observation: true },
  "goes-clear": { Icon: Satellite, label: "Satellite observation", observation: true },
  sms: { Icon: MessageSquare, label: "Resident outreach" },
  "call-911": { Icon: Phone, label: "911 call" },
  firebreaks: { Icon: Flame, label: "Scenario context" },
  "c-recommend": { Icon: Plane, label: "Drone verification recommended", observation: true },
  "c-drone-arrival": { Icon: Plane, label: "Drone arrival", observation: true },
  "c-returned": { Icon: Plane, label: "Drone returned", observation: true },
  "c-capture": {Icon:Camera,label:"Automatic image capture",observation:true},
  "c-successive": {Icon:Camera,label:"Successive observation",observation:true},
  "c-assessment": {Icon:Cpu,label:"AI assessment · scripted"},
  "c-burn": {Icon:ClipboardCheck,label:"Burn-record check"},
  "c-gap": {Icon:Cctv,label:"Tower camera unavailable",observation:true},
  "c-evidence": {Icon:Camera,label:"Qualifying Drone evidence",observation:true},
  "c-decision": {Icon:UserCheck,label:"Dispatcher receipt"},
  "c-return": {Icon:Plane,label:"Drone return"},
  decision: { Icon: UserCheck, label: "Dispatcher confirmation" },
  notify: { Icon: Truck, label: "Response" },
  "coord-ack": { Icon: Truck, label: "Response" },
  accept: { Icon: Truck, label: "Response" },
  arrive: { Icon: Truck, label: "Response" },
};

export function Timeline({ s, select, selectedId, openEvent }: { s: SimState; select: (x: Selection) => void; selectedId: string | null; openEvent?: (id: string) => void }) {
  const strip=useRef<HTMLDivElement>(null);
  const activeId=s.fired.at(-1);
  useEffect(()=>{const el=strip.current;const card=el?.querySelector<HTMLElement>(`[data-event-id="${selectedId??activeId}"]`);if(!el||!card)return;const left=card.offsetLeft-el.offsetLeft;if(left<el.scrollLeft||left+card.offsetWidth>el.scrollLeft+el.clientWidth)el.scrollTo({left:Math.max(0,left-8),behavior:"instant"});},[activeId,selectedId]);
  const events = allEvents(s);
  const pending = nextPending(s);
  const blocked = s.awaitingDecision ? "Decision required" : s.awaitingPilotApproval ? "Pilot approval required" : s.closed ? "Incident closed" : s.t >= scenarioEnd(s) ? "Run complete" : null;
  return <div className="pw-timeline flex flex-col border-t border-border bg-card">
    <div className="pw-playback-controls grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><Button variant="outline" size="icon" aria-label="Reset" title="Reset scenario" onClick={()=>sim.reset()}><RotateCcw/></Button><Button size="icon" aria-label={s.playing ? "Pause" : "Play"} title={blocked ?? "Play / pause"} disabled={!s.playing && !!blocked} onClick={()=>sim.set(x=>({...x,playing:!x.playing,motionPaused:x.playing}))}>{s.playing ? <Pause/> : <Play/>}</Button><Button variant="outline" aria-label="Next event" disabled={!!blocked || !pending} onClick={()=>sim.nextEvent()}><SkipForward/><span className="hidden min-[900px]:inline">Next event</span></Button><div className="ml-2 flex gap-1">{PLAYBACK.speeds.map(speed=><Button key={speed} variant={s.speed===speed?"secondary":"ghost"} size="sm" aria-label={`Speed ${speed}`} aria-pressed={s.speed===speed} onClick={()=>sim.set(x=>({...x,speed}))}>{speed}×</Button>)}</div></div>
      <div className="text-right text-xs text-muted-foreground"><p className={blocked?"text-warning":"text-primary"}>{blocked ?? (s.playing ? s.holdRemaining > 0 ? "Observation hold" : "Playing" : "Paused")}</p><p className="mt-1 hidden sm:block">{s.scenario === "A" ? "Approx. 3–4 min + your decisions" : s.scenario==="C"?"Pilot-supervised simulated workflow":"Approx. 35–40 sec"} at 1×</p></div>
    </div>
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-2 pb-2"><Button variant="ghost" size="icon" aria-label="Earlier timeline events" onClick={()=>strip.current?.scrollBy({left:-320,behavior:"smooth"})}><ChevronLeft/></Button><div ref={strip} className="pw-event-strip relative flex items-stretch gap-2 overflow-x-auto pb-2" aria-label="Event timeline">{events.map(e=>{const meta=EVENT_ICONS[e.id];const Icon=meta?.Icon ?? Camera;const observation=meta?.observation ?? false;return <Button data-event-id={e.id} key={e.id} variant="ghost" title={meta?`${meta.label} · ${e.title}`:e.title} className={cn("h-auto min-h-28 w-56 shrink-0 flex-col items-start gap-1 rounded-none border-t-2 px-3 py-2 text-left",s.fired.includes(e.id)?observation?"border-observation":"border-primary":"border-border text-muted-foreground",(selectedId===e.id || s.fired.at(-1)===e.id)&&"bg-accent text-gold",(selectedId===e.id || s.fired.at(-1)===e.id)&&(observation?"border-observation":"border-gold"))} onClick={()=>{select({type:"event",id:e.id});openEvent?.(e.id);}}><time className="flex items-center gap-2 font-mono text-xs"><Icon className={cn("size-3",e.id==="c-strike"?"text-lightning":observation?"text-observation":meta?.label.startsWith("Utility")?"text-warning":"text-primary")}/>{fmtClock(e.t,s.scenario)}</time><span className="max-w-52 whitespace-normal text-xs">{e.title}</span>{meta&&<span className="text-[9px] uppercase tracking-wide text-muted-foreground">{meta.label}</span>}</Button>})}</div><Button variant="ghost" size="icon" aria-label="Later timeline events" onClick={()=>strip.current?.scrollBy({left:320,behavior:"smooth"})}><ChevronRight/></Button></div>
  </div>;
}
