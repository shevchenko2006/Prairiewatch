import { SCORING as S, THRESHOLDS, DRONE_POLICY, type WeatherLevel } from "./config";

export type Pt = [number, number]; // km on schematic local plane

interface ObsBase {
  id: string;
  t: number;
  /** Marked by the scenario as relevant to the same incident. */
  relevant: boolean;
}
export type Obs =
  | (ObsBase & { kind: 'drone'; visibleFlames: boolean; thermalHotspot: boolean; operatorAccepted: boolean })
  | (ObsBase & {
      kind: "utility";
      /** Cause field, when the feed reports one. */
      cause?: "line down" | "wire down" | "fault";
      windMph?: number;
    })
  | (ObsBase & {
      kind: "911";
      witnessId: string;
      witnessName: string;
      pos: Pt;
      content: "flames" | "landmark" | "smoke" | "smell";
    })
  | (ObsBase & {
      kind: "sms";
      witnessId: string;
      witnessName: string;
      pos?: Pt;
      gps: boolean;
      trusted: boolean;
      photoUnchecked?: boolean;
    })
  | (ObsBase & { kind: "goes"; category: "low" | "medium" | "high"; scan: number })
  | (ObsBase & {
      kind: "camera";
      cameraId: string;
      frameId: string;
      confidence: number;
      growing: boolean;
      crossingBearing?: boolean;
      /** Clear view with nothing seen: −15, floored at zero. */
      clearView?: boolean;
    });

export interface GroupScore {
  points: number;
  lines: string[];
}
export interface Breakdown {
  drone: GroupScore;
  e911: GroupScore;
  sms: GroupScore;
  goes: GroupScore;
  camera: GroupScore;
  outage: GroupScore & { locked: boolean };
  cross: GroupScore & { classes: string[] };
  total: number;
  nonHumanPoints: number;
}

/** State that gates scoring, set by scripted events so judges see each change. */
export interface ScoringGates {
  /** Outage index stays locked at zero until matching smoke or heat evidence exists. */
  outageUnlocked: boolean;
  /** Cross-class agreement bonus, awarded by the scripted agreement events. */
  crossBonus: number;
  droneRuleEnabled?: boolean;
}

const cap = (v: number, c: number, lines: string[]) => {
  if (v > c) {
    lines.push(`Index cap applied: ${v} → ${c}`);
    return c;
  }
  return Math.max(0, v);
};

export function scoreEvidence(all: Obs[], gates: ScoringGates = { outageUnlocked: false, crossBonus: 0 }): Breakdown {
  const obs = [...all].filter((o) => o.relevant).sort((a, b) => a.t - b.t);

  // ---- 911 ----
  const l911: string[] = [];
  const seen = new Set<string>();
  let p911 = 0;
  for (const o of obs) {
    if (o.kind !== "911") continue;
    if (seen.has(o.witnessId)) {
      l911.push(`${o.witnessName}: repeat caller +0`);
      continue;
    }
    seen.add(o.witnessId);
    if (seen.size === 1) {
      p911 += S.e911.first;
      l911.push(`${o.witnessName}: first call +${S.e911.first}`);
      if (o.content === "flames" || o.content === "landmark") {
        p911 += S.e911.content;
        l911.push(`Report includes ${o.content === "flames" ? "flames" : "a named road or landmark"}: +${S.e911.content}`);
      }
    } else {
      l911.push(`${o.witnessName}: additional caller +0`);
    }
  }
  p911 = cap(p911, S.e911.cap, l911);

  // ---- SMS ----
  const lsms: string[] = [];
  const smsSeen = new Set<string>();
  let psms = 0;
  let gps = false,
    trusted = false;
  for (const o of obs) {
    if (o.kind !== "sms") continue;
    if (seen.has(o.witnessId) || smsSeen.has(o.witnessId)) {
      lsms.push(`${o.witnessName}: duplicate witness +0`);
      continue;
    }
    smsSeen.add(o.witnessId);
    if (smsSeen.size === 1) {
      psms += S.sms.first;
      lsms.push(`${o.witnessName}: first report +${S.sms.first}`);
    } else {
      lsms.push(`${o.witnessName}: additional report +0`);
    }
    if (o.gps && !gps) {
      gps = true;
      psms += S.sms.gps;
      lsms.push(`GPS pin +${S.sms.gps}`);
    }
    if (o.trusted && !trusted) {
      trusted = true;
      psms += S.sms.trusted;
      lsms.push(`Enrolled trusted reporter +${S.sms.trusted}`);
    }
    if (o.photoUnchecked) lsms.push("Unchecked photo +0");
  }
  psms = cap(psms, S.sms.cap, lsms);

  // ---- GOES ----
  const lgoes: string[] = [];
  const goes = obs.filter((o) => o.kind === "goes") as Extract<Obs, { kind: "goes" }>[];
  let pgoes = 0;
  if (goes.length) {
    const best = Math.max(...goes.map((g) => S.goes[g.category]));
    pgoes = best;
    lgoes.push(`Strongest category: +${best}`);
  }
  pgoes = cap(pgoes, S.goes.cap, lgoes);

  // ---- Camera ----
  const lcam: string[] = [];
  const cams = obs.filter((o) => o.kind === "camera") as Extract<Obs, { kind: "camera" }>[];
  const camPts = (c: (typeof cams)[number]) =>
    c.confidence < S.camera.zeroBelow
      ? 0
      : c.confidence < S.camera.highAtLeast
        ? S.camera.medium
        : c.growing
          ? S.camera.highGrowing
          : S.camera.high;
  let pcam = 0;
  if (cams.length) {
    const best = cams.reduce((a, b) => (camPts(b) > camPts(a) ? b : a));
    pcam = camPts(best);
    if (pcam > 0) {
      lcam.push(
        `${best.cameraId} best frame (conf ${best.confidence.toFixed(2)}${best.growing ? ", growing plume" : ""}): +${pcam} — replaces earlier frames`,
      );
    }
    const second = cams.some((c) => c.cameraId !== best.cameraId && c.crossingBearing && camPts(c) > 0);
    if (second) {
      pcam += S.camera.secondBearing;
      lcam.push(`Second camera crossing bearing +${S.camera.secondBearing}`);
    }
    // A clear view subtracts only while no positive detection exists; later smoke stands on its own evidence.
    const clears = cams.filter((c) => c.clearView).length;
    if (clears && pcam === 0) {
      pcam += S.camera.clearView * clears;
      lcam.push(`Clear view, nothing seen: ${S.camera.clearView} (floored at zero)`);
    }
  }
  pcam = cap(pcam, S.camera.cap, lcam);

  // ---- Outage feed (locked until matching smoke or heat evidence) ----
  const lout: string[] = [];
  const outages = obs.filter((o) => o.kind === "utility") as Extract<Obs, { kind: "utility" }>[];
  let pout = 0;
  if (outages.length) {
    if (!gates.outageUnlocked) {
      lout.push("Locked at 0 — no matching smoke or heat evidence yet");
    } else {
      pout += S.outage.match;
      lout.push(`Smoke/heat match within one mile and 20 minutes: +${S.outage.match}`);
      const wind = Math.max(...outages.map((o) => o.windMph ?? 0));
      if (wind >= S.outage.windMinMph) {
        pout += S.outage.wind;
        lout.push(`Wind ${wind} mph ≥ ${S.outage.windMinMph} mph: +${S.outage.wind}`);
      }
      if (outages.some((o) => o.cause)) {
        pout += S.outage.cause;
        lout.push(`Cause reported (${outages.find((o) => o.cause)?.cause}): +${S.outage.cause}`);
      }
    }
  }
  pout = cap(pout, S.outage.cap, lout);

  // ---- Cross-class agreement (awarded by scripted agreement events) ----
  const classes: string[] = [];
  if (p911 + psms > 0) classes.push("Human");
  if (pgoes > 0) classes.push("Orbital");
  if (pcam > 0) classes.push("Ground optical");
  const lcross = gates.crossBonus
    ? [`${classes.length} agreeing classes (${classes.join(", ")}): +${gates.crossBonus}`]
    : [];

  const pdrone = gates.droneRuleEnabled && obs.some(o=>o.kind==='drone'&&o.visibleFlames&&o.thermalHotspot&&o.operatorAccepted) ? Math.min(DRONE_POLICY.evidenceCap,DRONE_POLICY.proposedEvidencePoints) : 0;
  const raw = p911 + psms + pgoes + pcam + pout + gates.crossBonus + pdrone;
  return {
    drone: { points:pdrone, lines:pdrone?['Operator-reviewed visible flames + corresponding thermal hotspot: +40 once. Proposed simulation rule—requires validation. Ground optical, no new class bonus.']:[] },
    e911: { points: p911, lines: l911 },
    sms: { points: psms, lines: lsms },
    goes: { points: pgoes, lines: lgoes },
    camera: { points: pcam, lines: lcam },
    outage: { points: pout, lines: lout, locked: outages.length > 0 && !gates.outageUnlocked },
    cross: { points: gates.crossBonus, lines: lcross, classes },
    total: Math.min(S.totalCap, raw),
    nonHumanPoints: pgoes + pcam,
  };
}

export type EvidenceState = "Log" | "Watch" | "Verify" | "Confirmed";

export function evidenceStatus(b: Breakdown, weather: WeatherLevel, thermalVerified: boolean) {
  const verifyAt = THRESHOLDS.verify[weather];
  const state: EvidenceState =
    b.total >= THRESHOLDS.confirmed ? "Confirmed" : b.total < THRESHOLDS.log ? "Log" : b.total < verifyAt ? "Watch" : "Verify";
  const confirmed = b.total >= THRESHOLDS.confirmed;
  const firePresence: "verified" | "high-evidence" | "unverified" = thermalVerified
    ? "verified"
    : confirmed && b.nonHumanPoints > 0
      ? "high-evidence"
      : "unverified";
  return { state, verifyAt, confirmed, firePresence };
}
