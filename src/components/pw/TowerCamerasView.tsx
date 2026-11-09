import { useId, useMemo, useState } from 'react';
import { ArrowLeft, Cctv, MapPin, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtClock, type SimState } from '@/sim/engine';
import { COUNTY, TOWNS } from '@/sim/geo';
import { LEGACY_TOWER_ID, NEARBY_COUNT, PLANNED_TOWER_COUNT, TOWER_NETWORK, incidentEstimate, lastObservation, observingTowerIds, onlineTowerCount, towerCoordinates, towerOnline, towersByDistance, viewNote, CAMERA_COVERAGE, coverageStats, type TowerCamera } from '@/sim/tower-network';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'nearby' | 'online' | 'offline';

/** Simulated tower preview states per scenario; never presented as a live connection. */
function towerStatus(s: SimState, t: TowerCamera): { state: 'monitoring' | 'faint' | 'growing' | 'corroborating' | 'clear' | 'offline' | 'unchecked'; text: string } {
  if (!towerOnline(t.id, s.scenario)) return { state: 'offline', text: 'Offline · simulated' };
  if (t.legacyId === 'TWR-A') {
    if (s.scenario === 'A') {
      if (s.fired.includes('cam2')) return { state: 'growing', text: 'Growing plume · confidence 0.86 (simulated)' };
      if (s.fired.includes('cam1')) return { state: 'faint', text: 'Faint plume · confidence 0.62 (simulated)' };
      return { state: 'monitoring', text: 'Monitoring · no detection yet' };
    }
    if (s.scenario === 'B') {
      if (s.clearViewAt != null) return { state: 'clear', text: 'Clear view · no smoke observed' };
      return { state: 'monitoring', text: 'Awaiting targeted check' };
    }
    if (s.fired.includes('c-cam2')) return { state: 'growing', text: 'Growing plume above ridge · source obscured (simulated)' };
    if (s.fired.includes('c-cam1')) return { state: 'faint', text: 'Faint plume above ridge · source obscured (simulated)' };
    return { state: 'monitoring', text: 'Monitoring · no detection yet' };
  }
  if (t.legacyId === 'TWR-B') {
    if (s.scenario === 'A' && s.fired.includes('cam-b')) return { state: 'corroborating', text: 'Corroborating view · bearings cross (simulated)' };
    return { state: 'monitoring', text: s.scenario === 'A' ? 'Monitoring · no detection yet' : 'Not checked in this scenario' };
  }
  return { state: 'unchecked', text: 'Monitoring · no detection in this scenario (simulated)' };
}

function TowerPreview({ s, tower, large }: { s: SimState; tower: TowerCamera; large?: boolean }) {
  const status = towerStatus(s, tower);
  const smoke = status.state === 'faint' || status.state === 'growing' || status.state === 'corroborating';
  const obscured = s.scenario === 'C' && tower.legacyId === 'TWR-A' && smoke;
  return (
    <div className={cn('relative overflow-hidden border border-border bg-card', large ? 'aspect-[3/2]' : 'aspect-[3/2]')}>
      <svg viewBox="0 0 400 267" className="h-full w-full" aria-label={`${tower.id} simulated preview`} data-testid={`tower-preview-${tower.id}`}>
        <rect width="400" height="267" fill="var(--secondary)" />
        <path d="M0 150Q70 105 150 135T400 125V267H0Z" fill="var(--terrain)" />
        <path d="M0 205Q100 165 220 190T400 180V267H0Z" fill="var(--card)" />
        <path d="M0 220L400 208" stroke="var(--gold)" strokeWidth="2" />
        {smoke && <g>
          <path d={status.state === 'growing' ? 'M230 195C180 130 195 110 165 35Q230 50 250 195Z' : 'M230 195Q210 150 220 105Q248 140 240 195Z'} fill="var(--muted-foreground)" opacity={status.state === 'faint' ? .55 : .9} />
          <rect x="150" y="25" width="125" height="185" stroke="var(--observation)" fill="none" strokeDasharray="5 5" />
        </g>}
        {obscured && <path d="M120 267Q200 150 290 267Z" fill="var(--terrain)" />}
        {status.state === 'offline' && <text x="200" y="120" textAnchor="middle" fontSize="13" fill="var(--warning)">Offline · no feed (simulated)</text>}
        {status.state === 'clear' && <text x="200" y="120" textAnchor="middle" fontSize="13" fill="var(--foreground)">Clear view · no smoke</text>}
        {(status.state === 'monitoring' || status.state === 'unchecked') && <text x="200" y="120" textAnchor="middle" fontSize="13" fill="var(--muted-foreground)">{status.text}</text>}
      </svg>
      <span className="absolute left-2 top-2 bg-background/90 px-1.5 py-0.5 font-mono text-[9px] text-warning">SIMULATED · NOT LIVE</span>
      <span className="absolute bottom-2 left-2 max-w-[80%] bg-background/90 px-1.5 py-0.5 text-[10px] text-observation">{status.text}</span>
    </div>
  );
}

/** Flat county map with the 15 proposed tower locations; decorative, flat projection. */
function NetworkMap({ s, selected, onSelect, miles, onlineOnly }: { s: SimState; selected: string | null; onSelect: (id: string) => void; miles:number; onlineOnly:boolean }) {
  const estimate = incidentEstimate(s);
  const sorted = useMemo(() => towersByDistance(estimate.pos), [estimate.pos[0], estimate.pos[1]]);
  const nearby = new Set(sorted.slice(0, NEARBY_COUNT).map(x => x.tower.id));
  const observing = observingTowerIds(s);
  const dist = new Map(sorted.map(x => [x.tower.id, x.km]));
  const clip=useId().replace(/:/g,'');
  const stats=useMemo(()=>coverageStats(miles,onlineOnly?s.scenario:undefined),[miles,onlineOnly,s.scenario]);
  const X=(p:number)=>p+4, Y=(p:number)=>68.1-p;
  const boundary=COUNTY.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
  return (
    <svg viewBox="0 0 59 72.1" className="h-full w-full" role="img" aria-label="Map of 15 proposed tower camera locations and overlapping geometric coverage (simulated)">
      <defs><clipPath id={clip}><polygon points={boundary}/></clipPath></defs>
      <polygon points={boundary} fill="var(--card)" stroke="var(--border)" strokeWidth=".3" />
      <g clipPath={`url(#${clip})`}>
        {TOWER_NETWORK.filter(t=>!onlineOnly||towerOnline(t.id,s.scenario)).map(t=><circle key={t.id} cx={X(t.pos[0])} cy={Y(t.pos[1])} r={miles*CAMERA_COVERAGE.kmPerMile} fill="var(--observation)" fillOpacity=".025" stroke="var(--observation)" strokeOpacity=".32" strokeWidth=".15"/>)}
        {stats.gaps.map((p,i)=><rect key={i} x={X(p[0])-.25} y={Y(p[1])-.25} width=".5" height=".5" fill="var(--warning)" fillOpacity=".3"/>)}
      </g>
      {TOWNS.map(t => <text key={t.id} x={X(t.pos[0])} y={Y(t.pos[1])} fontSize="1.3" fill="var(--muted-foreground)" textAnchor="middle">{t.name}</text>)}
      <g>
        <circle cx={X(estimate.pos[0])} cy={Y(estimate.pos[1])} r="1.6" fill="none" stroke="var(--fire)" strokeWidth=".5" />
        <circle cx={X(estimate.pos[0])} cy={Y(estimate.pos[1])} r=".7" fill="var(--fire)" />
        <text x={X(estimate.pos[0])} y={Y(estimate.pos[1]) - 2.4} fontSize="1.1" fill="var(--fire)" textAnchor="middle">{estimate.approximate ? 'Approx. incident' : 'Incident'}</text>
      </g>
      {sorted.map(({ tower }) => {
        const x = X(tower.pos[0]), y = Y(tower.pos[1]);
        const online = towerOnline(tower.id, s.scenario);
        const near = nearby.has(tower.id);
        return (
          <g key={tower.id} role="button" tabIndex={0} aria-label={`${tower.id} ${tower.name}, ${online ? 'online' : 'offline'}, ${dist.get(tower.id)?.toFixed(1)} km from incident`} className="cursor-pointer" onClick={() => onSelect(tower.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tower.id); } }}>
            {near && <circle cx={x} cy={y} r="2.6" fill="none" stroke="var(--observation)" strokeWidth=".4" strokeDasharray="1 .8" />}
            <rect x={x - 1.3} y={y - 1.3} width="2.6" height="2.6" transform={`rotate(45 ${x} ${y})`} fill={selected === tower.id ? 'var(--observation)' : online ? 'var(--card)' : 'var(--background)'} stroke={online ? 'var(--observation)' : 'var(--muted-foreground)'} strokeWidth=".45" />
            {!online && <line x1={x - 1.6} y1={y + 1.6} x2={x + 1.6} y2={y - 1.6} stroke="var(--warning)" strokeWidth=".5" />}
            {observing.has(tower.id) && <circle cx={x} cy={y} r=".5" fill="var(--observation)" />}
            {near && <text x={x} y={y - 2.5} fontSize="1.1" fill="var(--observation)" textAnchor="middle">{tower.id} · {dist.get(tower.id)?.toFixed(1)} km{estimate.approximate ? '*' : ''}</text>}
            {!near && <text x={x} y={y + 3.4} fontSize="1.1" fill="var(--muted-foreground)" textAnchor="middle">{tower.id}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function TowerCamerasView({ s, back }: { s: SimState; back: () => void }) {
  const [miles,setMiles]=useState(10);
  const [onlineOnly,setOnlineOnly]=useState(false);
  const coverage=useMemo(()=>coverageStats(miles,onlineOnly?s.scenario:undefined),[miles,onlineOnly,s.scenario]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(LEGACY_TOWER_ID['TWR-A']);
  const estimate = incidentEstimate(s);
  const sorted = useMemo(() => towersByDistance(estimate.pos), [estimate.pos[0], estimate.pos[1]]);
  const nearbyIds = new Set(sorted.slice(0, NEARBY_COUNT).map(x => x.tower.id));
  const observing = observingTowerIds(s);
  const online = onlineTowerCount(s.scenario);
  const dist = new Map(sorted.map(x => [x.tower.id, x.km]));
  const shown = sorted.filter(({ tower }) =>
    filter === 'all' ? true : filter === 'nearby' ? nearbyIds.has(tower.id) : filter === 'online' ? towerOnline(tower.id, s.scenario) : !towerOnline(tower.id, s.scenario));
  const selected = selectedId ? sorted.find(x => x.tower.id === selectedId) ?? null : null;
  return (
    <section aria-label="Tower cameras" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
        <Button variant="ghost" onClick={back}><ArrowLeft />Back to incident</Button>
        <span className="text-xs text-warning">PROPOSED DEPLOYMENT · SIMULATED LOCATIONS AND FEEDS — NOT AN INSTALLED NETWORK</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 p-4 md:p-5">
          <div>
            <h2 className="text-lg font-medium">Planned tower-camera network</h2>
            <p className="mt-1 text-xs text-muted-foreground">{PLANNED_TOWER_COUNT} planned cameras · {online} online in this scenario · {PLANNED_TOWER_COUNT - online} offline. Offline cameras remain visible.</p>
          </div>
          <div className="space-y-3 border-y border-border py-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-observation">360° rotation · {miles}-mile radius</span><span className="font-mono text-xs">{coverage.coveredPercent.toFixed(1)}% reach · {coverage.overlapPercent.toFixed(1)}% overlap</span></div>
            <label className="flex items-center gap-3 text-xs" htmlFor="coverage-radius">Range<input id="coverage-radius" aria-label="Coverage radius in miles" type="range" min={6} max={10} step={1} value={miles} onChange={e=>setMiles(Number(e.target.value))} className="min-w-0 flex-1 accent-observation"/>{miles} mi</label>
            <div className="flex gap-1"><Button size="sm" variant={!onlineOnly?'secondary':'ghost'} aria-pressed={!onlineOnly} onClick={()=>setOnlineOnly(false)}>Planned 15</Button><Button size="sm" variant={onlineOnly?'secondary':'ghost'} aria-pressed={onlineOnly} onClick={()=>setOnlineOnly(true)}>Online reach</Button></div>
            <p className="text-[11px] text-muted-foreground">Geometric sample estimate on a 0.5 km grid. Lavender rings overlap; amber shows reach gaps. Rotation scans sequentially, not simultaneous 360° detection. Terrain, tower heights, optics and weather are unvalidated.</p>
          </div>
          <div className="aspect-[59/72.1] max-h-[520px] rounded border border-border bg-background p-2"><NetworkMap s={s} selected={selectedId} onSelect={setSelectedId} miles={miles} onlineOnly={onlineOnly} /></div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {estimate.label}{estimate.approximate ? ' is uncertain — distances marked * are approximate.' : '.'} Distance alone never implies visibility; coverage and terrain limits are listed per camera.
          </p>
          {s.scenario === 'C' && (
            <div className="space-y-2 border-l-2 border-observation pl-3 text-xs leading-relaxed">
              <p className="font-semibold text-observation">Why the other cameras cannot verify this plume</p>
              <p className="text-muted-foreground">TW-01 (Camera A) sees the plume, but the fictional ridge obscures its source. TW-02 (Camera B) is offline. The remaining planned towers may overlap in geometric range but lack an unobstructed ground-source viewing angle in this simulated setup, so none provides a usable view of the source.</p>
            </div>
          )}
          {selected && (
            <section aria-label={`${selected.tower.id} viewer`} className="space-y-3 rounded border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{selected.tower.id} · {selected.tower.name}</h3>
                <span className={cn('font-mono text-xs', towerOnline(selected.tower.id, s.scenario) ? 'text-primary' : 'text-warning')}>{towerOnline(selected.tower.id, s.scenario) ? 'ONLINE' : 'OFFLINE'} · SIMULATED</span>
              </div>
              <TowerPreview s={s} tower={selected.tower} large />
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-muted-foreground">Simulated location</dt><dd className="mt-1 font-mono">{(() => { const c = towerCoordinates(selected.tower.id); return `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`; })()}</dd></div>
                <div><dt className="text-muted-foreground">Distance from incident</dt><dd className="mt-1 font-mono">{dist.get(selected.tower.id)?.toFixed(1)} km{estimate.approximate ? ' · approximate' : ''}</dd></div>
                <div><dt className="text-muted-foreground">Last observation</dt><dd className="mt-1 font-mono">{(() => { const t = lastObservation(s, selected.tower.id); return t == null ? 'None this scenario' : fmtClock(t); })()}</dd></div>
                <div><dt className="text-muted-foreground">Observing incident</dt><dd className="mt-1 font-mono">{observing.has(selected.tower.id) ? 'Yes · simulated' : 'No'}</dd></div>
              </dl>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{viewNote(s, selected.tower.id)}</p>
            </section>
          )}
        </div>
        <div className="min-w-0 border-t border-border p-4 md:p-5 lg:border-l lg:border-t-0">
          <div className="mb-3 flex flex-wrap items-center gap-1" role="group" aria-label="Camera filters">
            {([['all', `All ${PLANNED_TOWER_COUNT}`], ['nearby', 'Nearby'], ['online', 'Online'], ['offline', 'Offline']] as const).map(([id, label]) => (
              <Button key={id} size="sm" variant={filter === id ? 'secondary' : 'ghost'} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.map(({ tower, km }) => {
              const isOnline = towerOnline(tower.id, s.scenario);
              const last = lastObservation(s, tower.id);
              return (
                <Button variant="ghost" key={tower.id} type="button" onClick={() => setSelectedId(tower.id)} aria-label={`Open ${tower.id} ${tower.name} viewer`} className={cn('h-auto min-w-0 flex-col items-stretch whitespace-normal rounded border p-3 text-left transition-colors', selectedId === tower.id ? 'border-observation bg-card' : 'border-border bg-background hover:border-observation/50')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold"><Cctv className="size-3.5 text-observation" />{tower.id}</span>
                    <span className={cn('flex items-center gap-1 font-mono text-[10px]', isOnline ? 'text-primary' : 'text-warning')}>{!isOnline && <AlertTriangle className="size-3" />}{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{tower.name}</p>
                  <TowerPreview s={s} tower={tower} />
                  <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><MapPin className="size-3" />{km.toFixed(1)} km{estimate.approximate ? '*' : ''} · last obs {last == null ? '—' : fmtClock(last)}</p>
                  {observing.has(tower.id) && <p className="mt-1 text-[10px] text-observation">Actively observing the incident (simulated)</p>}
                  {nearbyIds.has(tower.id) && <p className="mt-1 text-[10px] text-observation">Nearest {NEARBY_COUNT} to incident</p>}
                </Button>
              );
            })}
          </div>
          {shown.length === 0 && <p className="text-xs text-muted-foreground">No cameras match this filter.</p>}
        </div>
      </div>
    </section>
  );
}
