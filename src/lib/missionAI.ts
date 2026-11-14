/**
 * The Mission AI layer.
 *
 * Two engines, and the UI always says which one answered:
 *
 *   ANALYST  deterministic, runs in the browser, always available. It reads the
 *            solved plan and the derived analysis and writes the answer itself.
 *   OLLAMA   a local language model behind /api/mission-assistant, used when
 *            that endpoint is reachable. It is given the same computed facts
 *            and asked to explain them.
 *
 * The model never computes. Distances, consumables, walk-back margins, dose
 * and GO/NO-GO all come from lib/planner.ts and lib/missionInsights.ts, and
 * the prompt says so. If the model is unreachable the numbers do not change —
 * only the prose does. That is the point of putting the analyst underneath.
 *
 * The published site is static, so on the live link there is no API and the
 * analyst answers every time. That is a stated limitation, not a failure mode.
 */

import { buildAssistantContext, localAnalystAnswer } from './missionInsights';
import type { RoutePlan, SuitModel } from './planner';

export type Engine = 'analyst' | 'ollama';

export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAnswer {
  answer: string;
  engine: Engine;
  model?: string;
  /** set when we wanted the model but could not reach it */
  note?: string;
}

export const DAILY_LIMIT = 10;
const USER_KEY = 'marswalk-operator';
const USAGE_KEY = 'marswalk-ai-usage';
const API = '/api/mission-assistant';

/** A local, anonymous id. It keys the daily limit; it is not identity. */
export function operatorId(): string {
  try {
    const existing = localStorage.getItem(USER_KEY);
    if (existing) return existing;
    const id = 'op-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(USER_KEY, id);
    return id;
  } catch {
    return 'op-anonymous';
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function usedToday(): number {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { day: string; count: number };
    return parsed.day === today() ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function recordUse(): void {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ day: today(), count: usedToday() + 1 }));
  } catch {
    /* storage unavailable; the limit is advisory anyway */
  }
}

let engineCache: { engine: Engine; model?: string } | null = null;

/** Is a language model reachable? Cached for the session. */
export async function detectEngine(): Promise<{ engine: Engine; model?: string }> {
  if (engineCache) return engineCache;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const r = await fetch(API, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    if (r.ok) {
      const data = (await r.json()) as { ready?: boolean; model?: string };
      if (data.ready) {
        engineCache = { engine: 'ollama', model: data.model };
        return engineCache;
      }
    }
  } catch {
    /* no endpoint, or it timed out — the analyst covers it */
  }
  engineCache = { engine: 'analyst' };
  return engineCache;
}

export interface AskArgs {
  question: string;
  plan: RoutePlan | null;
  suit: SuitModel;
  history?: AiTurn[];
}

export async function askMissionAI({ question, plan, suit, history = [] }: AskArgs): Promise<AiAnswer> {
  const q = question.trim();
  if (!q) return { answer: 'Ask something about the plan.', engine: 'analyst' };

  // The deterministic answer is computed first, every time: it is both the
  // fallback and the ground truth the model is asked to work from.
  const analyst = localAnalystAnswer(q, plan, suit);
  const context = buildAssistantContext(plan, suit);

  const { engine } = await detectEngine();
  if (engine !== 'ollama') {
    recordUse();
    return { answer: analyst, engine: 'analyst' };
  }

  try {
    const controller = new AbortController();
    // Must outlast the endpoint's own budget, or a cold model load shows up
    // here as a failure while the server is still waiting on a good answer.
    const timer = setTimeout(() => controller.abort(), 165_000);
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Mission-User': operatorId() },
      signal: controller.signal,
      body: JSON.stringify({ question: q, context, analyst, messages: history.slice(-8) }),
    });
    clearTimeout(timer);

    if (r.status === 429) {
      return { answer: analyst, engine: 'analyst', note: 'Daily model limit reached — answered locally.' };
    }
    if (r.status === 504) {
      return {
        answer: analyst,
        engine: 'analyst',
        note: 'The model was still loading, so this is the deterministic analysis. Ask again in a moment.',
      };
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const data = (await r.json()) as { answer?: string; model?: string };
    if (!data.answer) throw new Error('empty answer');
    recordUse();
    return { answer: data.answer, engine: 'ollama', model: data.model };
  } catch {
    recordUse();
    return {
      answer: analyst,
      engine: 'analyst',
      note: 'The language model was unreachable, so this is the deterministic analysis.',
    };
  }
}

/** Starter questions, so the panel is useful before anyone types. */
export const SUGGESTED_QUESTIONS = [
  'Why is this plan GO?',
  'Explain the walk-back check',
  'Where should the habitat land?',
  'What changes if I use the rover?',
  'How much of this data is real?',
];
