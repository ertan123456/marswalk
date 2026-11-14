/**
 * BRIEFING MODE — the pre-EVA read-out.
 *
 * Objective, crew, a timeline built straight from the solved plan, and the
 * conditions summary for the chosen sol. Every number here is derived, not
 * typed in, so editing the suit model in PLAN mode rewrites this page.
 */

import { EVA_SOL, SOL_HOURS, SPE_EVENT, weatherAt } from '../../data/models/environment';
import { MISSION, getSciencePoints } from '../../data/real/science';
import { AOI, CENTER_LAT, CENTER_LON, formatLatLon } from '../../lib/geo';
import { formatDistance, formatDuration, formatMLST } from '../../lib/format';
import { LAYER_REGISTRY } from '../../data/config';
import { useMission } from '../../store/useMission';
import { Alert, Badge, KeyVal, Panel, Readout } from '../ui/primitives';
import { RadiationChart, WeatherChart } from '../plan/RouteCharts';

interface Phase {
  label: string;
  code: string;
  startH: number;
  endH: number;
  kind: 'traverse' | 'task' | 'ingress';
}

function Gantt() {
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  if (!plan) return null;

  const total = Math.max(0.1, plan.totalTimeH);
  const phases: Phase[] = [];
  let prevDepart = 0;
  for (const s of plan.stations) {
    if (s.kind === 'habitat' && s.id === 'habitat') continue;
    const isReturn = s.id === 'habitat-return';
    phases.push({
      label: isReturn ? 'Return traverse — habitat ingress' : 'Traverse to ' + s.label,
      code: s.code,
      startH: prevDepart,
      endH: s.arrivalTimeH,
      kind: isReturn ? 'ingress' : 'traverse',
    });
    if (!isReturn) {
      phases.push({
        label: s.label,
        code: s.code,
        startH: s.arrivalTimeH,
        endH: s.departTimeH,
        kind: 'task',
      });
    }
    prevDepart = s.departTimeH;
  }

  const speStart = SPE_EVENT.startHour - suit.evaStartHour;
  const speEnd = SPE_EVENT.endHour - suit.evaStartHour;
  const speVisible = speEnd > 0 && speStart < total;

  const colors = {
    traverse: 'bg-probe-500/70 border-probe-400',
    task: 'bg-mars-500/65 border-mars-400',
    ingress: 'bg-nominal/55 border-nominal',
  } as const;

  return (
    <div>
      <div className="relative">
        <div className="space-y-[3px]">
          {phases.map((p, i) => {
            const left = (p.startH / total) * 100;
            const width = Math.max(0.6, ((p.endH - p.startH) / total) * 100);
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="w-[150px] shrink-0 text-right">
                  <div className="text-[10px] text-ink-dim leading-tight truncate">{p.label}</div>
                </div>
                <div className="relative flex-1 h-5 bg-deck-800/60 border border-line/40 rounded-[1px] overflow-hidden">
                  {speVisible && (
                    <div
                      className="absolute inset-y-0 bg-danger/14 border-x border-danger/40"
                      style={{
                        left: (Math.max(0, speStart) / total) * 100 + '%',
                        width: ((Math.min(total, speEnd) - Math.max(0, speStart)) / total) * 100 + '%',
                      }}
                    />
                  )}
                  <div
                    className={'absolute inset-y-[3px] border rounded-[1px] ' + colors[p.kind]}
                    style={{ left: left + '%', width: width + '%' }}
                  />
                </div>
                <div className="w-[108px] shrink-0 num text-[10px] text-ink-faint">
                  {formatMLST(suit.evaStartHour + p.startH)}
                  {'–'}
                  {formatMLST(suit.evaStartHour + p.endH)}
                </div>
                <div className="w-[48px] shrink-0 num text-[10px] text-ink text-right">
                  {Math.round((p.endH - p.startH) * 60)}m
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {[
          { label: 'Traverse', cls: 'bg-probe-500/70 border-probe-400' },
          { label: 'On station', cls: 'bg-mars-500/65 border-mars-400' },
          { label: 'Ingress', cls: 'bg-nominal/55 border-nominal' },
          { label: 'SPE window', cls: 'bg-danger/20 border-danger/60' },
        ].map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 text-[10px] text-ink-dim">
            <span className={'h-2.5 w-4 border rounded-[1px] ' + l.cls} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Conditions() {
  const suit = useMission((s) => s.suit);
  const plan = useMission((s) => s.plan);
  const dur = plan?.totalTimeH ?? 0;
  const rows = [
    { label: 'Egress', hour: suit.evaStartHour },
    { label: 'Mid-EVA', hour: suit.evaStartHour + dur / 2 },
    { label: 'Ingress', hour: suit.evaStartHour + dur },
  ];

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left">
              {['', 'MLST', 'Air', 'Ground', 'Wind', 'Dir', 'Pressure', 'τ'].map((h) => (
                <th key={h} className="label font-normal pb-1.5 pr-3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r) => {
              const w = weatherAt(r.hour);
              return (
                <tr key={r.label} className="border-t border-line/40">
                  <td className="py-1.5 pr-3 text-ink-dim whitespace-nowrap">{r.label}</td>
                  <td className="py-1.5 pr-3 text-ink">{formatMLST(r.hour)}</td>
                  <td className="py-1.5 pr-3 text-ink">{w.airTempC}&deg;C</td>
                  <td className="py-1.5 pr-3 text-ink">{w.groundTempC}&deg;C</td>
                  <td className="py-1.5 pr-3 text-ink">{w.windMs} m/s</td>
                  <td className="py-1.5 pr-3 text-ink-dim">{w.windDirDeg}&deg;</td>
                  <td className="py-1.5 pr-3 text-ink">{w.pressurePa} Pa</td>
                  <td className={'py-1.5 pr-3 ' + (w.tau > 0.55 ? 'text-caution' : 'text-ink')}>{w.tau}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-ink-faint leading-relaxed mt-2">
        One sol is {SOL_HOURS.toFixed(2)} h. Ground temperature drives suit thermal margin; column opacity {'τ'}{' '}
        drives visual range and solar array output.
      </p>
    </div>
  );
}

export function Briefing() {
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const order = useMission((s) => s.waypointOrder);
  const mockCount = LAYER_REGISTRY.filter((a) => (a.provenance !== 'REAL')).length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1180px] p-3 space-y-2">
        <Panel title="Mission briefing" right={<Badge tone="accent">{MISSION.designator}</Badge>}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-[720px]">
              <h1 className="text-[17px] text-ink leading-snug">{MISSION.campaign}</h1>
              <p className="text-[12px] leading-relaxed text-ink-dim mt-2">{MISSION.objective}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 shrink-0">
              <Readout label="sol" value={EVA_SOL} size="sm" />
              <Readout label="egress" value={formatMLST(suit.evaStartHour)} size="sm" />
              <Readout
                label="status"
                value={plan?.feasible ? 'GO' : 'NO-GO'}
                tone={plan?.feasible ? 'nominal' : 'danger'}
                size="sm"
              />
              <Readout label="stations" value={order.length} size="sm" />
            </div>
          </div>
        </Panel>

        {plan && !plan.feasible && (
          <Alert tone="danger" title="not cleared for execution">
            {plan.violations.join(' — ')}
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-2">
          <Panel title="EVA timeline">
            <Gantt />
            {plan && (
              <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-line/60">
                <Readout label="total" value={formatDuration(plan.totalTimeH)} unit="h" size="sm" />
                <Readout label="traverse" value={formatDistance(plan.totalDistanceM)} size="sm" />
                <Readout
                  label="on station"
                  value={Math.round(plan.stations.reduce((a, s) => a + s.taskMinutes, 0)) + ' min'}
                  size="sm"
                />
                <Readout
                  label="consumables left"
                  value={Math.round(plan.consumablesRemainingFraction * 100) + '%'}
                  size="sm"
                  tone={plan.consumablesRemainingFraction < suit.reserveFraction ? 'danger' : 'nominal'}
                />
              </div>
            )}
          </Panel>

          <Panel title="Crew">
            <div className="space-y-2.5">
              {MISSION.crew.map((c) => (
                <div key={c.callsign} className="border border-line/60 rounded-[2px] p-2.5 bg-deck-800/40">
                  <div className="flex items-baseline gap-2">
                    <span className="num text-[13px] text-mars-300">{c.callsign}</span>
                    <span className="text-[12px] text-ink">{c.role}</span>
                  </div>
                  <div className="num text-[10px] text-ink-faint mt-0.5">{c.suit}</div>
                  <p className="text-[11px] text-ink-dim leading-relaxed mt-1.5">{c.notes}</p>
                </div>
              ))}
              <div
                className={
                  'border rounded-[2px] p-2.5 ' +
                  (suit.mobility === 'rover' ? 'border-probe-500/50 bg-probe-500/8' : 'border-line/40 bg-deck-900/40 opacity-60')
                }
              >
                <div className="flex items-baseline gap-2">
                  <span className="num text-[13px] text-probe-400">{MISSION.roverSupport.name}</span>
                  <span className="text-[12px] text-ink">{MISSION.roverSupport.kind}</span>
                  <Badge tone={suit.mobility === 'rover' ? 'nominal' : 'default'}>
                    {suit.mobility === 'rover' ? 'committed' : 'not assigned'}
                  </Badge>
                </div>
                <p className="text-[11px] text-ink-dim leading-relaxed mt-1.5">{MISSION.roverSupport.detail}</p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <Panel title="Conditions — surface weather">
            <Conditions />
            <div className="mt-3">
              <WeatherChart />
            </div>
          </Panel>
          <Panel title="Conditions — radiation">
            <RadiationChart plan={plan} />
            <div className="mt-3 space-y-1.5">
              <Alert tone="danger" title={SPE_EVENT.label}>
                {SPE_EVENT.detail}
              </Alert>
              {plan && (
                <div>
                  <KeyVal k="EVA dose (integrated)" v={plan.doseMgy.toFixed(3) + ' mGy'} />
                  <KeyVal
                    k="SPE overlap"
                    v={plan.spe.overlaps ? 'YES — re-time or shelter' : 'none in window'}
                    tone={plan.spe.overlaps ? 'danger' : 'nominal'}
                  />
                  <KeyVal k="Latest clean egress" v={formatMLST(plan.suggestedShelterHour)} />
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Science target package">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {getSciencePoints().map((p) => {
              const inPlan = order.includes(p.id);
              const station = plan?.stations.find((s) => s.id === p.id);
              return (
                <div
                  key={p.id}
                  className={
                    'border rounded-[2px] p-2.5 ' +
                    (inPlan ? 'border-line bg-deck-800/40' : 'border-line/40 bg-deck-900/40 opacity-55')
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="num text-[11px] text-mars-300">{p.code}</span>
                    <span className="text-[12px] text-ink leading-tight">{p.title}</span>
                    {station && !station.walkBackOk && <Badge tone="danger">walk-back</Badge>}
                  </div>
                  <div className="num text-[10px] text-ink-faint mt-1">{formatLatLon(p.position)}</div>
                  <div className="num text-[10px] text-probe-400 mt-0.5">{p.targetMineral}</div>
                  <p className="text-[11px] text-ink-dim leading-relaxed mt-1.5">{p.whyItMatters}</p>
                  <div className="num text-[10px] text-ink-faint mt-1.5">
                    {p.taskMinutes} min on station &middot; {p.groundViewSlot.pending}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Data provenance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            {LAYER_REGISTRY.map((a) => (
              <div key={a.id} className="flex items-baseline justify-between gap-3 py-1 border-b border-line/40">
                <span className="text-[11px] text-ink-dim truncate">
                  {a.name} <span className="text-ink-faint">&middot; {a.mission}</span>
                </span>
                <Badge tone={(a.provenance !== 'REAL') ? 'mock' : 'nominal'}>{(a.provenance !== 'REAL') ? 'mock' : 'live'}</Badge>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-dim leading-relaxed mt-3">
            {mockCount} of {LAYER_REGISTRY.length} layers are synthetic stand-ins generated from one seeded terrain
            model, so they are mutually consistent even though none of them is real yet. The area of interest is{' '}
            {(AOI.sizeXM / 1000).toFixed(2)} km &times; {(AOI.sizeYM / 1000).toFixed(2)} km centred on{' '}
            {CENTER_LAT.toFixed(3)}&deg;, {CENTER_LON.toFixed(3)}&deg;E. Each adapter documents the real product
            it stands in for, and DATA_TODO.md lists what to plug in.
          </p>
        </Panel>
      </div>
    </div>
  );
}
