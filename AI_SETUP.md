# Mission AI — setup and design

MARSWALK has an assistant panel that explains the plan. It runs on **two engines**, and the panel
always shows which one answered.

| Engine | Where it runs | When it is used |
|---|---|---|
| **Local analyst** | In the browser | Always available. No install, no network, no model. |
| **Ollama** | A local language model behind `/api/mission-assistant` | When that endpoint is reachable. |

## The rule that matters

**The model does not calculate.** Every distance, duration, consumable figure, walk-back margin,
dose and GO/NO-GO verdict is computed by `src/lib/planner.ts` and `src/lib/missionInsights.ts`. The
assistant is handed those results and asked to explain them.

This is enforced in three places:

1. `buildAssistantContext()` in `src/lib/missionInsights.ts` is the *only* thing the model is given.
   If a number is not in that object, the model does not have it.
2. The system prompt in `api/mission-assistant.ts` says so explicitly, and tells the model to say
   "not computed" rather than estimate.
3. The deterministic analyst answer is computed first, every time, and sent along as **ground
   truth**. The model is asked to improve the wording, never the numbers.

So if the model is unreachable, the numbers do not change — only the prose gets plainer. That is why
the fallback is not a degraded mode; it is the same answer, written by a simpler author.

## Running it locally with Ollama

```bash
ollama pull llama3.2:3b
```

```bash
ollama serve
```

Copy `.env.example` to `.env` and adjust if your Ollama is not on the default port:

```
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
```

A stronger machine can use `qwen2.5:7b` or `llama3.1:8b` — change `OLLAMA_MODEL` to match what you
pulled.

`npm run dev` serves `api/` itself: `vite-api-dev.ts` is a dev-only Vite plugin that mounts every
handler in that directory through `ssrLoadModule`, so the endpoint is type-checked and hot-reloaded
like the rest of the source and no second CLI is needed. It contributes nothing to the bundle
(`apply: 'serve'`). The handler is also a standard serverless function, so `vercel dev` or any Node
host that mounts `api/` works unchanged.

Confirm it is up:

```bash
curl http://localhost:5181/api/mission-assistant
```

`{"ready":true,"model":"llama3.2:3b"}` means the panel will use the model. `"ready":false` means
Ollama is not running or the model is not pulled, and the panel will say `local analyst`.

The panel probes `GET /api/mission-assistant` on load. If that returns `{ ready: true }` the badge
reads the model name; otherwise it reads **local analyst**.

## Why the published site always says "local analyst"

The live site is on GitHub Pages, which serves static files and runs no server code. There is no
`/api` route there, so the probe fails and the analyst answers — correctly and with the same
numbers.

Even on a host that *does* run the function, a cloud function cannot reach an Ollama running on
someone's laptop. Making the hosted site use a real model would mean a hosted inference API and an
API key, and a key cannot be shipped inside a static bundle.

**For a live demo with the model:** run `npm run dev` (or `vercel dev`) on the same machine as
Ollama. The badge will show `llama3.2:3b` and the answers will be model-written.

## Daily limit

Ten questions per day. The browser keys the count on a random local id in `localStorage`, and the
endpoint applies the same limit per `X-Mission-User`.

Both are advisory. The browser count is editable by anyone with devtools, and the server count lives
in one process's memory and resets on a cold start. For real use this needs an authenticated
identity and a shared store such as Redis — the current version is sized for a demo and says so.

There is deliberately **no login**. An earlier draft gated the whole app behind a name and email
form; that stopped anyone evaluating the project at a form, collected an address for no purpose, and
was not security in any case, since the session was just a `localStorage` entry.

## What the assistant can answer

The analyst routes a question by intent — walk-back, consumables, radiation, rover, landing sites,
terrain, science stations, data provenance — and answers from the facts that bear on it. The
suggested questions in the panel are a good tour:

- *Why is this plan GO?*
- *Explain the walk-back check*
- *Where should the habitat land?* — searches the real DEM for landing pads
- *What changes if I use the rover?*
- *How much of this data is real?*

## Credit

The Ollama bridge, the daily-limit idea and the landing-site concept came from a teammate's
contribution. The landing-site search was rewritten against the real DEM: the original scored five
hand-placed coordinates chosen for an earlier 4 × 4 km area of interest, which do not correspond to
anything in the current one.
