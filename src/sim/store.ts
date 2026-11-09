import { useEffect, useSyncExternalStore } from "react";
import { tick, initialState, syncDispatchState, type SimState, type ScenarioId } from "./engine";
import { nextEvent } from "./engine";
import { seekPresentation } from "./presentation";
import { CAMERA_TRANSITION_SECONDS } from "./config";
import { tickDroneDemo } from './drone-demo';
import { syncMissionNotifications } from './drone-verification';

let state: SimState = initialState();
const outcomes: Partial<Record<ScenarioId, SimState>> = {};
const listeners = new Set<() => void>();
let runId = 0;

export const sim = {
  get: () => state,
  set(fn: (s: SimState) => SimState) {
    const n = syncDispatchState(syncMissionNotifications(fn(state)));
    if (n !== state) {
      state = n;
      listeners.forEach((l) => l());
    }
  },
  outcomes: () => ({ ...outcomes, [state.scenario]: state }),
  nextEvent() {
    sim.set(s => seekPresentation(s, nextEvent(s)));
  },
  switchScenario(scenario: ScenarioId) {
    if (scenario === state.scenario) return;
    if (state.fired.length) outcomes[state.scenario] = state;
    runId++;
    state = initialState(scenario);
    listeners.forEach(l => l());
  },
  reset() {
    runId++; // invalidates any in-flight frame
    delete outcomes[state.scenario];
    state = initialState(state.scenario);
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSim(): SimState {
  return useSyncExternalStore(sim.subscribe, sim.get, sim.get);
}

/** The ONE playback clock. Mount once at the app root. */
export function useSimClock() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const myRun = runId;
      const s = sim.get();
      if (s.droneDemo.phase !== 'docked' && myRun === runId) sim.set(cur => tickDroneDemo(cur, dt));
      if ((s.playing || (!s.motionPaused && s.cameraSeek != null && s.motionTime - s.cameraSeek.startedAt < CAMERA_TRANSITION_SECONDS)) && myRun === runId) {
        sim.set((cur) => tick(cur, dt));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
