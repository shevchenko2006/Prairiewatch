// Presentation stages: labels only — they never change scoring or the operational workflow.
import { score, type SimState } from "./engine";

export type StageId = "detect" | "confirm" | "decide" | "respond";

export const STAGES: { id: StageId; label: string; description: string }[] = [
  { id: "detect", label: "Detect", description: "An outage arrives and triggers targeted checks while continuous monitoring continues." },
  { id: "confirm", label: "Confirm", description: "The system checks camera, satellite and resident findings and updates the evidence indexes." },
  { id: "decide", label: "Decide", description: "The total reaches 80 or higher. The dispatcher receives the alert package and reviews the incident." },
  { id: "respond", label: "Respond", description: "The dispatcher confirms and the simulated response begins. Evidence continues updating." },
];

export interface StageStatus {
  current: StageId;
  completed: StageId[];
  /** Shown beneath the active stage. */
  note: string;
  /** Scenario B ends here, with DECIDE and RESPOND left inactive. */
  checksComplete: boolean;
}

export function presentationStage(s: SimState): StageStatus {
  const reached: StageId[] = ["detect"];
  const confirmed = s.scenario === "C" ? score(s).total>=30 : s.scenario === "A" ? s.fired.includes("cam1") : s.fired.includes("clear");
  if (confirmed) reached.push("confirm");
  if (s.scenario !== "B" && s.alertAt != null && score(s).total >= 80) reached.push("decide");
  if (s.authorizedAt != null) reached.push("respond");
  const current = reached.at(-1) ?? "detect";
  const checksComplete = s.scenario === "B" && s.fired.includes("window-closed") && s.incidentAt == null;
  const note = checksComplete
    ? "Checks complete — no escalation."
    : s.authorizedAt!=null ? (s.dispatchMode==='override'?'Response initiated by dispatcher override; verification continues.':'Simulated response initiated; evidence continues updating.') : s.scenario==='C'&&s.awaitingPilotApproval ? 'Drone verification recommended—pilot approval required.' : s.scenario==='C'&&s.verification.reviewRequired&&!s.verification.accepted ? 'Verification incomplete—dispatcher review required.' : (STAGES.find(x => x.id === current)?.description ?? "");
  return { current, completed: reached.slice(0, -1), note, checksComplete };
}
