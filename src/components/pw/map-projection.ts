import type { Pt } from "@/sim/scoring";

// Parallel oblique display projection only; no measured elevation is implied.
export const OBLIQUE = { a: .96, b: .08, c: -.20, d: .78 };
export function projectPoint(p: Pt, center: Pt, flat = false): Pt {
  if (flat) return p;
  const { a, b, c, d } = OBLIQUE;
  const x = p[0] - center[0], y = p[1] - center[1];
  return [center[0] + a*x + c*y, center[1] + b*x + d*y];
}
export function unprojectDelta(p: Pt, flat = false): Pt {
  if (flat) return p;
  const { a, b, c, d } = OBLIQUE;
  const det = a*d-b*c;
  return [(d*p[0]-c*p[1])/det, (-b*p[0]+a*p[1])/det];
}
export function projectionMatrix(center: Pt, flat = false): string {
  if (flat) return "matrix(1 0 0 1 0 0)";
  const { a,b,c,d } = OBLIQUE;
  return `matrix(${a} ${b} ${c} ${d} ${center[0]*(1-a)-c*center[1]} ${center[1]*(1-d)-b*center[0]})`;
}