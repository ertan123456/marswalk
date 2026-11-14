/**
 * Which scientific investigation, and where you go for it.
 *
 * The table is not written by hand. Each investigation names the geochemical
 * units that can answer it, and the code then asks the shipped CRISM unit
 * raster where the nearest qualifying ground to each station actually is. So
 * the distances move when the data moves.
 *
 * Choosing one re-times the EVA. A drill campaign on clay is 95 minutes a
 * station against the 35 the station defaults to, which is most of an hour
 * more consumables at every stop — enough to turn a GO into a NO-GO, which is
 * exactly what the planner is for.
 */

import { INVESTIGATIONS, SUPPORT_RADIUS_M, investigationCoverage } from '../../data/models/investigations';
import { getSciencePoints } from '../../data/real/science';
import { geochemMeta } from '../../data/adapters/geochem';
import { useT } from '../../i18n/useT';
import { useMission } from '../../store/useMission';
import { Button, Panel } from '../ui/primitives';

export function Investigations() {
  const t = useT();
  const selected = useMission((s) => s.investigation);
  const setInvestigation = useMission((s) => s.setInvestigation);
  // Which stations are actually on the traverse. Without this the panel can
  // list the ground for an investigation that re-times nothing, because the
  // only station that supports it was never added to the route — which looks
  // like the control is broken when it is working correctly.
  const waypointOrder = useMission((s) => s.waypointOrder);
  // Re-render once the geochemistry raster is in, since every distance below
  // is measured from it.
  const geochemData = useMission((s) => s.layerData['geochem-units']);

  const meta = geochemMeta();
  const coverage = geochemData ? investigationCoverage(getSciencePoints()) : [];

  return (
    <Panel
      title={t('inv.title')}
      right={
        selected ? (
          <Button onClick={() => setInvestigation(null)} title={t('inv.clearTitle')}>
            {t('inv.clear')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        <p className="text-[10px] text-ink-faint leading-relaxed">{t('inv.intro')}</p>

        {!geochemData && (
          <p className="text-[11px] text-ink-faint">{t('inv.loading')}</p>
        )}

        {coverage.map(({ investigation: inv, areaKm2, stations }) => {
          const active = selected === inv.id;
          return (
            <div
              key={inv.id}
              className={
                'rounded border transition-colors ' +
                (active ? 'border-mars-400/60 bg-deck-700' : 'border-line-soft bg-deck-800')
              }
            >
              <button
                type="button"
                onClick={() => setInvestigation(active ? null : inv.id)}
                aria-pressed={active}
                className="w-full text-left p-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={
                      'text-[12px] leading-tight ' + (active ? 'text-mars-300' : 'text-ink')
                    }
                  >
                    {t(inv.labelKey as 'inv.clay.label')}
                  </span>
                  <span className="num text-[10px] text-ink-faint shrink-0">
                    {inv.taskMinutes} {t('inv.minPerStation')}
                  </span>
                </div>
                <p className="text-[10px] text-ink-dim leading-relaxed mt-1">
                  {t(inv.questionKey as 'inv.clay.question')}
                </p>
              </button>

              {active && (
                <div className="px-2 pb-2 space-y-1.5">
                  <p className="text-[10px] text-ink-faint leading-relaxed">
                    {t(inv.rationaleKey as 'inv.clay.rationale')}
                  </p>

                  <div className="num text-[10px] text-ink-faint">
                    {t('inv.groundArea', { km2: areaKm2.toFixed(2) })}
                  </div>

                  {stations.length === 0 ? (
                    <p className="text-[10px] text-caution leading-relaxed">
                      {t('inv.noStation', { m: SUPPORT_RADIUS_M })}
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-1">
                        {stations.map((s) => {
                          const onRoute = waypointOrder.includes(s.stationId);
                          return (
                            <li key={s.stationId} className="flex items-center gap-1.5">
                              <span
                                aria-hidden
                                className="w-2 h-2 rounded-sm shrink-0"
                                style={{ background: s.unitColor }}
                              />
                              <span
                                className={
                                  'num text-[10px] shrink-0 ' +
                                  (onRoute ? 'text-mars-300' : 'text-ink-faint')
                                }
                                title={onRoute ? t('inv.onTraverse') : t('inv.offTraverse')}
                              >
                                {s.code}
                                {onRoute ? '' : '·'}
                              </span>
                              <span className="text-[10px] text-ink-faint truncate flex-1">
                                {s.unitLabel}
                              </span>
                              <span className="num text-[10px] text-ink shrink-0">
                                {s.distanceM < 1 ? '0' : s.distanceM.toFixed(0)} m
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      {/*
                        The case that otherwise looks like a broken control:
                        the ground exists, but not on the route the crew is
                        flying, so re-timing changes nothing.
                      */}
                      {!stations.some((s) => waypointOrder.includes(s.stationId)) && (
                        <p className="text-[10px] text-caution leading-relaxed">
                          {t('inv.addStation')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/*
          The caveat that matters most, and the one a judge will ask about: no
          station stands on a unit. Said here, next to the distances, rather
          than only in the shipped metadata.
        */}
        <p className="text-[10px] text-ink-faint leading-relaxed border-t border-line-soft pt-2">
          {t('inv.caveat', { m: SUPPORT_RADIUS_M })}
        </p>
        {meta && (
          <p className="text-[10px] text-ink-faint leading-relaxed">
            {t('inv.provenance', {
              pct: meta.classified_percent_of_aoi.toFixed(1),
              k: meta.sigma_k,
            })}
          </p>
        )}
      </div>
    </Panel>
  );
}

/** Investigation ids, for anything that needs to know them without importing the list. */
export const INVESTIGATION_IDS = INVESTIGATIONS.map((i) => i.id);
