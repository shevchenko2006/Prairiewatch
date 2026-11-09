import { useMemo } from 'react';
import type { SimState } from '@/sim/engine';
import { visibleFireFootprint, measurePolygon, formatArea, formatDistance } from '@/sim/measurements';
import { FIRE_PRESENTATION } from '@/sim/config';

export function FootprintReadout({ s }: { s: SimState }) {
  const measurement = useMemo(() => {
    const polygon = visibleFireFootprint(s);
    return polygon ? measurePolygon(polygon) : null;
  }, [s.scenario, s.incidentAt, s.t]);
  return <section className="border-t border-border pt-4" aria-label="Fire footprint measurement">
    {measurement ? <>
      <p className="text-sm font-medium">Simulated fire footprint · <span data-testid="footprint-acres">{formatArea(measurement.acres)}</span> acres</p>
      <p className="mt-1 text-xs text-muted-foreground"><span data-testid="footprint-hectares">{formatArea(measurement.hectares)}</span> hectares · modeled affected area</p>
      {s.t >= FIRE_PRESENTATION.finalT && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">About ¾ of Wichita State’s 330-acre main campus.</p>}
      <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer text-primary">Footprint details</summary><div className="mt-3 space-y-2">
        <p>Approximate maximum width: {formatDistance(measurement.widthMeters)}</p>
        <p>Geographic model polygon · approximate UTM area and distance. Not inferred from camera or satellite imagery.</p>
        <p>Radar rings mark attention, not affected area. Any spread cone represents possible future spread, not current extent.</p>
        <p>Area alone does not determine danger: wind, spread direction, nearby people, access and infrastructure also matter.</p>
      </div></details>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Simulated, illustrative footprint—not a measured fire perimeter or a validated spread forecast. This chosen size is not proof of acres saved.</p>
    </> : <p className="text-sm text-muted-foreground">{s.scenario === 'B' ? 'No fire footprint identified' : 'Extent unknown'}</p>}
  </section>;
}