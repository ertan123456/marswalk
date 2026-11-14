import { compassLabel } from '../../lib/geo';
import { formatDistance, formatDuration, formatMinutes, formatMLST } from '../../lib/format';
import { SCIENCE_POINTS } from '../../data/mock/science';
import { SPE_EVENT } from '../../data/mock/environment';
import { useMission } from '../../store/useMission';
import { Alert, Badge, KeyVal, Panel, Readout } from '../ui/primitives';
import { ElevationProfileChart, WalkBackChart } from './RouteCharts';
import { SuitSettings } from './SuitSettings';

function GoNoGo() {
  const plan = useMission((s) => s.plan);
  if (!plan) return null;
  const ok = plan.feasible;
  return (
    <div
      className={
        'flex items-center gap-3 px-3 py-2.5 border rounded-sm ' +
        (ok ? 'border-nominal/50 bg-nominal/8' : 'border-danger/50 bg-danger/8')
      }
    >
      <span
        className={
          'relative inline-flex h-2.5 w-2.5 rounded-full ' +
          (ok ? 'bg-nominal text-nominal' : 'bg-danger text-danger blink') +
          ' pulse-ring'
        }
      />
      <div className="min-w-0">
        <div className={'font-mono text-sm tracking-[0.2em] ' + (ok ? 'text-nominal' : 'text-danger')}>
          {ok ? 'GO' : 'NO-GO'}
        </div>
        <div className="text-[10px] text-ink-dim leading-tight">
          {ok
            ? 'All flight rules satisfied for the planned window.'
            : plan.violations.length + ' flight-rule violation' + (plan.violations.length === 1 ? '' : 's')}
        </div>
      </div>
    </div>
  );
}

function Totals() {
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  if (!plan) return null;

  const remainingH = suit.evaBudgetH - plan.totalConsumablesH;
  const remainingPct = Math.round(plan.consumablesRemainingFraction * 100);
  const reservePct = Math.round(suit.reserveFraction * 100);
  const consTone =
    remainingH < 0 ? 'danger' : remainingPct < reservePct ? 'danger' : remainingPct < reservePct + 8 ? 'caution' : 'nominal';
  const doseTone = plan.doseMgy > 1.5 ? 'danger' : plan.doseMgy > 0.4 ? 'caution' : 'nominal';

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      <Readout label="traverse" value={formatDistance(plan.totalDistanceM)} />
      <Readout label="EVA duration" value={formatDuration(plan.totalTimeH)} unit="h" />
      <Readout
        label="consumables left"
        value={remainingPct + '%'}
        tone={consTone}
        hint={'Budget ' + suit.evaBudgetH + ' h at nominal workload; reserve ' + reservePct + '%'}
      />
      <Readout label="EVA dose" value={plan.doseMgy.toFixed(2)} unit="mGy" tone={doseTone} />
      <Readout label="airlock out" value={formatMLST(suit.evaStartHour)} size="sm" />
      <Readout label="airlock in" value={formatMLST(suit.evaStartHour + plan.totalTimeH)} size="sm" />
    </div>
  );
}

function StationList() {
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const order = useMission((s) => s.waypointOrder);
  const toggleWaypoint = useMission((s) => s.toggleWaypoint);
  const moveWaypoint = useMission((s) => s.moveWaypoint);
  const selectWaypoint = useMission((s) => s.selectWaypoint);
  const selected = useMission((s) => s.selectedWaypointId);

  return (
    <div className="space-y-1.5">
      {SCIENCE_POINTS.map((p) => {
        const inPlan = order.includes(p.id);
        const station = plan?.stations.find((s) => s.id === p.id);
        const idx = order.indexOf(p.id);
        const bad = station ? !station.walkBackOk : false;
        const isSel = selected === p.id;

        return (
          <div
            key={p.id}
            className={
              'border rounded-[2px] px-2.5 py-2 transition-colors ' +
              (bad
                ? 'border-danger/50 bg-danger/8'
                : isSel
                  ? 'border-mars-400/70 bg-mars-500/10'
                  : inPlan
                    ? 'border-line bg-deck-800/50'
                    : 'border-line/40 bg-deck-900/40')
            }
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => toggleWaypoint(p.id)}
                title={inPlan ? 'Drop from the EVA' : 'Add to the EVA'}
                className={
                  'num text-[10px] mt-[1px] h-[18px] w-[18px] shrink-0 rounded-[2px] border cursor-pointer ' +
                  (inPlan
                    ? 'border-mars-400 bg-mars-500/25 text-mars-300'
                    : 'border-line text-ink-faint hover:border-ink-faint')
                }
              >
                {inPlan ? idx + 1 : '+'}
              </button>
              <button
                type="button"
                onClick={() => {
                  selectWaypoint(isSel ? null : p.id);
                  useMission.getState().probePoint(p.position);
                }}
                className="flex-1 text-left min-w-0 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="num text-[10px] text-mars-300">{p.code}</span>
                  <span className={'text-[12px] leading-tight ' + (inPlan ? 'text-ink' : 'text-ink-dim')}>
                    {p.title}
                  </span>
                  {bad && <Badge tone="danger">walk-back</Badge>}
                </div>
                <div className="text-[10px] text-ink-faint leading-tight mt-0.5 truncate">{p.targetMineral}</div>
              </button>
              {inPlan && (
                <div className="flex flex-col gap-[2px] shrink-0">
                  <button
                    type="button"
                    onClick={() => moveWaypoint(p.id, -1)}
                    className="text-ink-faint hover:text-ink text-[9px] leading-none px-1 cursor-pointer"
                    title="Earlier in the traverse"
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWaypoint(p.id, 1)}
                    className="text-ink-faint hover:text-ink text-[9px] leading-none px-1 cursor-pointer"
                    title="Later in the traverse"
                  >
                    &#9660;
                  </button>
                </div>
              )}
            </div>

            {station && (
              <div className="mt-1.5 pt-1.5 border-t border-line/40">
                <KeyVal
                  k="arrive"
                  v={formatMLST(suit.evaStartHour + station.arrivalTimeH) + ' (T+' + formatDuration(station.arrivalTimeH) + ')'}
                />
                <KeyVal
                  k="leg"
                  v={formatDistance(station.legDistanceM) + ' · ' + compassLabel(station.bearingFromPrev) + ' ' + Math.round(station.bearingFromPrev) + '°'}
                />
                <KeyVal k="on station" v={Math.round(station.taskMinutes) + ' min'} />
                <KeyVal
                  k="consumables at depart"
                  v={Math.round(((suit.evaBudgetH - station.departConsumablesH) / suit.evaBudgetH) * 100) + '%'}
                  tone={
                    (suit.evaBudgetH - station.departConsumablesH) / suit.evaBudgetH < suit.reserveFraction
                      ? 'danger'
                      : undefined
                  }
                />
                <KeyVal
                  k="walk-back margin"
                  v={formatMinutes(station.walkBackMarginH)}
                  tone={station.walkBackOk ? 'nominal' : 'danger'}
                />
                <KeyVal k="return to haven" v={formatDuration(station.returnTimeH) + ' h'} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SelectedTarget() {
  const selected = useMission((s) => s.selectedWaypointId);
  const p = SCIENCE_POINTS.find((x) => x.id === selected);
  if (!p) return null;
  return (
    <Panel title={'Target brief · ' + p.code}>
      <h3 className="text-sm text-ink leading-tight">{p.title}</h3>
      <div className="num text-[10px] text-mars-300 mt-0.5">{p.targetMineral}</div>
      <p className="text-[11px] leading-relaxed text-ink-dim mt-2">{p.whyItMatters}</p>
      <div className="mt-2.5 border border-line/60 rounded-[2px] bg-deck-800/40 p-2">
        <div className="label">ground-level view</div>
        <div className="mt-1.5 aspect-[16/9] border border-dashed border-line rounded-[2px] grid place-items-center bg-[repeating-linear-gradient(45deg,#11141a_0_6px,#0e1116_6px_12px)]">
          <div className="text-center px-3">
            <div className="num text-[10px] text-ink-faint">{p.groundViewSlot.pending}</div>
          </div>
        </div>
        <p className="text-[10px] text-ink-faint leading-relaxed mt-1.5">{p.groundViewSlot.caption}</p>
      </div>
    </Panel>
  );
}

export function PlanPanel() {
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const setSuit = useMission((s) => s.setSuit);
  const planning = useMission((s) => s.planning);

  return (
    <div className="space-y-2">
      <Panel title="EVA traverse" right={planning ? <Badge tone="accent">solving</Badge> : undefined}>
        <GoNoGo />
        <div className="mt-3">
          <Totals />
        </div>
        {plan && plan.violations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {plan.violations.map((v, i) => (
              <Alert key={i} tone="danger" title="flight rule">
                {v}
              </Alert>
            ))}
          </div>
        )}
        {plan && plan.spe.overlaps && (
          <div className="mt-2">
            <Alert tone="caution" title="space weather mitigation">
              {SPE_EVENT.detail} Shifting egress to{' '}
              <button
                type="button"
                className="underline decoration-dotted text-caution cursor-pointer"
                onClick={() => setSuit({ evaStartHour: Math.max(5, plan.suggestedShelterHour) })}
              >
                {formatMLST(Math.max(5, plan.suggestedShelterHour))}
              </button>{' '}
              clears the window with 30 min of pad.
            </Alert>
          </div>
        )}
        {plan && plan.notes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {plan.notes.map((n, i) => (
              <li key={i} className="text-[10px] text-ink-faint leading-relaxed pl-2 border-l border-line">
                {n}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {plan && plan.samples.length > 1 && (
        <Panel title="Elevation profile">
          <ElevationProfileChart plan={plan} />
        </Panel>
      )}

      {plan && plan.samples.length > 1 && (
        <Panel title="Walk-back check">
          <WalkBackChart plan={plan} />
          <p className="text-[10px] text-ink-faint leading-relaxed mt-1.5">
            The crew must be able to abandon the EVA at any instant and reach a safe haven with the{' '}
            {Math.round(suit.reserveFraction * 100)}% reserve untouched. Where the red line rises above the green one,
            that is no longer true.
          </p>
        </Panel>
      )}

      <Panel title="Science stations" dense>
        <div className="p-2">
          <StationList />
        </div>
      </Panel>

      <SelectedTarget />
      <SuitSettings />
    </div>
  );
}
