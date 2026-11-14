/**
 * Mission AI endpoint — a thin bridge to a local Ollama instance.
 *
 * Adapted from a contribution by a teammate. What it does NOT do is as
 * important as what it does: it performs no mission arithmetic. The browser
 * sends the already-computed plan and the deterministic analysis, and the
 * model is asked to explain them. If this endpoint is absent — which it is on
 * the published static site — the browser answers from lib/missionInsights.ts
 * instead and the numbers are identical.
 *
 * GET  -> { ready, model }   health probe, so the UI can label its engine
 * POST -> { answer, model }  one assistant turn
 *
 * Requires OLLAMA_BASE_URL to be reachable from wherever this runs. A cloud
 * function cannot see an Ollama on someone's laptop, so in practice this is a
 * local-development and live-demo feature.
 */

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (value: unknown) => void;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** Advisory only: it lives in one process and resets on a cold start. */
const usage = new Map<string, { day: string; count: number }>();
const DAILY_LIMIT = 10;
const MAX_QUESTION = 1200;

/**
 * Measured on the development machine: loading llama3.2:3b into memory takes
 * ~46 s and the first answer lands at ~99 s; once resident, answers come back
 * in under 2 s. An earlier 40 s budget therefore failed every first question
 * and — worse — reported it as "Ollama is unreachable", which sent you looking
 * for a network problem that did not exist.
 */
const CHAT_TIMEOUT_MS = 150_000;
const PROBE_TIMEOUT_MS = 2_000;
/** How long Ollama keeps the model resident after a request. */
const KEEP_ALIVE = '30m';

function header(request: RequestLike, name: string): string {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function config() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  };
}

const SYSTEM = [
  'You are Mission AI for MARSWALK, a Mars EVA planning console for Gale Crater.',
  '',
  'You do not calculate. Every distance, duration, consumable figure, walk-back margin,',
  'dose and GO/NO-GO verdict has already been computed and is given to you in MISSION DATA.',
  'Quote those numbers exactly. If a question needs a number that is not in MISSION DATA,',
  'say it is not computed rather than estimating it.',
  '',
  'ANALYST DRAFT is a deterministic answer to the same question, generated from the same data.',
  'Treat it as ground truth. Your job is to make it clearer and better connected — add the why,',
  'the trade-off, the next thing the operator should try. Never contradict it.',
  '',
  'Respect provenance: elevation and imagery are REAL measurements from MRO HiRISE.',
  'Slope, hazards, science regions and landing scores are DERIVED from them.',
  'Radiation and weather are MODELED from published RAD and REMS results, not telemetry.',
  'Never present a DERIVED or MODELED value as a measurement.',
  '',
  'Reply in the language the operator used. Be concise: a short paragraph or a few lines.',
].join('\n');

export default async function handler(request: RequestLike, response: ResponseLike) {
  const { baseUrl, model } = config();

  if (request.method === 'GET') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      const tags = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (!tags.ok) return response.status(200).json({ ready: false, model });
      const data = (await tags.json()) as { models?: { name?: string }[] };
      const names = (data.models ?? []).map((m) => m.name ?? '');
      const present = names.some((n) => n === model || n.startsWith(model.split(':')[0]));

      // The UI probes once on load, which is a good moment to pull the model
      // into memory: an empty prompt makes Ollama load it and generate
      // nothing. Deliberately not awaited — the badge should appear at once,
      // and if the host tears the process down before this lands the only
      // cost is that the first question pays the load time, which
      // CHAT_TIMEOUT_MS now allows for.
      if (present) {
        void fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: '', keep_alive: KEEP_ALIVE }),
        }).catch(() => undefined);
      }

      return response.status(200).json({ ready: present, model, available: names.slice(0, 12) });
    } catch {
      return response.status(200).json({ ready: false, model });
    }
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const userId = header(request, 'X-Mission-User') || 'anonymous';
  const today = new Date().toISOString().slice(0, 10);
  const current = usage.get(userId);
  const record = current?.day === today ? current : { day: today, count: 0 };
  if (record.count >= DAILY_LIMIT) {
    return response.status(429).json({ error: 'Daily Mission AI limit reached' });
  }

  const body = (typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {}) as {
    question?: string;
    context?: string;
    analyst?: string;
    messages?: ChatMessage[];
  };

  const question = body.question?.trim();
  if (!question || question.length > MAX_QUESTION) {
    return response.status(400).json({ error: 'A question of up to 1200 characters is required' });
  }

  const history: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8)
    : [];

  const userMessage = [
    `MISSION DATA:\n${body.context || '{}'}`,
    body.analyst ? `\nANALYST DRAFT (ground truth — improve the wording, never the numbers):\n${body.analyst}` : '',
    `\nQUESTION:\n${question}`,
  ].join('\n');

  let upstream: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    upstream = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { temperature: 0.4, top_p: 0.9, repeat_penalty: 1.15 },
        messages: [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: userMessage }],
      }),
    });
  } catch {
    // Saying "unreachable" for a timeout sends you debugging the wrong thing.
    const timedOut = controller.signal.aborted;
    return response.status(timedOut ? 504 : 503).json({
      error: timedOut
        ? `Ollama did not answer within ${Math.round(CHAT_TIMEOUT_MS / 1000)}s — the model may still be loading`
        : `Ollama is unreachable at ${baseUrl}`,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    return response.status(502).json({ error: `Ollama request failed with ${upstream.status}` });
  }

  const data = (await upstream.json()) as { message?: { content?: string } };
  const answer = data.message?.content?.trim();
  if (!answer) return response.status(502).json({ error: 'Ollama returned an empty answer' });

  record.count += 1;
  usage.set(userId, record);
  return response.status(200).json({ answer, model });
}
