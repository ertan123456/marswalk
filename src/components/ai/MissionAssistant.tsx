/**
 * Mission AI panel.
 *
 * The badge is the honest part: it says which engine answered. ANALYST is
 * deterministic and always available; OLLAMA appears only when a local model
 * is reachable. Either way the numbers come from the planner, never from the
 * model — the panel says that too, where a reviewer will see it.
 */

import { useEffect, useRef, useState } from 'react';
import {
  DAILY_LIMIT,
  SUGGESTED_QUESTIONS,
  askMissionAI,
  detectEngine,
  usedToday,
} from '../../lib/missionAI';
import type { AiTurn, Engine } from '../../lib/missionAI';
import { buildMissionSnapshot } from '../../lib/missionInsights';
import { useMission } from '../../store/useMission';
import { Badge, Button, Panel } from '../ui/primitives';
import { useT } from '../../i18n/useT';

function EngineBadge({ engine, model }: { engine: Engine; model?: string }) {
  const t = useT();
  if (engine === 'ollama') {
    return (
      <Badge tone="accent" title={t('ai.modelTitle', { model: model ?? 'ollama' })}>
        {model ?? 'ollama'}
      </Badge>
    );
  }
  return (
    <Badge tone="nominal" title={t('ai.localAnalystTitle')}>
      {t('ai.localAnalyst')}
    </Badge>
  );
}

export function MissionAssistant() {
  const plan = useMission((s) => s.plan);
  const suit = useMission((s) => s.suit);
  const t = useT();

  const [engine, setEngine] = useState<{ engine: Engine; model?: string }>({ engine: 'analyst' });
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(0);
  const [turns, setTurns] = useState<
    { q: string; a: string; engine: Engine; model?: string; note?: string }[]
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUsed(usedToday());
    void detectEngine().then(setEngine);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const snapshot = plan ? buildMissionSnapshot(plan, suit) : null;
  const remaining = Math.max(0, DAILY_LIMIT - used);
  const spent = remaining === 0;

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy || spent) return;
    setBusy(true);
    setQuestion('');
    const history: AiTurn[] = turns.flatMap((t) => [
      { role: 'user' as const, content: t.q },
      { role: 'assistant' as const, content: t.a },
    ]);
    const res = await askMissionAI({ question: q, plan, suit, history });
    setTurns((prev) => [...prev, { q, a: res.answer, engine: res.engine, model: res.model, note: res.note }]);
    setUsed(usedToday());
    setBusy(false);
  }

  return (
    <Panel
      title={t('ai.title')}
      right={<EngineBadge engine={engine.engine} model={engine.model} />}
    >
      {snapshot && (
        <div className="flex items-center gap-2 flex-wrap pb-2.5 mb-2.5 border-b border-line/60">
          <Badge tone={snapshot.status === 'GO' ? 'nominal' : 'danger'}>{snapshot.status}</Badge>
          <span className="num text-[11px] text-ink">{t('ai.safety', { n: snapshot.safetyScore })}</span>
          <Badge
            tone={
              snapshot.safetyBand === 'LOW' ? 'nominal' : snapshot.safetyBand === 'MEDIUM' ? 'caution' : 'danger'
            }
          >
            {snapshot.safetyBand === 'LOW'
              ? t('ai.riskLow')
              : snapshot.safetyBand === 'MEDIUM'
                ? t('ai.riskMedium')
                : t('ai.riskHigh')}
          </Badge>
        </div>
      )}

      {turns.length > 0 && (
        <div ref={scrollRef} className="max-h-[260px] overflow-y-auto space-y-2.5 mb-2.5 pr-1">
          {turns.map((t, i) => (
            <div key={i}>
              <div className="text-[11px] text-mars-300 leading-snug">{t.q}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <EngineBadge engine={t.engine} model={t.model} />
                {t.note && <span className="text-[9px] text-ink-faint">{t.note}</span>}
              </div>
              <p className="text-[11px] leading-relaxed text-ink-dim mt-1 whitespace-pre-wrap">{t.a}</p>
            </div>
          ))}
        </div>
      )}

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {SUGGESTED_QUESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void ask(s)}
              disabled={spent}
              className="text-[10px] px-2 py-1 border border-line/70 rounded-[2px] text-ink-dim hover:text-ink hover:border-line cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <label className="sr-only" htmlFor="mission-ai-question">
        {t('ai.inputLabel')}
      </label>
      <textarea
        id="mission-ai-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void ask(question);
          }
        }}
        disabled={spent}
        rows={2}
        placeholder={spent ? t('ai.placeholderSpent') : t('ai.placeholder')}
        className="w-full resize-y bg-deck-800 border border-line rounded-[2px] px-2.5 py-2 text-[11px] text-ink outline-none focus:border-mars-400 disabled:opacity-50"
      />

      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="num text-[9px] text-ink-faint">
          {t('ai.remaining', { n: remaining, total: DAILY_LIMIT })}
        </span>
        <Button tone="accent" onClick={() => void ask(question)} title={t('ai.askTitle')}>
          {busy ? t('ai.thinking') : spent ? t('ai.limitReached') : t('ai.ask')}
        </Button>
      </div>

      <p className="text-[10px] leading-relaxed text-ink-faint mt-2.5 pt-2.5 border-t border-line/40">
        {t('ai.standingNote')}
      </p>
    </Panel>
  );
}
