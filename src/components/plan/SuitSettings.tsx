import { DEFAULT_SUIT, walkSpeedMs } from '../../lib/planner';
import { formatMLST } from '../../lib/format';
import { useMission } from '../../store/useMission';
import { Button, Panel, Slider, Switch } from '../ui/primitives';
import { MISSION } from '../../data/mock/science';

export function SuitSettings() {
  const suit = useMission((s) => s.suit);
  const setSuit = useMission((s) => s.setSuit);
  const resetSuit = useMission((s) => s.resetSuit);
  const showWalkBack = useMission((s) => s.showWalkBack);
  const setShowWalkBack = useMission((s) => s.setShowWalkBack);

  const dirty = JSON.stringify(suit) !== JSON.stringify(DEFAULT_SUIT);

  return (
    <Panel
      title="Suit & mobility model"
      right={
        dirty ? (
          <Button onClick={resetSuit} title="Back to the baseline flight rules">
            revert
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <Slider
          label="EVA consumables budget"
          value={suit.evaBudgetH}
          min={4}
          max={12}
          step={0.5}
          unit="h"
          onChange={(v) => setSuit({ evaBudgetH: v })}
        />
        <Slider
          label="Mandatory reserve"
          value={suit.reserveFraction}
          min={0.05}
          max={0.4}
          step={0.01}
          onChange={(v) => setSuit({ reserveFraction: v })}
          format={(v) => Math.round(v * 100) + '%'}
        />
        <Slider
          label="EVA start"
          value={suit.evaStartHour}
          min={5}
          max={18}
          step={0.25}
          onChange={(v) => setSuit({ evaStartHour: v })}
          format={(v) => formatMLST(v)}
        />
        <Slider
          label="Level walking speed"
          value={suit.flatSpeedMs}
          min={0.6}
          max={1.8}
          step={0.05}
          unit="m/s"
          onChange={(v) => setSuit({ flatSpeedMs: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="Slope limit (barred above)"
          value={suit.maxSlopeDeg}
          min={10}
          max={32}
          step={1}
          unit="°"
          onChange={(v) => setSuit({ maxSlopeDeg: v })}
        />
        <Slider
          label="Task time scale"
          value={suit.taskTimeScale}
          min={0.5}
          max={2}
          step={0.05}
          unit="×"
          onChange={(v) => setSuit({ taskTimeScale: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="Route slope penalty"
          value={suit.slopePenaltyPerDeg}
          min={0}
          max={0.3}
          step={0.01}
          onChange={(v) => setSuit({ slopePenaltyPerDeg: v })}
          format={(v) => '+' + (v * 100).toFixed(0) + '% / °'}
        />
        <Slider
          label="Sand crossing cost"
          value={suit.sandCostFactor}
          min={1}
          max={8}
          step={0.1}
          unit="×"
          onChange={(v) => setSuit({ sandCostFactor: v })}
          format={(v) => v.toFixed(1)}
        />

        <div className="pt-1 space-y-2 border-t border-line/60">
          <label className="flex items-start justify-between gap-3 pt-2 cursor-pointer">
            <span>
              <span className="text-[11px] text-ink block leading-tight">Pressurised rover support</span>
              <span className="text-[10px] text-ink-faint leading-snug block mt-0.5">
                {MISSION.roverSupport.name} staged forward at BX-03 as a second safe haven.
              </span>
            </span>
            <Switch
              checked={suit.roverSupport}
              onChange={(v) => setSuit({ roverSupport: v })}
              label="Rover support"
            />
          </label>
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span>
              <span className="text-[11px] text-ink block leading-tight">Return-to-safety field on map</span>
              <span className="text-[10px] text-ink-faint leading-snug block mt-0.5">
                Half-hour isochrones to the nearest safe haven. Red marks ground an abort could not walk back from inside the usable budget; grey is barred terrain.
              </span>
            </span>
            <Switch checked={showWalkBack} onChange={setShowWalkBack} label="Return-to-safety field" />
          </label>
        </div>

        <div className="pt-2 border-t border-line/60">
          <div className="label mb-1.5">Speed vs slope (derived)</div>
          <div className="grid grid-cols-5 gap-1 text-center">
            {[0, 5, 10, 15, 20].map((deg) => {
              const g = Math.tan((deg * Math.PI) / 180);
              const v = walkSpeedMs(suit, g);
              return (
                <div key={deg} className="border border-line/60 rounded-[2px] py-1">
                  <div className="num text-[10px] text-ink-faint">+{deg}&deg;</div>
                  <div
                    className={
                      'num text-[11px] ' +
                      (deg >= suit.maxSlopeDeg ? 'text-danger line-through' : 'text-ink')
                    }
                  >
                    {v.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-ink-faint leading-relaxed mt-1.5">
            Tobler&rsquo;s hiking function rescaled to the suited level-ground speed, m/s. Consumables burn at{' '}
            {suit.walkBurnBase.toFixed(2)}&times; nominal while walking, plus {suit.walkBurnPerGrade.toFixed(2)}&times;
            per unit of uphill grade; on-station work burns at 1.00&times;.
          </p>
        </div>
      </div>
    </Panel>
  );
}
