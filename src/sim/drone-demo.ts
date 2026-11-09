import type { Pt } from './scoring';
import { DOCK, IGNITION, FAULT_POS, lerpPt } from './geo';
import type { ScenarioId, SimState } from './engine';

export const DEMO_FLIGHT = { launchSeconds: 2, travelSeconds: 6, returnSeconds: 6 } as const;
export type DemoPhase = 'docked' | 'launching' | 'en route' | 'observing' | 'returning';
export type CameraDecision = 'Confirm fire' | 'Mark false alarm' | 'Request further review';
export interface DroneDemo { phase: DemoPhase; elapsed: number; phaseElapsed: number; returnFrom: Pt; decision: CameraDecision | null; snapshots: number }
export const initialDroneDemo = (): DroneDemo => ({ phase: 'docked', elapsed: 0, phaseElapsed: 0, returnFrom: DOCK, decision: null, snapshots: 0 });
export const demoTarget = (scenario: ScenarioId) => scenario === 'A' ? IGNITION : FAULT_POS;
export function demoPosition(d: DroneDemo, scenario: ScenarioId): Pt {
  if (d.phase === 'docked' || d.phase === 'launching') return DOCK;
  if (d.phase === 'returning') return lerpPt(d.returnFrom, DOCK, Math.min(1, d.phaseElapsed / DEMO_FLIGHT.returnSeconds));
  return lerpPt(DOCK, demoTarget(scenario), d.phase === 'observing' ? 1 : Math.min(1, d.phaseElapsed / DEMO_FLIGHT.travelSeconds));
}
export const demoBattery = (d: DroneDemo) => Math.max(65, 100 - Math.floor(d.elapsed / 4));
export const demoDistanceKm = (scenario: ScenarioId) => Math.hypot(...demoTarget(scenario).map((v,i) => v - DOCK[i]) as Pt);
export const canInspect = (s: SimState) => s.scenario==='C'?false:s.scenario === 'A' ? s.incidentAt != null : s.outageAt != null;
function audit(s: SimState, text: string): SimState {
  return { ...s, log: [...s.log, { id: `log-${s.log.length}`, t: s.t, source: 'camera-demo', text: `Camera demo · +${s.droneDemo.elapsed.toFixed(1)}s · ${text} · No physical command or dispatch.` }] };
}
export function cameraCommand(s: SimState, command: 'launch' | 'return' | 'snapshot' | CameraDecision, detail = ''): SimState {
  if (!canInspect(s)) return s;
  const d = s.droneDemo;
  if (command === 'launch') {
    if (d.phase !== 'docked') return s;
    return audit({ ...s, playing: false, motionPaused: true, droneDemo: { ...d, phase: 'launching', phaseElapsed: 0 } }, 'Demonstration launch from proposed central dock');
  }
  if (command === 'return') {
    if (d.phase === 'docked' || d.phase === 'returning') return s;
    return audit({ ...s, droneDemo: { ...d, phase: 'returning', phaseElapsed: 0, returnFrom: demoPosition(d, s.scenario) } }, 'Return to central dock requested');
  }
  if (d.phase !== 'observing') return s;
  if (command === 'snapshot') return audit({ ...s, droneDemo: { ...d, snapshots: d.snapshots + 1 } }, `Snapshot ${d.snapshots + 1} captured · ${detail}`);
  return audit({ ...s, droneDemo: { ...d, decision: command } }, `${command} · operator demo judgment; scenario evidence unchanged`);
}
/** Consumed by the existing sole store animation loop; never advances scenario time. */
export function tickDroneDemo(s: SimState, dt: number): SimState {
  const d = s.droneDemo;
  if (d.phase === 'docked') return s;
  let next = { ...d, elapsed: d.elapsed + dt, phaseElapsed: d.phaseElapsed + dt };
  let message = '';
  if (next.phase === 'launching' && next.phaseElapsed >= DEMO_FLIGHT.launchSeconds) { next = { ...next, phase: 'en route', phaseElapsed: next.phaseElapsed - DEMO_FLIGHT.launchSeconds }; message = 'Demonstration drone en route'; }
  if (next.phase === 'en route' && next.phaseElapsed >= DEMO_FLIGHT.travelSeconds) { next = { ...next, phase: 'observing', phaseElapsed: 0 }; message = 'Demonstration drone observing'; }
  if (next.phase === 'returning' && next.phaseElapsed >= DEMO_FLIGHT.returnSeconds) { next = { ...next, phase: 'docked', phaseElapsed: 0 }; message = 'Demonstration drone returned to central dock'; }
  const n = { ...s, droneDemo: next };
  return message ? audit(n, message) : n;
}