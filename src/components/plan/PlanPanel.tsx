import { useEffect, useState } from 'react';
import { compassLabel } from '../../lib/geo';
import { coldSoakH } from '../../lib/planner';
import { formatDistance, formatDuration, formatMinutes, formatMLST } from '../../lib/format';
import { getSciencePoints } from '../../data/real/science';
import { SPE_EVENT } from '../../data/models/environment';
import { loadPov, povFor, frameUrl, viewLabel } from '../../data/real/pov';
import type { PovStation } from '../../data/real/pov';
import { useMission } from '../../store/useMission';
import { Alert, Badge, KeyVal, Panel, Readout, Segmented } from '../ui/primitives';
import { ElevationProfileChart, WalkBackChart } from './RouteCharts';
import { SuitSettings } from './SuitSettings';
import { Investigations } from './Investigations';
import { MissionAssistant } from '../ai/MissionAssistant';
import { useT } from '../../i18n/useT';

function GoNoGo() {
  const t = useT();
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
          {ok ? t('verdict.go') : t('verdict.noGo')}
        </div>
        <div className="text-[10px] text-ink-dim leading-tight">
          {ok
            ? t('verdict.goDetail')
            : plan.violations.length + ' flight-rule violation' + (plan.violations.length === 1 ? '' : 's')}
        </div>
      </div>
    </div>
  );
}

function Totals() {
  const t = useT();
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
      <Readout
        label={plan.mobility === 'rover' ? t('plan.traverseRover') : t('plan.traverse')}
        value={formatDistance(plan.totalDistanceM)}
        hint={
          plan.mobility === 'rover'
            ? t('plan.traverseHint', {
                driven: formatDistance(plan.roverDistanceM),
                foot: formatDistance(plan.footDistanceM),
              })
            : undefined
        }
      />
      <Readout label={t('plan.duration')} value={formatDuration(plan.totalTimeH)} unit="h" />
      <Readout
        label={t('plan.consumablesLeft')}
        value={remainingPct + '%'}
        tone={consTone}
        hint={t('plan.consumablesHint', { budget: suit.evaBudgetH, reserve: reservePct })}
      />
      <Readout label={t('plan.dose')} value={plan.doseMgy.toFixed(2)} unit="mGy" tone={doseTone} />
      {/*
        The cold, as a number the crew pays. It only appears when it costs
        something, so a midday EVA does not carry a readout reading zero.
      */}
      {plan.thermalPenaltyH > 0.005 && (
        <Readout
          label={t('plan.coldCost')}
          value={Math.round(plan.thermalPenaltyH * 60).toString()}
          unit="min"
          tone={plan.thermalPenaltyH * 60 > 45 ? 'caution' : undefined}
          hint={t('plan.coldCostHint', {
            soak: Math.round(coldSoakH(suit) * 60),
            start: Math.round(plan.airTempStartC),
            end: Math.round(plan.airTempEndC),
          })}
        />
      )}
      <Readout label={t('plan.airlockOut')} value={formatMLST(suit.evaStartHour)} size="sm" />
      <Readout label={t('plan.airlockIn')} value={formatMLST(suit.evaStartHour + plan.totalTimeH)} size="sm" />
    </div>
  );
}

function StationList() {
  const t = useT();
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const order = useMission((s) => s.waypointOrder);
  const toggleWaypoint = useMission((s) => s.toggleWaypoint);
  const moveWaypoint = useMission((s) => s.moveWaypoint);
  const selectWaypoint = useMission((s) => s.selectWaypoint);
  const selected = useMission((s) => s.selectedWaypointId);

  return (
    <div className="space-y-1.5">
      {getSciencePoints().map((p) => {
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
                aria-label={`${inPlan ? 'Remove' : 'Add'} station ${p.code}, ${p.title}`}
                aria-pressed={inPlan}
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
                    aria-label={`Move ${p.code} earlier in the traverse`}
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWaypoint(p.id, 1)}
                    className="text-ink-faint hover:text-ink text-[9px] leading-none px-1 cursor-pointer"
                    title="Later in the traverse"
                    aria-label={`Move ${p.code} later in the traverse`}
                  >
                    &#9660;
                  </button>
                </div>
              )}
            </div>

            {station && (
              <div className="mt-1.5 pt-1.5 border-t border-line/40">
                <KeyVal
                  k={t('station.arrive')}
                  v={formatMLST(suit.evaStartHour + station.arrivalTimeH) + ' (T+' + formatDuration(station.arrivalTimeH) + ')'}
                />
                <KeyVal
                  k={t('station.leg')}
                  v={formatDistance(station.legDistanceM) + ' · ' + compassLabel(station.bearingFromPrev) + ' ' + Math.round(station.bearingFromPrev) + '°'}
                />
                {station.walkFromDropOffM !== undefined && (
                  <KeyVal
                    k={t('station.dropOff')}
                    v={'dismount, walk ' + formatDistance(station.walkFromDropOffM)}
                    tone="caution"
                  />
                )}
                <KeyVal k={t('station.onStation')} v={Math.round(station.taskMinutes) + ' min'} />
                <KeyVal
                  k={t('station.consumablesAtDepart')}
                  v={Math.round(((suit.evaBudgetH - station.departConsumablesH) / suit.evaBudgetH) * 100) + '%'}
                  tone={
                    (suit.evaBudgetH - station.departConsumablesH) / suit.evaBudgetH < suit.reserveFraction
                      ? 'danger'
                      : undefined
                  }
                />
                <KeyVal
                  k={t('station.walkBackMargin')}
                  v={formatMinutes(station.walkBackMarginH)}
                  tone={station.walkBackOk ? 'nominal' : 'danger'}
                />
                <KeyVal k={t('station.returnToHaven')} v={formatDuration(station.returnTimeH) + ' h'} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PovGallery({ code }: { code: string }) {
  const [station, setStation] = useState<PovStation | null | undefined>(undefined);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let alive = true;
    setActive(0);
    void loadPov().then(() => {
      if (alive) setStation(povFor(code) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  if (station === undefined) {
    return (
      <div className="mt-1.5 aspect-[4/3] border border-line/60 rounded-[2px] grid place-items-center bg-deck-900/60">
        <span className="num text-[10px] text-ink-faint">loading rover frames…</span>
      </div>
    );
  }
  if (!station || station.frames.length === 0) {
    return (
      <div className="mt-1.5 aspect-[4/3] border border-dashed border-line rounded-[2px] grid place-items-center bg-deck-900/40">
        <span className="num text-[10px] text-ink-faint">no rover frame near this sol</span>
      </div>
    );
  }

  const f = station.frames[Math.min(active, station.frames.length - 1)];
  return (
    <div className="mt-1.5">
      <div className="relative border border-line/60 rounded-[2px] overflow-hidden bg-black">
        <img
          src={frameUrl(f)}
          alt={f.caption || f.title}
          loading="lazy"
          className="block w-full aspect-square object-cover"
        />
        <div className="absolute top-1 right-1">
          <Badge tone={f.view === 'horizon' ? 'nominal' : 'default'}>
            {f.view === 'horizon' ? 'view out' : 'workspace'}
          </Badge>
        </div>
      </div>

      {station.frames.length > 1 && (
        <div className="flex gap-1 mt-1">
          {station.frames.map((fr, i) => (
            <button
              key={fr.image_id}
              type="button"
              onClick={() => setActive(i)}
              className={
                'flex-1 h-10 border rounded-[2px] overflow-hidden cursor-pointer transition-colors ' +
                (i === active ? 'border-mars-400' : 'border-line/60 hover:border-line')
              }
              title={viewLabel(fr)}
            >
              <img src={frameUrl(fr)} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="num text-[10px] text-probe-400 mt-1.5">{viewLabel(f)}</div>
      <p className="text-[10px] text-ink-faint leading-relaxed mt-0.5">
        {f.caption || f.title}
      </p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="num text-[9px] text-ink-faint">{f.credit}</span>
        <a
          href={f.source_page}
          target="_blank"
          rel="noreferrer"
          className="num text-[9px] text-ink-dim underline decoration-dotted hover:text-ink"
        >
          raw frame ↗
        </a>
      </div>
    </div>
  );
}

function SelectedTarget() {
  const selected = useMission((s) => s.selectedWaypointId);
  const p = getSciencePoints().find((x) => x.id === selected);
  if (!p) return null;
  return (
    <Panel title={'Target brief · ' + p.code}>
      <h3 className="text-sm text-ink leading-tight">{p.title}</h3>
      <div className="num text-[10px] text-mars-300 mt-0.5">{p.targetMineral}</div>
      {p.sol !== undefined && (
        <div className="num text-[10px] text-ink-faint mt-0.5">
          Pinned to Curiosity's surveyed position on sol {p.sol}
          {p.surveyedElevM !== undefined && ` · ${Math.round(p.surveyedElevM)} m`}
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-ink-dim mt-2">{p.whyItMatters}</p>
      <div className="mt-2.5 border border-line/60 rounded-[2px] bg-deck-800/40 p-2">
        <div className="flex items-center justify-between">
          <span className="label">ground-level view</span>
          <Badge tone="nominal">REAL</Badge>
        </div>
        <PovGallery code={p.code} />
      </div>
    </Panel>
  );
}

export function PlanPanel() {
  const [tab, setTab] = useState<'stations' | 'science' | 'charts' | 'ai'>('stations');
  const t = useT();
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const setSuit = useMission((s) => s.setSuit);
  const planning = useMission((s) => s.planning);

  return (
    <div className="space-y-2">
      <Panel title={t('plan.title')} right={planning ? <Badge tone="accent">{t('plan.solving')}</Badge> : undefined}>
        <GoNoGo />
        <div className="mt-3">
          <Totals />
        </div>
        {plan && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <Badge tone={plan.mobility === 'rover' ? 'accent' : 'default'}>
              {plan.mobility === 'rover' ? t('plan.roverAssisted') : t('plan.onFoot')}
            </Badge>
            {plan.mobility === 'rover' && (
              <>
                <Badge>{t('plan.driven', { d: formatDistance(plan.roverDistanceM) })}</Badge>
                <Badge>{t('plan.walked', { d: formatDistance(plan.footDistanceM) })}</Badge>
                <Badge tone={plan.dropOffs.length ? 'caution' : 'nominal'}>
                  {plan.dropOffs.length
                    ? `${plan.dropOffs.length} drop-off${plan.dropOffs.length === 1 ? '' : 's'}`
                    : t('plan.noDismount')}
                </Badge>
              </>
            )}
          </div>
        )}
        {plan && plan.violations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {plan.violations.map((v, i) => (
              <Alert key={i} tone="danger" title={t('plan.flightRule')}>
                {v}
              </Alert>
            ))}
          </div>
        )}
        {plan && plan.spe.overlaps && (
          <div className="mt-2">
            <Alert tone="caution" title={t('plan.spe')}>
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

      {/*
        Everything below the verdict used to be mounted at once — assistant,
        two charts, the station list, the suit model and the target brief, six
        or seven stacked panels in a 380px rail. The verdict is the product and
        stays pinned; the rest is one tab at a time.
      */}
      <Segmented
        idPrefix="plan-rail"
        ariaLabel={t('rail.planLabel')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'stations', label: t('rail.stations') },
          { value: 'science', label: t('rail.science') },
          { value: 'charts', label: t('rail.charts') },
          { value: 'ai', label: t('rail.ai') },
        ]}
      />

      <div
        id="plan-rail-panel"
        role="tabpanel"
        aria-labelledby={`plan-rail-tab-${tab}`}
        className="space-y-2"
      >
        {tab === 'stations' && (
          <>
            <Panel title={t('plan.scienceStations')} dense>
              <div className="p-2">
                <StationList />
              </div>
            </Panel>
            <SelectedTarget />
            <SuitSettings />
          </>
        )}

        {tab === 'science' && <Investigations />}

        {tab === 'charts' &&
          (plan && plan.samples.length > 1 ? (
            <>
              <Panel title={t('plan.elevationProfile')}>
                <ElevationProfileChart plan={plan} />
              </Panel>
              <Panel title={t('plan.walkBack')}>
                <WalkBackChart plan={plan} />
                <p className="text-[10px] text-ink-faint leading-relaxed mt-1.5">
                  {t('plan.walkBackNote', { pct: Math.round(suit.reserveFraction * 100) })}
                </p>
              </Panel>
            </>
          ) : (
            <Panel title={t('plan.charts')}>
              <p className="text-[11px] text-ink-faint leading-relaxed">{t('plan.chartsEmpty')}</p>
            </Panel>
          ))}

        {tab === 'ai' && <MissionAssistant />}
      </div>
    </div>
  );
}
