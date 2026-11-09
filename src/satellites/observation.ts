/** Isolated illustrative presentation duration; never advances the scenario clock. */
export const SCAN_SECONDS = 6;
export const scanProgress = (elapsed: number) => Math.max(0, Math.min(1, elapsed / SCAN_SECONDS));
export function footprint(progress: number): [number, number][] {
  const radius = .4 + 2.4 * Math.sin(Math.PI * Math.max(0, Math.min(1, progress)));
  return Array.from({ length: 65 }, (_, i) => {
    const angle = i / 64 * Math.PI * 2;
    return [37.9 + Math.sin(angle) * radius, -96.25 + Math.cos(angle) * radius / Math.cos(37.9 * Math.PI / 180)];
  });
}