# DATA_TODO — real datasets to plug in after 13 Nov

Every layer in MARSWALK currently runs on a deterministic synthetic stand-in. This is the list of
what replaces each one, where it comes from, and what has to be true about it for the app to accept
it unchanged.

**Ground rules**

- No endpoint is hard-coded anywhere. `src/data/sources.ts` holds `ENDPOINTS` (all `null`) and
  `USE_REAL_DATA` (all `false`). Paste in a URL you have actually opened; flip the flag; edit that
  one adapter's `load()`.
- Keep the units. The legend, the probe readout, the planner cost function and the consumables
  model all assume them.
- Keep the AOI. Everything is clipped and resampled to the 4 km × 4 km frame at 512 × 512
  (7.81 m/post) defined in `src/lib/geo.ts`. Change `AOI` there if the real coverage forces it —
  one constant, everything follows.
- The DTM is the keystone. Slope, hillshade, hazard polygons, the A\* cost field, the walk-back
  return field and the 3D mesh are all derived from it. Do that one first.

---

## Priority order

| # | Layer | Adapter | Endpoint key | Flag | Why this order |
|---|---|---|---|---|---|
| 1 | HiRISE DTM | `topography.ts` | `hiriseDtm` | `topography` | Everything geometric derives from it |
| 2 | HiRISE / CTX basemap | `optical.ts` | `hirise` / `ctx` | `optical` | The thing people look at |
| 3 | Curiosity RAD | `radiation.ts` | `radDoseRate` | `radiation` | Drives GO/NO-GO |
| 4 | Curiosity REMS | `atmospheric.ts` | `remsEnvironmental` | `atmospheric` | Drives the EVA window |
| 5 | THEMIS thermal inertia | `thermal.ts` | `themisThermalInertia` | `thermal` | Best proxy for footing |
| 6 | CRISM mineral units | `spectral.ts` | `crismSummary` | `spectral` | The science case |
| 7 | Curiosity raw images | `science.ts` | `mslRawImages` | `science` | Fills the ground-view slots |
| 8 | Hazard GeoJSON | `hazards.ts` | `hazardGeoJson` | `hazards` | Only if a reviewed product exists |

---

## 1. MRO HiRISE stereo DTM (DTEEC)

- **Stands in for:** `src/data/mock/terrain.ts` — the entire synthetic surface.
- **Source:** the HiRISE DTM archive at the University of Arizona, and the PDS Geosciences Node.
  Look for a DTEEC product whose footprint covers the Mount Sharp boxwork region near
  4.72° S / 137.40° E. Gale has dense HiRISE stereo coverage along Curiosity's traverse.
- **Format:** `.IMG` (PDS) or GeoTIFF, ~1 m/post, heights relative to the Mars areoid (MOLA datum).
- **Returns:** `{ type: 'raster-grid', values: Float32Array, width, height, bounds, min, max, unit: 'm' }`
- **Work needed:**
  - Clip to the AOI footprint and resample to 512 × 512. A nearest/bilinear resample is fine at
    7.8 m from a 1 m product.
  - Fill or mask no-data posts — A\* treats `NaN` as impassable only if you make it so. Decide
    explicitly in `buildCostField`.
  - Confirm the vertical datum. If the product is ellipsoid-referenced, offset it; the elevation
    legend is written for areoid heights around −4,500 to −4,200 m.
  - Recompute slope with Horn's method at the **real** post spacing. The constant lives in
    `lib/geo.ts` (`CELL_M`).
- **Watch for:** a real DTM is noisier than the synthetic one. Slope at 7.8 m baseline will show
  more cells above 15°, which will make the hazard layer denser and routes longer. That is correct
  behaviour, not a bug — but re-check that a route still exists at the default 20° slope limit.

## 2. MRO HiRISE RED orthoimage / CTX mosaic

- **Stands in for:** `src/data/mock/imagery.ts`.
- **Source:** the RDRV11 map-projected HiRISE products for the same footprint, and the global CTX
  mosaic for anything outside it. **Mars Trek** publishes both as tiled services — that is the
  easiest path, and also the one that changes the most code.
- **Format:** map-projected JP2/GeoTIFF/PNG, 25 cm/px (HiRISE) or ~5 m/px (CTX).
- **Returns:** `{ type: 'raster-image', url, width, height, bounds }`
- **Work needed:**
  - Single image: set `ENDPOINTS.hirise` to a map-projected image already clipped to the AOI. No UI
    change — the Leaflet `ImageOverlay` and the 3D drape both take it as-is.
  - Tiles: point `ENDPOINTS.hirise` at the WMTS/XYZ template and swap the `ImageOverlay` for a
    `TileLayer` in `components/map/MapView.tsx`. The 3D drape still needs a single stitched image,
    so render one offline, or keep the hillshade for the drape.
  - Byte-stretch the single-band product. The mock applies an S-curve; a real RDR usually needs a
    2%–98% percentile stretch.
- **Watch for:** HiRISE RED is single-band. Colour (IRB) only covers the central swath.

## 3. Curiosity RAD — surface dose rate

- **Stands in for:** `src/data/mock/environment.ts` → `getRadiation()`.
- **Source:** PDS Planetary Plasma Interactions (PPI) node, MSL RAD RDR tables.
- **Format:** tabular, ~15–30 min cadence, dose rate in µGy/day in the detector; conversions to
  tissue dose equivalent are documented with the product.
- **Returns:** `{ type: 'timeseries', samples: [{ hour, doseRate, cumulative }], series, events }`
- **Work needed:**
  - Convert µGy/day → **mGy/day** (divide by 1000). The baseline should land near 0.6–0.7 mGy/day;
    if it does not, the conversion is wrong.
  - Map timestamps to local mean solar time on the chosen sol, 0–24.66 h.
  - Keep `events` — that array is where a real space-weather alert is injected. The synthetic SPE in
    `SPE_EVENT` is a placeholder for a forecast feed, not for RAD telemetry, and should stay clearly
    labelled as a forecast even once RAD itself is live.
- **Watch for:** RAD data is sol-indexed, not Earth-date indexed. Pick the sol first, then pull.

## 4. Curiosity REMS — surface weather

- **Stands in for:** `src/data/mock/environment.ts` → `getWeather()`.
- **Source:** PDS Atmospheres Node, MSL REMS ENVRDR (environmental RDR) tables. Column dust opacity
  comes separately, from Mastcam direct-sun imaging.
- **Format:** tabular, hourly, with per-sample confidence flags.
- **Returns:** `{ type: 'timeseries', samples: [{ hour, airTempC, groundTempC, pressurePa, windMs, windDirDeg, tau }], series, events }`
- **Work needed:**
  - Keep the series keys. The briefing table and both charts index by name.
  - REMS wind sensors were damaged early in the mission — wind may be missing for your sol. Either
    pick a sol with coverage, or drop the wind series from `series` and the chart will omit it.
  - `tau` is a separate product. If unavailable, hold it constant and say so in `provenance`.
- **Watch for:** air temperature is measured at 1.6 m boom height; ground temperature is IR surface
  brightness. They are not interchangeable and the suit thermal story uses the ground value.

## 5. Mars Odyssey THEMIS — thermal inertia

- **Stands in for:** `src/data/mock/surface.ts` → `getThermalInertia()`.
- **Source:** ASU's THEMIS data node / PDS. Global derived thermal inertia products exist at
  ~100 m/px; regional night-time IR is available at ~100 m/px and can be inverted.
- **Format:** raster, SI thermal inertia (J m⁻² K⁻¹ s⁻½).
- **Returns:** `{ type: 'raster-grid', values, width, height, bounds, min, max, unit }`
- **Work needed:**
  - Upsample ~100 m/px onto the 7.8 m grid. **Say so in `provenance`** — the probe readout will
    otherwise imply a precision the product does not have.
  - Confirm units. Some products ship in cgs; the legend is written for SI (roughly 60–1,100).
- **Watch for:** at 100 m/px a single pixel spans several boxwork polygons, so the crisp
  ridge-following pattern in the mock will not survive. That is a real limitation worth stating in
  the demo rather than hiding.

## 6. MRO CRISM — mineral units

- **Stands in for:** `src/data/mock/surface.ts` → `getMineralUnits()`.
- **Source:** PDS Geosciences Node, CRISM targeted observations (FRT/HRL) over Gale, plus the
  published summary-parameter browse products.
- **Format:** multiband rasters of summary parameters, ~18 m/px targeted.
- **Returns:** `{ type: 'categorical-grid', codes: Uint8Array, categories, width, height, bounds }`
- **Work needed:**
  - Pick parameters per unit — e.g. a sulfate indicator, `D2300` for phyllosilicates, `BD530` for
    ferric oxides — threshold them, and resolve overlaps into one code per cell.
  - Keep the four existing categories, or edit `MINERAL_CATEGORIES`; the legend, the probe and the
    3D drape all read that array.
  - Document the thresholds in `provenance`. A classification is an interpretation, and the UI
    already says so.
- **Watch for:** CRISM targeted coverage is patchy. Expect holes over the AOI — add an
  "unclassified / no coverage" category rather than silently filling.

## 7. Curiosity raw images — ground-level views

- **Stands in for:** the `groundViewSlot` placeholder on each `SciencePoint`.
- **Source:** the NASA MSL raw-image API, queryable by sol and camera (Mastcam, Navcam, MAHLI).
- **Work needed:**
  - Set `ENDPOINTS.mslRawImages` to the query endpoint.
  - Resolve each waypoint to a real frame: match by sol + camera + approximate look direction, or
    hand-pick a frame id per target.
  - Add `url` to `groundViewSlot` and render it in `components/plan/PlanPanel.tsx` →
    `SelectedTarget`, which already reserves a 16:9 slot and shows the pending caption.
- **Watch for:** requires network access at runtime — the first thing in this app that does.
  Degrade to the placeholder on failure; do not let a dead image break the panel.

## 8. Reviewed mobility-hazard GeoJSON

- **Stands in for:** `src/data/mock/hazards.ts`.
- **Source:** there is no public product for this. In flight it is an analyst-reviewed layer built
  from the DTM slope map plus a HiRISE rock-abundance product.
- **Returns:** `{ type: 'vector', features: VectorFeature[], bounds }`
- **Work needed:**
  - Simplest honest path: keep tracing hazards from the **real** DTM once it is in. The tracer in
    `lib/contour.ts` is product-agnostic — it takes a boolean mask and returns rings.
  - If a real GeoJSON arrives, map its attributes onto `costFactor` and `passable`. The A\* planner
    reads those two fields directly.
- **Watch for:** keep boulder fields `passable: false`. The whole walk-back argument depends on the
  planner not routing suited crew through metre-scale blocks.

---

## Also worth doing, in rough value order

- **Mars Trek tile services** as an alternative basemap and context layer — the easiest big visual
  win, at the cost of a `TileLayer` swap.
- **MOLA regional topography** as a wide-area context inset, so the AOI is visibly a 4 km patch of
  a 154 km crater.
- **A real space-weather feed** for the SPE forecast, replacing `SPE_EVENT`. This is the one piece
  of the app that is genuinely speculative rather than merely synthetic, and it should keep saying
  so until a feed backs it.
- **Curiosity traverse path** as a layer — the actual rover route through the boxwork region, for
  ground truth against the planner's choices.
- **A suit-consumables model with a citation.** The current constants are plausible and editable,
  not sourced. Swapping them for published xEMU figures would make the GO/NO-GO call defensible.

---

## How to tell it worked

After each swap, in PLAN mode:

1. The layer card badge reads **LIVE**, not **MOCK DATA**.
2. Clicking the map returns a sane value for that layer in the readout, with the right unit.
3. The GO/NO-GO call still resolves and the route still draws end-to-end.

If (3) fails after the DTM swap, it is almost always the no-data handling or the slope limit — check
`buildCostField` in `lib/planner.ts` first.
