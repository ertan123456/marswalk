# MARSWALK — an EVA planning map for the ground Curiosity has actually driven

**NASA Space Apps Challenge 2026 — "Interplanetary Survival Guide: Martian Map"**

Plan one Mars surface excursion across lower Mount Sharp: layer real orbital and in-situ data over a
6.77 × 14.62 km strip of Gale Crater, solve a safe route across it, prove the crew can always get
home, and carry the same plan into a first-person helmet display.

**Live:** https://ertan123456.github.io/marswalk/  
**Mirror:** https://walk-back.vercel.app — note that the `vercel.app` domain is blocked on some networks (see [Deploy](#deploy))  
**Repository:** https://github.com/ertan123456/marswalk

---

## The problem

An EVA is not a hike. A crew on Mars has a fixed amount of consumables, no rescue, and a surface
that is mostly unwalkable. The question a planner has to answer is not "what is the shortest path to
the science?" but:

> At every single step of this traverse, if something fails right now, can these two people still
> reach safety with their reserve intact?

That is a different question, and it is the one this tool is built around. Everything else — the
layers, the 3D view, the visor — exists to support that answer.

## What it does

**PLAN** — the habitat display. Nine toggleable layers with opacity, legend, source and provenance
tag. Click anywhere and get *every* layer's value at that point, each tagged REAL / DERIVED /
MODELED. Measure tool cuts an elevation profile between two points.

**3D** — the real DTM as a terrain mesh with any raster draped over it, clipped to the actual stereo
footprint so no invented cliffs appear. Traverse drawn on it, fly-through along the route.

**HUD** — the same terrain from eye height at 78° field of view: heading tape with a bearing bug,
distance and ETA to the next station, consumables against the reserve floor, dose accrued, time to
the forecast solar particle event, slope and hazard underfoot.

**BRIEFING** — objective, crew, a Gantt timeline built from the solved plan, conditions at egress /
mid-EVA / ingress.

**DATA** — every source, its provenance tag, its link, the sources we checked and rejected with the
reason, and the accessibility notes.

**Mission AI** — a panel in PLAN that answers questions about the plan on screen in plain language:
*why is this GO, explain the walk-back, where should the habitat land, what changes with the rover,
how much of this is real.* It explains; it does not compute. See [Mission AI](#mission-ai) below.

A **Guided demo** button auto-plays a 60-second tour of all of it — layers, the GO verdict, the
walk-back failure, rover mode, 3D and the visor — and restores the state it started from when it
ends. Keyboard: `1`–`5` switch modes, `G` runs the demo, `M` measure, `W` the return-to-safety
field, `L` the layer rail, `Esc` cancels.

### The two things that make it a planner rather than a map

**The walk-back check.** At every one of ~1,000 route samples the crew must be able to abandon the
EVA on the spot and reach a safe haven with the mandatory reserve untouched. Getting that right
needs the cost of returning from *anywhere*, not just from the stations, so the planner runs a
multi-source Dijkstra from every safe haven, relaxing edges in the direction of travel *toward* the
haven — climbing out and walking back down are not the same cost. Samples past the limit turn red on
the map, in the elevation profile, on the 3D line and in the visor.

**Mobility modes.** On foot, or rover-assisted. The rover is not simply a faster crew member: it is
barred from steeper ground than the crew is (15° against 25°) and from broken ground a walker can
pick through. That asymmetry creates *drop-off points* — the planner drives as far as the rover can
go, dismounts the crew, walks them in, and treats the waiting rover as a safe haven, because
reaching it ends the emergency.

| three stations, default plan | distance | duration | consumables left | verdict |
|---|---|---|---|---|
| On foot | 7.92 km | 4:51 | 30% | GO |
| Rover-assisted | 10.20 km | 3:54 | 62% | GO |

The rover route is *longer* — the 15° limit forces real detours around Mount Sharp's flank — and
still an hour quicker and twice as cheap in consumables.

**A finding worth stating plainly:** walking Curiosity's full six-station traverse in one EVA is not
possible. It is 17.07 km on foot and needs 11.44 h of consumables against an 8 h budget. Rover
assistance takes it from five flight-rule violations to three, but does not make it legal. The
default plan is therefore the lower three stations; the upper ones are one click away and correctly
come back NO-GO.

---

## Mission AI

A planner that outputs a verdict and six numbers still needs someone to read it. The **Mission AI**
panel answers questions about the plan currently on screen — in whichever language they are asked.

It runs on one of **two engines**, and the panel's badge always says which one answered:

| Badge | Engine | Availability |
|---|---|---|
| `local analyst` | Deterministic analysis in the browser | Always. No install, no network, no model. |
| `llama3.2:3b` | A local language model via `/api/mission-assistant` | When that endpoint is reachable. |

### The model does not calculate

Every distance, duration, consumable figure, walk-back margin, dose and GO/NO-GO verdict is computed
by `lib/planner.ts` and `lib/missionInsights.ts`. The assistant is handed those results and asked to
explain them. That is enforced in three places:

1. `buildAssistantContext()` is the **only** thing the model receives. A number that is not in that
   object is a number the model does not have.
2. The system prompt tells the model to quote the supplied figures exactly and to answer "not
   computed" rather than estimate.
3. The deterministic answer is computed first, every time, and sent along as **ground truth** — the
   model is asked to improve the wording, never the numbers.

So when the model is unreachable the numbers do not change; only the prose gets plainer. The
fallback is not a degraded mode, it is the same answer written by a simpler author. This matters for
a data-provenance challenge: an assistant that did its own arithmetic would be a fourth provenance
class nobody could audit.

**The published site always shows `local analyst`.** GitHub Pages serves static files and runs no
server code, and no cloud function could reach an Ollama on a laptop anyway. To demo the model, run
`npm run dev` on the same machine as Ollama — setup in [`AI_SETUP.md`](./AI_SETUP.md).

One thing the assistant adds rather than explains: asked where the habitat should land, it searches
the real DEM — every candidate cell on a 9-cell stride, scored on mean slope, local relief, walkable
neighbourhood and distance to the science centroid, keeping the best few at least 700 m apart. That
is a DERIVED result and labelled as one.

---

## The area of interest

| | |
|---|---|
| **Where** | Gale Crater, lower Mount Sharp — 137.353°E to 137.468°E, 4.676°S to 4.923°S |
| **Why there** | It is the footprint of the HiRISE stereo DTM that covers Curiosity's real traverse |
| **Size** | 6.77 × 14.62 km, worked on a 474 × 1024 grid at ~14.3 m/cell |
| **Relief** | −4406 m to −2271 m on the areoid: 2.13 km of climb |
| **Ground truth** | 1,039 surveyed rover positions, sols 1167 – 5073 |
| **Passable** | 58.4% of the AOI is walkable by suited crew; 25.2% has no stereo coverage at all |

The six science stations are pinned to positions Curiosity was *actually surveyed at*, each labelled
with its sol: Glen Torridon clay unit (2300) → Greenheugh Pediment (2700) → sulfate-bearing unit
(3504) → Gediz Vallis Ridge (3899) → Gediz Vallis Channel (4301) → boxwork region (4893).

They are ordered by sol, which is also ascending elevation. That differs from the order in the
original brief, which put the sulfate unit after the Gediz Vallis features; on the real traverse
Curiosity entered the sulfate unit first. Walking order follows the ground.

---

## Data sources

Every endpoint was opened and probed before use. What each probe returned is recorded next to it in
[`scripts/sources.json`](./scripts/sources.json), along with a `rejected` section for the sources we
checked and did **not** use.

| Layer | Provenance | Product | Source |
|---|---|---|---|
| Elevation | **REAL** | HiRISE stereo DTM `DTEEC_009149_1750_009294_1750_U01`, 32-bit float, 1.01 m/post | [HiRISE DTM archive](https://www.uahirise.org/dtm/) |
| Orbital basemap | **REAL** | `curiosity_hirise_mosaic`, 78 WMTS tiles at zoom 13 (~5.1 m/px) | [NASA Mars Trek](https://trek.nasa.gov/mars/) |
| Curiosity's driven path | **REAL** | MSL waypoints + traverse GeoJSON | [NASA MMGIS](https://mars.nasa.gov/msl/mission/where-is-the-rover/) |
| Station ground views | **REAL** | 18 Navcam/Mastcam frames near each station's sol | [MSL raw images](https://mars.nasa.gov/msl/multimedia/raw-images/) |
| Slope | **DERIVED** | Horn 3×3 on the real DTM at its true 14.29 × 14.27 m baseline | — |
| Mobility hazards | **DERIVED** | Slope + detrended relief against EVA flight rules | — |
| Science regions | **DERIVED** | Corridors from the rover's own traverse, by sol window | [Proposed Path figure](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) |
| Radiation | **MODELED** | Surface dose rate from published Curiosity RAD results | [Hassler et al. 2014](https://doi.org/10.1126/science.1244797) |
| Surface weather | **MODELED** | Daily cycle from published REMS values | [REMS](https://mars.nasa.gov/msl/spacecraft/instruments/rems/) |

**What the tags mean.** REAL = downloaded from a NASA/USGS product. DERIVED = computed by us from
REAL data. MODELED = built from published measurements, not ingested telemetry. Nothing DERIVED or
MODELED is presented as a raw measurement anywhere in the app.

### Things we checked and did not use

- **Trek's `Gale_DEM_SMG_1m`** — Trek serves it as 8-bit greyscale PNG tiles: a whole z=14 tile holds
  about five distinct grey levels, roughly 14 m of elevation per level once stretched over Gale's
  relief. Fine as a picture, unusable for slope or hazard derivation. Replaced by the PDS float DTM.
- **USGS SIM 3292 global geologic map** — the only geologic map covering this AOI, and it is global
  at 1:20,000,000. One millimetre on that map is 20 km; the entire AOI is smaller than a single unit.
  Drawing it would imply detail the product cannot support, so there is no geology layer.
- **MOLA 463 m global DEM** — real and reachable, but gives ~15 × 32 pixels over this AOI.
- **NASA Worldview** — Earth data. Used only as design inspiration for the layer-panel interaction,
  credited on the DATA page. No Earth data is on the Mars map.
- **Perseverance raw images** — Mars 2020 is in Jezero, not Gale. Listed as a related resource only.

---

## The pipeline

Everything runs offline and writes static assets to `public/data`, so the app makes **no network
call to NASA at demo time**. Total shipped data: 6.6 MB.

```bash
cd scripts
python fetch_dem.py        # REAL    HiRISE DTM -> heightmap.png + meta.json
python fetch_ortho.py      # REAL    Trek WMTS tiles -> basemap.webp
python fetch_traverse.py   # REAL    MMGIS GeoJSON -> waypoints + path
python derive_terrain.py   # DERIVED slope, ruggedness, hazard classes
python derive_regions.py   # DERIVED science-region corridors
python fetch_pov.py        # REAL    Curiosity frames per station
```

Requires Python 3.11+ with `numpy`, `pillow`, `requests`. No GDAL — the PDS reader is ~120 lines in
`scripts/common.py`.

**Two details worth knowing.** The source DTM is 390 MB; we never download it. The server supports
HTTP range requests, so the pipeline reads the PDS label, works out the byte offset of each image
row, and pulls only the ~1,000 rows the AOI needs. And the heightmap ships as an RGB PNG with
elevation split across two channels and the stereo coverage mask in the third — a 16-bit greyscale
PNG loses its low byte the moment a browser draws it to a canvas, which would quantise 2.13 km of
relief to ~8 m steps.

---

## Run it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

Node 20+. The build is fully static: no backend, no API keys, nothing to deploy server-side. The
`api/` endpoint is optional — it only adds the local-model engine for Mission AI, and the app is
complete without it. See [`AI_SETUP.md`](./AI_SETUP.md).

## Deploy

The app deploys to **two** hosts on every push to `main`, and is static either way — no backend, no
API keys, nothing server-side.

**GitHub Pages** (primary) — `.github/workflows/pages.yml` builds and publishes automatically. The
workflow sets `PAGES_BASE=/marswalk/` because Pages serves from a project subpath; every static
asset loads through `import.meta.env.BASE_URL`, so nothing else changes.

**Vercel** (mirror) — framework preset **Vite**, build `npm run build`, output `dist`.
`vercel.json` rewrites everything to `/`. Vercel sets no `PAGES_BASE`, so it serves from the root.

```bash
npx vercel --prod
```

**Why two.** The `vercel.app` domain could not be reached from the network this was built on: DNS
resolved to real Vercel addresses and TCP 443 connected, but the TLS handshake returned
`WRONG_VERSION_NUMBER`. An unrelated `vercel.app` project on the same account failed identically
while `github.com` and `trek.nasa.gov` negotiated TLS 1.3 cleanly, so the interference is with the
whole domain rather than this deployment. Pages is the link to hand to anyone; the Vercel one is
kept as a mirror.

Any static host works — it is just the `dist` folder.

---

## Architecture

```
scripts/           the offline data pipeline (Python)
  sources.json     every endpoint, what the probe returned, and what we rejected
  common.py        PDS3 label parser + HTTP range reader
src/
  data/
    types.ts       LayerAdapter + LayerData contract — the seam
    config.ts      THE registry: every layer, its provenance, the memoised loader
    adapters/      one adapter per product
    real/          loaders for the shipped assets (terrain, science, POV)
    models/        the MODELED environment series
  lib/
    geo.ts         the AOI frame; planner.ts A* + Dijkstra + mobility models
    missionInsights.ts  DERIVED analysis + the deterministic analyst
    missionAI.ts   engine detection, the two-engine ask, the daily cap
    png.ts         canvas PNG decode; raster.ts sampling and colour ramps
  components/      map / plan / three / hud / briefing / about / ai / ui
  store/           single Zustand store
api/
  mission-assistant.ts  optional Ollama bridge — no mission arithmetic in it
```

Adding a layer means writing an adapter and pushing it into `LAYER_REGISTRY`. The adapter's legend
is the single source of colour truth — `lib/layerImage.ts` renders any grid layer from its legend
stops, so the 2D map and the 3D drape cannot disagree, and the DATA page builds itself from the
registry so it cannot drift out of date.

---

## Accessibility

A console for two displays and a visor has to stay legible to the person reading it, so:

- **Nothing is signalled by colour alone.** Walk-back violations are red *and* switch to a short
  dash pattern at heavier weight; the legend names the dash, not just the colour. Hazard classes
  carry their class name in the click readout. GO / NO-GO is a word before it is a colour.
- **Keyboard throughout.** `1`–`5` switch modes, `G` runs the guided demo, `M` measure, `W` the
  return-to-safety field, `L` the layer rail, `Esc` cancels. Every control is reachable by `Tab` and
  draws a visible focus ring (`:focus-visible`, so it does not fire on mouse clicks).
- **Screen readers.** Landmark roles on the rails and the map, `aria-label` on icon-only controls,
  `aria-pressed` on the station and layer toggles so state is announced, and `.sr-only` labels on
  the inputs that are visually labelled by context. The NASA reference figure carries full
  descriptive alt text.
- **`prefers-reduced-motion`** removes the fly-through easing, the panel transitions and the guided
  demo's animated camera; the demo still advances through its beats, it just cuts between them.
- **`forced-colors`** (Windows high-contrast) is honoured: borders and focus rings switch to system
  colours instead of disappearing, and the layer legends fall back to their text labels.

Not solved: the 3D terrain and the visor are inherently visual, and a canvas has no accessible
equivalent for "this slope is 22°" beyond the numeric readouts that accompany them — which is why
every figure on the HUD is also text in PLAN. The DATA page lists this openly rather than claiming
a clean bill.

---

## Limitations

- At ~14.3 m/cell a DEM cannot resolve metre-scale boulders. The ruggedness term in the hazard layer
  is an index, **not** a rock count, and is labelled as such everywhere.
- 25.2% of the AOI is outside the stereo swath. Those cells are filled so the terrain stays
  continuous, flagged in the coverage mask, and barred by the planner — the crew is never routed
  across ground we have no data for.
- Science-region corridors show where the rover *worked* each unit, not where the unit ends. They
  were built from the traverse rather than traced off the NASA annotated figure, because that figure
  publishes no georeferencing control points and eyeballed boundaries are not defensible.
- Radiation and weather are modelled, and the solar particle event is an illustrative scenario,
  labelled as one.
- Suit and rover constants are plausible and editable, but not taken from a published vehicle spec.

## Future work

- Mosaic a second HiRISE DTM to fill the stereo gaps at the AOI edges.
- Replace the modelled RAD and REMS series with the PDS tables for a chosen sol.
- Serve the model engine from a hosted inference API so the published site can use it too.
- Split an infeasible plan into a two-EVA campaign automatically.

---

## AI tools used

Built with **Claude (Anthropic)** as a pair programmer: data-source research and verification,
the Python pipeline, the TypeScript application, and the DATA page. Every external endpoint was
opened and probed before use rather than guessed, and the probe results are committed in
`scripts/sources.json`.

Several design decisions came directly out of checking the data instead of trusting the first
result — the Trek DEM rejection, the detrended roughness metric, the sky-polarity of raw Navcam
frames, and the discovery that the full traverse is not walkable. The commit history records each
one with its evidence.

## Credits and compliance

Data: NASA/JPL-Caltech; NASA/JPL-Caltech/University of Arizona (HiRISE); NASA/JPL-Caltech/MSSS
(Mastcam); USGS.

This project is **not affiliated with, endorsed by, or sponsored by NASA**. No NASA logo, insignia or
mission identifier is used as branding. NASA data is used under its open data policy and credited at
every point of use.

## Tech

Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · Leaflet 1.9 (CRS.Simple) · three.js via
react-three-fiber + drei · Zustand · Python 3.11 (numpy, pillow, requests). Charts are hand-rolled
SVG. No unused dependencies.
