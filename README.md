# MARSWALK — Layered EVA Planning Map for Human Mars Explorers

**NASA Space Apps Challenge 2026 — "Interplanetary Survival Guide: Martian Map"**

A working planning-and-execution tool for a single Mars surface excursion: layer orbital and
in-situ data over a 4 km × 4 km patch of ground, solve a safe walking route across it, and carry
that same plan into a first-person helmet display.

Every layer is currently a **deterministic synthetic stand-in** behind a clean adapter interface.
Real NASA products drop in behind that interface without a single change to the UI — see
[DATA_TODO.md](./DATA_TODO.md).

---

## The scenario

| | |
|---|---|
| **Location** | Gale Crater, Mount Sharp foothills — the boxwork formations region Curiosity studied in 2025 |
| **Area of interest** | 4 km × 4 km centred on 4.720° S, 137.403° E, worked on a 512 × 512 grid (7.81 m/post) |
| **Objective** | Characterise the boxwork vein network: one groundwater episode or several, and where the system terminates up-slope |
| **Crew** | Two astronauts (EV1 field geologist, EV2 suit systems), optional pressurised rover support |
| **Habitat** | Graded pad on the low northern bench; the ground climbs ~290 m south toward Mount Sharp |
| **Targets** | Five ranked sampling stations, BX-01 through BX-05 |

Boxwork formations are polygonal networks of resistant mineral veins left behind by groundwater.
They are the reason this patch of ground is worth walking across, and — because the ridges stand
proud of eroded bedrock — they are also the reason walking across it is awkward. The whole app is
built around that tension.

---

## Four modes

**PLAN** — the habitat display. Toggleable data layers with per-layer opacity, legend, source
mission/instrument and provenance. Click anywhere for a readout of *every* layer at that point.
Measure tool cuts an elevation profile between two points. The right rail holds the solved EVA:
GO/NO-GO, totals, per-station ETAs, elevation profile, the walk-back chart, and an editable suit
model.

**3D** — the DEM as a terrain mesh with any raster layer draped over it, the traverse drawn as a
glowing line (red where it violates walk-back), hazard polygons outlined on the surface, and a
fly-through that follows the route.

**HUD** — the same terrain from eye height at 78° field of view, with a minimal visor overlay:
heading tape with a bearing bug for the next station, distance and ETA, consumables with the
reserve floor marked, dose accrued and time to the forecast solar particle event, slope and hazard
state underfoot, and the next science task.

**BRIEFING** — objective, crew, a Gantt timeline built from the solved plan, the conditions table
for egress/mid-EVA/ingress, the radiation picture, the science target package, and a layer-by-layer
provenance list.

---

## The route planner

The planner is the centre of the app. It does four things.

### 1. A\* over the DEM grid

Eight-connected A\* across all 262,144 cells, with the cost the brief asks for:

```
cost = distance × (1 + slopePenaltyPerDeg × slope°) + hazardPenalty
```

`hazardPenalty` is `distance × (costFactor − 1)`, so it scales with how far the crew actually walks
through the hazard rather than with the grid resolution. Cells are **barred outright** where slope
≥ 20° (editable) or boulder cover ≥ 50%. Flagged steep ground costs 2.6×, loose sand 4.2×.

### 2. Suit mobility

Walking speed follows Tobler's hiking function, rescaled so level ground equals the configured
suited speed. Peak speed sits at a slight downhill, and steep descent is slower than the flat —
which is what suited field crews actually report.

Consumables are tracked in **hours at nominal workload**, not wall-clock hours. Standing on station
burns 1.00×; walking burns 1.15× plus 1.10× per unit of uphill grade. An 8-hour budget therefore
does not buy 8 hours of climbing, and the difference is exactly what the planner exists to surface.

### 3. The walk-back check

This is the part that matters. At every one of the ~1,000 route samples the crew must be able to
abandon the EVA *on the spot* and reach a safe haven with the mandatory reserve untouched.

Getting that right needs the cost of returning from anywhere, not just from the stations — so the
planner runs a **multi-source Dijkstra from every safe haven** (the habitat, plus the pressurised
rover when it is committed forward), relaxing edges in the direction of travel *toward* the haven.
Climbing out and walking back down are not the same cost, and the return field preserves that
asymmetry. The result is a per-cell consumables-to-home field that the route, the charts, the map
overlay and the HUD all read from.

Route samples past the limit turn **red** — on the 2D map, in the elevation profile, on the 3D line
and in the visor. Turn on the walk-back envelope and the whole AOI is tinted by how much of it is
reachable at all.

### 4. Radiation and space weather

EVA dose is integrated over the actual solved duration from the RAD dose-rate series. If the
forecast solar particle event intersects the EVA window, the plan is NO-GO and the panel offers the
latest egress time that clears it with 30 minutes of pad — one click to apply.

---

## Architecture

```
src/
  data/
    types.ts          LayerAdapter + LayerData contract — the whole seam
    sources.ts        the mock→real switch and every external endpoint (import-free)
    config.ts         THE registry: list of adapters, layer ids, memoised loader
    adapters/         one adapter per data product
      optical.ts        MRO HiRISE / CTX orthoimage
      topography.ts     HiRISE DTM — elevation + derived slope
      thermal.ts        Mars Odyssey THEMIS thermal inertia
      spectral.ts       MRO CRISM mineral units
      radiation.ts      Curiosity RAD dose rate + SPE forecast
      atmospheric.ts    Curiosity REMS weather + dust opacity
      hazards.ts        derived mobility-hazard vectors
      science.ts        science target package
    mock/             deterministic generators behind those adapters
      terrain.ts        the keystone: one seeded 512² DEM
      surface.ts        thermal inertia + mineral units, from the DEM masks
      imagery.ts        orbital basemap, from the DEM hillshade
      environment.ts    RAD + REMS time series
      hazards.ts        hazard polygons traced off the DEM
      science.ts        targets, crew, mission text
  lib/
    geo.ts            local planar frame, areographic conversion
    noise.ts          seeded value noise, fBm, precomputed coarse fields
    raster.ts         grid sampling, colour ramps, grid → PNG
    contour.ts        mask → polygon rings (marching cell edges)
    planner.ts        A*, Dijkstra return field, suit model, plan assembly
    probe.ts          read every loaded layer at one point
    layerImage.ts     LayerData + legend → overlay image (2D and 3D share it)
    format.ts         MLST, durations, distances
  components/         map / plan / three / hud / briefing / ui
  store/useMission.ts single Zustand store
```

### The adapter contract

```ts
interface LayerAdapter {
  id: string; name: string; mission: string; instrument: string;
  kind: 'optical'|'topographic'|'thermal'|'spectral'|'radiation'|'atmospheric'|'hazard'|'science';
  load(): Promise<LayerData>;
  legend: LegendSpec;
  isMock: boolean;
  provenance: string;
  defaultVisible: boolean; defaultOpacity: number; mapRenderable: boolean;
}
```

Two properties make the swap cheap:

- **The legend is the single source of colour truth.** `lib/layerImage.ts` renders any
  `raster-grid` or `categorical-grid` into an overlay using the adapter's own legend stops. Adding
  a layer never means writing rendering code, and the 2D map and the 3D drape can never disagree.
- **Nothing downstream knows whether data is real.** The planner reads grids, the probe reads
  `LayerData`, the HUD reads the plan. `isMock` only drives a badge.

Every layer card in the UI shows its mission, instrument, provenance note and a **MOCK DATA** badge
while `isMock` is true.

### Why the mock data is coherent rather than merely plausible

There is exactly one synthetic surface. `mock/terrain.ts` builds a seeded 512 × 512 DEM from a
regional ramp toward Mount Sharp, broad bedrock undulation, a **jittered-Voronoi boxwork vein
network** (cell boundaries reproduce the polygonal ridge geometry), five impact craters with raised
rims, three boulder fields, three sand patches and a graded habitat pad. It then derives slope,
aspect, hillshade, roughness and the ridge/sand/boulder masks.

Everything else reads those masks. A vein that stands proud in topography is bright in the orbital
image, high in thermal inertia, sulfate-bearing on the mineral map, and a routing cost to the
planner. Clay sits low and north, sulfate climbs south — the actual Gale stratigraphy. That
internal consistency is what makes the tool behave like the real thing: the layers agree because in
reality they would be measuring the same rock.

Same seed in, identical dataset out, every run.

---

## Swapping mock → real

1. Open `src/data/sources.ts`. Paste a product URL you have actually opened into `ENDPOINTS`.
   Nothing is guessed: every endpoint ships as `null` and every adapter falls back to its generator.
2. Flip the matching flag in `USE_REAL_DATA`.
3. Edit that adapter's `load()` to fetch and reshape the product into the `LayerData` variant it
   already returns. Keep the units — the legend, the probe readout and the planner all assume them.
4. Nothing else changes. The badge flips to **LIVE** on its own.

Worked example — the DTM, which the whole app hangs off:

```ts
// src/data/adapters/topography.ts
async load(): Promise<LayerData> {
  if (USE_REAL_DATA.topography && ENDPOINTS.hiriseDtm) {
    const { values, width, height } = await loadDtmResampled(ENDPOINTS.hiriseDtm, AOI.grid);
    return { type: 'raster-grid', width, height, values,
             bounds: { ...BOUNDS_M }, min, max, unit: 'm' };
  }
  …
}
```

Slope, hillshade, hazards, the cost field, the return field and the 3D mesh are all derived from
that same grid, so they follow automatically.

For a tiled basemap (Mars Trek WMTS, CTX global mosaic), point `ENDPOINTS.hirise` at the tile
template and swap the Leaflet `ImageOverlay` in `components/map/MapView.tsx` for a `TileLayer` —
the only UI change any of this requires, and only because tiles are a different transport.

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

```bash
npm run preview
```

Node 20+. The build is fully static — no backend, no API keys, nothing to deploy server-side.

### Deploy to Vercel

The repo is deploy-ready as-is: framework preset **Vite**, build `npm run build`, output `dist`.
`vercel.json` rewrites everything to `/` for client-side routing.

```bash
npx vercel --prod
```

Any static host works identically (Netlify, GitHub Pages, S3) — it is just the `dist` folder.

---

## Notes on the coordinate frame

The map runs on Leaflet with `CRS.Simple`: the AOI is a planar frame in **metres**, latitude =
northing, longitude = easting. That is how Mars raster products are delivered at this scale, it
avoids pretending an Earth datum applies, and it maps the pixel grid 1:1 onto the DEM the planner
runs on. Areographic lat/lon is derived for display and for matching PDS products
(`lib/geo.ts`), using the IAU Mars radius of 3,396,190 m.

## Tech

Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · Leaflet 1.9 (CRS.Simple) · three.js via
react-three-fiber + drei · Zustand. Charts are hand-rolled SVG — no charting dependency. No unused
dependencies.
