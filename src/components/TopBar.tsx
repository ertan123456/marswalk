import { AOI } from '../lib/geo';
import { EVA_SOL } from '../data/models/environment';
import { MISSION } from '../data/real/science';
import { provenanceCounts } from '../data/config';
import { formatMLST } from '../lib/format';
import { useMission } from '../store/useMission';
import type { Mode } from '../store/useMission';
import { Badge } from './ui/primitives';
import { useT } from '../i18n/useT';
import { LOCALES } from '../i18n';
import type { MessageKey } from '../i18n';

const MODES: { id: Mode; labelKey: MessageKey; hintKey: MessageKey }[] = [
  { id: 'PLAN', labelKey: 'mode.plan', hintKey: 'mode.planTitle' },
  { id: '3D', labelKey: 'mode.3d', hintKey: 'mode.3dTitle' },
  { id: 'HUD', labelKey: 'mode.hud', hintKey: 'mode.hudTitle' },
  { id: 'BRIEFING', labelKey: 'mode.briefing', hintKey: 'mode.briefingTitle' },
  { id: 'ABOUT', labelKey: 'mode.data', hintKey: 'mode.dataTitle' },
];

export function TopBar() {
  const mode = useMission((s) => s.mode);
  const setMode = useMission((s) => s.setMode);
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const tourRunning = useMission((s) => s.tourRunning);
  const startTour = useMission((s) => s.startTour);
  const stopTour = useMission((s) => s.stopTour);
  const locale = useMission((s) => s.locale);
  const setLocale = useMission((s) => s.setLocale);
  const t = useT();

  return (
    <header className="shrink-0 border-b border-line bg-deck-900/95 backdrop-blur">
      <div className="flex items-center gap-3 px-3 h-12">
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="font-mono text-[15px] tracking-[0.26em] text-mars-400">MARSWALK</span>
          <span className="hidden sm:inline label !text-ink-faint">{t('app.tagline')}</span>
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
              <div className="label">{t('app.window')}</div>
              <div className="num text-[11px] text-ink">
                {formatMLST(suit.evaStartHour)}&ndash;{formatMLST(suit.evaStartHour + plan.totalTimeH)}
              </div>
            </div>
            <div className="text-right">
              <div className="label">{t('app.status')}</div>
              <div className={'num text-[11px] ' + (plan.feasible ? 'text-nominal' : 'text-danger')}>
                {plan.feasible ? t('verdict.go') : t('verdict.noGo')}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => (tourRunning ? stopTour() : startTour())}
          title="Auto-plays a 60-second tour of the whole tool (G)"
          className={
            'mr-2 font-mono text-[10px] tracking-[0.14em] uppercase px-2.5 py-1.5 border rounded-[2px] transition-colors cursor-pointer ' +
            (tourRunning
              ? 'bg-mars-500/25 border-mars-400 text-mars-300'
              : 'bg-deck-800 border-mars-500/50 text-mars-300 hover:bg-mars-500/15')
          }
        >
          {tourRunning ? 'stop demo' : t('app.guidedDemo')}
        </button>

        {/*
          Language. English is the default because the judges are
          international; the switch is two characters so it costs no room in a
          bar that is already full, and the choice is remembered.
        */}
        <div className="flex items-center gap-0.5 mr-2 p-0.5 bg-deck-800 border border-line rounded-[2px]" role="group" aria-label={t('app.language')}>
          {LOCALES.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLocale(l.value)}
              aria-pressed={locale === l.value}
              title={l.value === 'tr' ? t('app.languageTurkish') : t('app.languageEnglish')}
              className={
                'font-mono text-[10px] tracking-[0.12em] px-1.5 py-1 rounded-[2px] cursor-pointer ' +
                (locale === l.value ? 'bg-deck-600 text-ink' : 'text-ink-faint hover:text-ink-dim')
              }
            >
              {l.label}
            </button>
          ))}
        </div>

        <nav className="flex items-center gap-1" aria-label="Display mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={t(m.hintKey) + '  (' + (MODES.indexOf(m) + 1) + ')'}
              onClick={() => setMode(m.id)}
              className={
                'font-mono text-[10px] tracking-[0.16em] px-2.5 py-1.5 border rounded-[2px] transition-colors cursor-pointer ' +
                (mode === m.id
                  ? 'bg-mars-500/25 border-mars-400 text-mars-300'
                  : 'bg-deck-800 border-line text-ink-faint hover:text-ink hover:bg-deck-700')
              }
            >
              {t(m.labelKey)}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
