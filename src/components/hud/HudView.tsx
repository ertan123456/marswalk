/**
 * HUD MODE — what the crew actually sees through the visor.
 *
 * First-person render of the same terrain and the same traverse, with a
 * minimal high-contrast overlay: heading, next station, consumables, dose,
 * hazard state. Everything here is read off the identical plan object the
 * planning map is showing, so the field view can never drift from the plan.
 */

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { MarsScene } from '../three/Scene';
import { bearingDeg, compassLabel, localToGrid } from '../../lib/geo';
import { getTerrain } from '../../data/real/terrain';
import { hazardClass } from '../../data/real/terrain';
import { doseOverWindow, SPE_EVENT } from '../../data/models/environment';
import { formatDistance, formatDuration, formatMLST } from '../../lib/format';
import { getSciencePoints } from '../../data/real/science';
import { useMission } from '../../store/useMission';

function CompassTape({ heading, targetBearing }: { heading: number; targetBearing: number | null }) {
  const pxPerDeg = 4.6;
  const span = 60;
  const ticks: { deg: number; major: boolean }[] = [];
  for (let d = -span; d <= span; d += 5) {
    const deg = (((heading + d) % 360) + 360) % 360;
    ticks.push({ deg, major: deg % 45 === 0 });
  }

  let targetOffset: number | null = null;
  if (targetBearing !== null) {
    let diff = targetBearing - heading;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    if (Math.abs(diff) <= span) targetOffset = diff * pxPerDeg;
  }

  return (
    <div className="relative h-11 overflow-hidden" style={{ width: span * 2 * pxPerDeg }}>
      <div className="absolute inset-0">
        {ticks.map((t, i) => {
          let diff = t.deg - heading;
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;
          const x = span * pxPerDeg + diff * pxPerDeg;
          return (
            <div key={i} className="absolute top-0 flex flex-col items-center" style={{ left: x, transform: 'translateX(-50%)' }}>
              <div className={t.major ? 'w-px h-3 bg-mars-300' : 'w-px h-1.5 bg-ink-dim/60'} />
              {t.major && (
                <div className="num text-[9px] text-mars-300 mt-0.5">
                  {compassLabel(t.deg)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {targetOffset !== null && (
        <div
          className="absolute top-[18px]"
          style={{ left: span * pxPerDeg + targetOffset, transform: 'translateX(-50%)' }}
        >
          <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[7px] border-l-transparent border-r-transparent border-b-nominal" />
        </div>
      )}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 h-full w-px bg-ink/70" />
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 num text-[13px] text-ink">
        {Math.round(heading).toString().padStart(3, '0')}&deg;
      </div>
    </div>
  );
}

function Bar({ value, tone }: { value: number; tone: 'nominal' | 'caution' | 'danger' }) {
  const color = tone === 'danger' ? 'bg-danger' : tone === 'caution' ? 'bg-caution' : 'bg-nominal';
  return (
    <div className="h-1 w-full bg-ink/15 rounded-full overflow-hidden">
      <div className={'h-full ' + color} style={{ width: Math.max(0, Math.min(100, value)) + '%' }} />
    </div>
  );
}

export function HudView() {
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const progress = useMission((s) => s.traverseProgress);
  const setProgress = useMission((s) => s.setTraverseProgress);
  const flying = useMission((s) => s.flying);
  const setFlying = useMission((s) => s.setFlying);
  const setMode = useMission((s) => s.setMode);

  const hud = useMemo(() => {
    if (!plan || plan.samples.length < 2) return null;
    const n = plan.samples.length;
    const i = Math.min(n - 1, Math.round(progress * (n - 1)));
    const cur = plan.samples[i];
    const ahead = plan.samples[Math.min(n - 1, i + Math.max(3, Math.round(n * 0.01)))];
    const heading = bearingDeg(cur.point, ahead.point);

    const nextStation = plan.stations.find((s) => s.sampleIndex > i) ?? plan.stations[plan.stations.length - 1];
    const nextSample = plan.samples[nextStation.sampleIndex];
    const distToNext = Math.max(0, (nextSample?.cumDistM ?? 0) - cur.cumDistM);
    const etaH = Math.max(0, (nextStation.arrivalTimeH ?? 0) - cur.timeH);
    const targetBearing = nextSample ? bearingDeg(cur.point, nextSample.point) : null;

    const t = getTerrain();
    const gi = localToGrid(cur.point);
    const cell = gi.row * t.width + gi.col;
    const cls = hazardClass(t.hazard[cell]);
    const haz = {
      label: cls ? cls.label.toUpperCase() : 'UNKNOWN',
      tone: (cls?.passable === false
        ? 'danger'
        : t.hazard[cell] > 0
          ? 'caution'
          : 'nominal') as 'nominal' | 'caution' | 'danger',
    };
    const slope = t.slopeDeg[cell];

    const consumablesPct = ((suit.evaBudgetH - cur.consumablesH) / suit.evaBudgetH) * 100;
    const dose = doseOverWindow(suit.evaStartHour, Math.max(0.001, cur.timeH));
    const mlst = suit.evaStartHour + cur.timeH;
    const speIn = SPE_EVENT.startHour - mlst;

    const target = getSciencePoints().find((p) => p.id === nextStation.id);

    return {
      cur,
      heading,
      nextStation,
      distToNext,
      etaH,
      targetBearing,
      haz,
      slope,
      consumablesPct,
      dose,
      mlst,
      speIn,
      target,
      reservePct: suit.reserveFraction * 100,
    };
  }, [plan, progress, suit]);

  return (
    <div className="flex-1 min-h-0 relative bg-black">
      <Canvas camera={{ position: [0, 50, 0], fov: 78, near: 0.5, far: 14000 }} dpr={[1, 1.8]} gl={{ antialias: true }}>
        <MarsScene firstPerson />
      </Canvas>

      {/* visor frame */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 160px 60px rgba(0,0,0,0.82), inset 0 0 40px 8px rgba(0,0,0,0.5)',
          background:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.016) 0 1px, transparent 1px 3px)',
        }}
      />

      {hud && (
        <>
          {/* compass */}
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
            <CompassTape heading={hud.heading} targetBearing={hud.targetBearing} />
          </div>

          {/* suit block */}
          <div className="pointer-events-none absolute top-3 left-4 w-[190px]">
            <div className="label !text-nominal/80">suit</div>
            <div className="flex items-baseline justify-between">
              <span className="num text-[26px] text-ink leading-none">{Math.round(hud.consumablesPct)}</span>
              <span className="num text-[11px] text-ink-dim">% consumables</span>
            </div>
            <div className="mt-1.5">
              <Bar
                value={hud.consumablesPct}
                tone={
                  hud.consumablesPct < hud.reservePct
                    ? 'danger'
                    : hud.consumablesPct < hud.reservePct + 10
                      ? 'caution'
                      : 'nominal'
                }
              />
            </div>
            <div className="num text-[10px] text-ink-dim mt-1.5">
              reserve floor {Math.round(hud.reservePct)}% &middot; T+{formatDuration(hud.cur.timeH)}
            </div>
            <div className="num text-[10px] text-ink-faint">MLST {formatMLST(hud.mlst)}</div>
          </div>

          {/* radiation block */}
          <div className="pointer-events-none absolute top-3 right-4 w-[190px] text-right">
            <div className="label !text-caution/80">radiation</div>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="num text-[26px] text-ink leading-none">{hud.dose.toFixed(2)}</span>
              <span className="num text-[11px] text-ink-dim">mSv EVA</span>
            </div>
            <div
              className={
                'num text-[10px] mt-1.5 ' +
                (hud.speIn <= 0 ? 'text-danger blink' : hud.speIn < 1 ? 'text-caution' : 'text-ink-faint')
              }
            >
              {hud.speIn <= 0
                ? 'SPE ACTIVE — SHELTER'
                : 'SPE in ' + formatDuration(hud.speIn) + ' (' + formatMLST(SPE_EVENT.startHour) + ')'}
            </div>
            <div className="num text-[10px] text-ink-faint">walk-back {hud.cur.walkBackOk ? 'nominal' : 'EXCEEDED'}</div>
          </div>

          {/* reticle + next station */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="relative h-10 w-10 mx-auto">
              <div className="absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-nominal/80" />
              <div className="absolute left-1/2 bottom-0 h-2.5 w-px -translate-x-1/2 bg-nominal/80" />
              <div className="absolute top-1/2 left-0 w-2.5 h-px -translate-y-1/2 bg-nominal/80" />
              <div className="absolute top-1/2 right-0 w-2.5 h-px -translate-y-1/2 bg-nominal/80" />
            </div>
            <div className="num text-[11px] text-nominal mt-1 tracking-[0.18em]">{hud.nextStation.code}</div>
            <div className="num text-[22px] text-ink leading-tight">{formatDistance(hud.distToNext)}</div>
            <div className="num text-[11px] text-ink-dim">
              ETA {formatDuration(hud.etaH)} &middot; {compassLabel(hud.targetBearing ?? 0)}
            </div>
          </div>

          {/* hazard + terrain */}
          <div className="pointer-events-none absolute bottom-16 left-4 w-[260px]">
            <div className="label">terrain</div>
            <div className="num text-[11px] text-ink">
              slope {hud.slope.toFixed(1)}&deg; &middot; elev {Math.round(hud.cur.elevation)} m
            </div>
            <div
              className={
                'num text-[12px] mt-1 ' +
                (hud.haz.tone === 'danger'
                  ? 'text-danger blink'
                  : hud.haz.tone === 'caution'
                    ? 'text-caution'
                    : 'text-nominal')
              }
            >
              {hud.haz.label}
            </div>
          </div>

          {/* next task */}
          <div className="pointer-events-none absolute bottom-16 right-4 w-[300px] text-right">
            <div className="label">next task</div>
            {hud.target ? (
              <>
                <div className="text-[13px] text-ink leading-tight">{hud.target.title}</div>
                <div className="num text-[10px] text-mars-300 mt-0.5">{hud.target.targetMineral}</div>
                <div className="num text-[10px] text-ink-dim mt-0.5">
                  {hud.target.taskMinutes} min on station
                </div>
              </>
            ) : (
              <div className="text-[13px] text-ink">Return to habitat airlock</div>
            )}
          </div>

          {!hud.cur.walkBackOk && (
            <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2">
              <div className="border border-danger bg-danger/20 px-3 py-1.5 rounded-[2px]">
                <span className="num text-[12px] text-danger tracking-[0.2em] blink">
                  WALK-BACK LIMIT EXCEEDED
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* field controls (not part of the visor) */}
      <div className="absolute bottom-0 inset-x-0 border-t border-line bg-void/85 backdrop-blur px-3 py-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFlying(!flying)}
          className="font-mono text-[10px] tracking-[0.14em] uppercase px-2.5 py-1.5 border border-mars-500/60 bg-mars-500/15 text-mars-300 rounded-[2px] cursor-pointer"
        >
          {flying ? 'pause walk' : 'walk route'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="flex-1 cursor-pointer"
        />
        <span className="num text-[10px] text-ink-dim w-20 text-right">
          {plan ? formatDistance(plan.samples[Math.round(progress * (plan.samples.length - 1))]?.cumDistM ?? 0) : '—'}
        </span>
        <button
          type="button"
          onClick={() => setMode('PLAN')}
          className="font-mono text-[10px] tracking-[0.14em] uppercase px-2.5 py-1.5 border border-line bg-deck-800 text-ink-dim rounded-[2px] cursor-pointer"
        >
          to plan
        </button>
      </div>
    </div>
  );
}
