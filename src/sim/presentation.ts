import { CAMERA_TRANSITION_SECONDS, PLAYBACK, RESPONSE_TIMING } from "./config";
import { CAMERAS, DOCK, FAULT_POS, IGNITION, lerpPt } from "./geo";
import { allEvents, resourcePos, score, type SimState } from "./engine";
import type { Pt } from "./scoring";
import { C_TARGET, verificationPosition } from "./drone-verification";

export interface Frame { c: Pt; w: number }
export const PRESENTATION = { transition: 28, effect: 42, overview: { c: [25.5, 32] as Pt, w: 78 }, closeUp: { c: FAULT_POS, w: 3.4 } as Frame };
const ease = (x: number) => { const f = Math.max(0, Math.min(1, x)); return f * f * (3 - 2 * f); };
const blend = (a: Frame, b: Frame, f: number): Frame => ({ c: lerpPt(a.c, b.c, f), w: a.w * Math.pow(b.w / a.w, f) });
const ramp = (x: number) => { const f = Math.max(0,Math.min(1,x)); return f*f*f*(f*(f*6-15)+10); };
export function responseFrame(s: SimState): Frame {
  const incident = s.scenario === "C" ? C_TARGET : IGNITION;
  const engine = resourcePos(s,s.t) ?? incident;
  const span = Math.max(Math.abs(engine[0]-incident[0]),Math.abs(engine[1]-incident[1]));
  return { c: lerpPt(incident,engine,.6), w: Math.max(4,span*2.5+4) };
}
export function cameraKeys(s: SimState): { t: number; frame: Frame }[] {
  const a = CAMERAS[0]?.pos ?? IGNITION;
  const keys = [
    { t: 0, frame: PRESENTATION.overview },
  ];
  if (s.scenario === "B") return [...keys, { t: 150, frame: { c: FAULT_POS, w: 22 } }, { t: 180, frame: { c: lerpPt(a, FAULT_POS, .5), w: 22 } }];
  keys.push(
    { t: 180, frame: PRESENTATION.closeUp },
  );
  if (s.authorizedAt != null && s.fired.includes("accept")) {
    keys.push({ t: s.authorizedAt+RESPONSE_TIMING.acceptDelay, frame: responseFrame(s) });
  }
  return keys.sort((a,b) => a.t-b.t);
}
export function presentationView(s: SimState, reduced = false): Frame {
  const target = scriptedView(s, reduced);
  if (s.cameraSeek && !reduced) {
    return blend(s.cameraSeek.from, scriptedView(s, true), ramp((s.motionTime-s.cameraSeek.startedAt)/CAMERA_TRANSITION_SECONDS));
  }
  return target;
}
function scriptedView(s: SimState, reduced = false): Frame {
  if(s.scenario==="C") {
    if (s.acceptedAt != null && resourcePos(s,s.t)) {
      const target = responseFrame(s);
      if (!reduced && s.responseCameraAt != null && (s.settledAt == null || s.settledAt < s.acceptedAt)) {
        const from = { c: C_TARGET, w: s.verification.arrivedAt != null ? 3.4 : 12 };
        return blend(from,target,ramp((s.motionTime-s.responseCameraAt)/CAMERA_TRANSITION_SECONDS));
      }
      return target;
    }
    if(s.verification.arrivedAt!=null)return {c:C_TARGET,w:3.4};
    if(s.verification.launchAt!=null){const pos=verificationPosition(s.verification,s.t);return {c:lerpPt(DOCK,C_TARGET,.5),w:Math.max(12,Math.hypot(pos[0]-DOCK[0],pos[1]-DOCK[1])*2+4)};}
    return s.incidentAt==null?PRESENTATION.overview:{c:C_TARGET,w:12};
  }
  if (s.arrivedAt != null) return responseFrame(s);
  if (s.fired.includes("accept") && s.authorizedAt != null) {
    const target = responseFrame(s);
    if (!reduced && s.responseCameraAt != null && (s.settledAt == null || s.settledAt < s.authorizedAt+RESPONSE_TIMING.acceptDelay)) {
      return blend(PRESENTATION.closeUp,target,ramp((s.motionTime-s.responseCameraAt)/CAMERA_TRANSITION_SECONDS));
    }
    return target;
  }
  const keys = cameraKeys(s);
  let previous: Frame = PRESENTATION.overview;
  for (const key of keys) {
    if (key.t > s.t) break;
    if (s.scenario === "A" && key.t === 180 && s.pingStartedAt != null && !reduced && (s.settledAt == null || s.settledAt < 180)) {
      previous = blend(previous, key.frame, ramp((s.motionTime-s.pingStartedAt)/CAMERA_TRANSITION_SECONDS));
      continue;
    }
    if (visualTime(s) < key.t + PRESENTATION.transition && !reduced && (s.settledAt == null || s.settledAt < key.t)) {
      return blend(previous, key.frame, ease((visualTime(s)-key.t)/PRESENTATION.transition));
    }
    previous = key.frame;
  }
  return previous;
}
/** A seek changes scenario time immediately but moves only the presentation camera. */
export function seekPresentation(before: SimState, after: SimState): SimState {
  if (before === after || after.awaitingDecision) return after;
  return { ...after, motionPaused: false, cameraSeek: { from: presentationView(before), startedAt: after.motionTime } };
}
export function incidentPing(s: SimState, reduced = false) {
  if (s.scenario === "B" || s.incidentAt == null || s.pingStartedAt == null) return null;
  const age = Math.max(0, s.motionTime-s.pingStartedAt);
  return {
    entrance: reduced ? 1 : ease(age/.4),
    rings: reduced ? [] : [0, .8, 1.6].map(delay => {
      if (age < delay) return { radius: 6, opacity: 0 };
      const phase = ((age-delay)%2.4)/2.4;
      return { radius: 6+74*ease(phase), opacity: .4*(1-phase) };
    }),
  };
}
/** Observation holds are consumed by the existing sole clock, including pause/speed.
 * Monotonic across chained same-timestamp events: earlier holds are fully consumed before later events fire. */
export function visualTime(s: SimState): number {
  const rate = s.scenario === "B" ? PLAYBACK.outageSecondsPerRealSecond : PLAYBACK.scenarioSecondsPerRealSecond;
  const firedHolds = allEvents(s).filter(e => e.hold && s.fired.includes(e.id));
  let v = s.t;
  firedHolds.forEach((ev, i) => {
    const consumed = i === firedHolds.length - 1 ? (ev.hold ?? 0) - s.holdRemaining : (ev.hold ?? 0);
    v = Math.max(v, ev.t + Math.min(PRESENTATION.effect, consumed * rate));
  });
  return v;
}
export function eventEffect(s: SimState, id: string, reduced = false): number {
  const ev = allEvents(s).find(e => e.id === id);
  if (!ev || !s.fired.includes(id) || reduced || (s.settledAt != null && ev.t <= s.settledAt)) return 0;
  const age = visualTime(s) - ev.t;
  return age >= 0 && age < PRESENTATION.effect ? 1 - age / PRESENTATION.effect : 0;
}
export function displayedScore(s: SimState, reduced = false): number {
  const current = score(s).total;
  if(s.scenario==="C")return current;
  const obs = s.obs.filter(o => o.kind !== "utility");
  const last = obs.at(-1);
  if (!last || reduced || (s.settledAt != null && last.t <= s.settledAt)) return current;
  const before = score({ ...s, obs: s.obs.filter(o => o.t < last.t) }).total;
  return Math.round(before + (current-before) * ease((visualTime(s)-last.t)/PRESENTATION.transition));
}
export const groundedFrame: Frame = { c: DOCK, w: 20 };