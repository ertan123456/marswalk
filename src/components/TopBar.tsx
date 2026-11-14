import { AOI } from '../lib/geo';
import { EVA_SOL } from '../data/models/environment';
import { MISSION } from '../data/real/science';
import { provenanceCounts } from '../data/config';
import { formatMLST } from '../lib/format';
import { useMission } from '../store/useMission';
import type { Mode } from '../store/useMission';
import { Badge } from './ui/primitives';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'PLAN', label: 'PLAN', hint: 'Layered planning map — habitat display' },
  { id: '3D', label: '3D', hint: 'Terrain view with the traverse draped on it' },
  { id: 'HUD', label: 'HUD', hint: 'Helmet visor overlay — field mode' },
  { id: 'BRIEFING', label: 'BRIEFING', hint: 'Objective, crew, timeline, conditions' },
];

export function TopBar() {
  const mode = useMission((s) => s.mode);
  const setMode = useMission((s) => s.setMode);
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);

  return (
    <header className="shrink-0 border-b border-line bg-deck-900/95 backdrop-blur">
      <div className="flex items-center gap-3 px-3 h-12">
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="font-mono text-[15px] tracking-[0.26em] text-mars-400">MARSWALK</span>
          <span className="hidden sm:inline label !text-ink-faint">EVA planner</span>
        </div>

        <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-line min-w-0">
          <span className="num text-[11px] text-ink-dim truncate">{AOI.name}</span>
          <Badge>{'SOL ' + EVA_SOL}</Badge>
          <Badge>{MISSION.designator}</Badge>
          <Badge tone="nominal" title="Layers downloaded from NASA/USGS products">{provenanceCounts().REAL} REAL</Badge>
          <Badge tone="accent" title="Layers computed from real data">{provenanceCounts().DERIVED} DERIVED</Badge>
          <Badge tone="caution" title="Layers modelled from published measurements">{provenanceCounts().MODELED} MODELED</Badge>
        </div>

        <div className="flex-1" />

        {plan && (
          <div className="hidden md:flex items-center gap-4 pr-3 border-r border-line">
            <div className="text-right">
              <div className="label">window</div>
              <div className="num text-[11px] text-ink">
                {formatMLST(suit.evaStartHour)}&ndash;{formatMLST(suit.evaStartHour + plan.totalTimeH)}
              </div>
            </div>
            <div className="text-right">
              <div className="label">status</div>
              <div className={'num text-[11px] ' + (plan.feasible ? 'text-nominal' : 'text-danger')}>
                {plan.feasible ? 'GO' : 'NO-GO'}
              </div>
            </div>
          </div>
        )}

        <nav className="flex items-center gap-1" aria-label="Display mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              onClick={() => setMode(m.id)}
              className={
                'font-mono text-[10px] tracking-[0.16em] px-2.5 py-1.5 border rounded-[2px] transition-colors cursor-pointer ' +
                (mode === m.id
                  ? 'bg-mars-500/25 border-mars-400 text-mars-300'
                  : 'bg-deck-800 border-line text-ink-faint hover:text-ink hover:bg-deck-700')
              }
            >
              {m.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
