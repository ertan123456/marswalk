/**
 * Geochemical units from MRO CRISM.
 *
 * PROVENANCE: DERIVED, from REAL data. The indices are published CRISM MTRDR
 * summary parameters — 32-bit float spectral indices computed by the
 * instrument team — resampled onto the AOI grid. The unit boundaries are ours:
 * a cell joins a unit where a parameter exceeds its own scene's background by
 * four robust standard deviations.
 *
 * This is the layer the mentor asked for, and it is also the layer that most
 * needs its limits stated on its own card. It is not a mineral map. A spectral
 * index measures the shape of a spectrum, not how much of a mineral is there,
 * and the pipeline's own validation records that these units do NOT reproduce
 * Mount Sharp's published clay-below-sulfate ordering. So the card says what
 * the layer is for: finding ground worth walking to, not naming what is in it.
 *
 * Only 2.3% of the AOI falls in any unit. The rest is dust-mantled and gets no
 * ink — the background class is `unpainted`, for the same reason the nominal
 * hazard class is.
 */

import { BOUNDS_M } from '../../lib/geo';
import { loadJson, loadPixels } from '../../lib/png';
import type { CategoryDef, LayerAdapter, LayerData } from '../types';

export interface GeochemUnitDef {
  code: number;
  key: string;
  label: string;
  color: string;
  mineralogy: string;
  water_story: string;
  bands: string[];
  cells: number;
  percent_of_aoi: number;
  area_km2: number;
  strongest_index_value?: number;
  median_index_value?: number;
  elevation_m?: { min: number; median: number; max: number };
  cells_at_18m?: number;
  cells_at_36m?: number;
  within_science_regions_percent?: Record<string, number>;
}

export interface GeochemValidationCheck {
  question: string;
  verdict: string;
  clay_below_sulfate?: boolean;
  excess_over_control?: number | null;
  steep_over_flat_ratio?: number | null;
}

export interface GeochemUnitsMeta {
  provenance: string;
  derived_from: {
    product_type: string;
    scenes: { product_id: string; source_url: string; map_scale_m_per_px: number }[];
    provenance: string;
    credit: string;
    reference: string;
  };
  method: string;
  why_per_scene: string;
  caveat: string;
  what_this_layer_is_good_for: string;
  validation: Record<string, GeochemValidationCheck>;
  scene_consistency: { spread: number; note: string };
  sigma_k: number;
  credibility_floor: number;
  classified_percent_of_aoi: number;
  grid: { width: number; height: number };
  background: { code: number; key: string; label: string; color: string; detail: string };
  units: GeochemUnitDef[];
  credit: string;
}

let metaCache: GeochemUnitsMeta | null = null;
let codeGrid: { codes: Uint8Array; w: number; h: number } | null = null;

export function geochemMeta(): GeochemUnitsMeta | null {
  return metaCache;
}

/** Unit definition for a class code, or undefined for the background class. */
export function geochemUnitFor(code: number): GeochemUnitDef | undefined {
  return metaCache?.units.find((u) => u.code === code);
}

export function geochemUnitByKey(key: string): GeochemUnitDef | undefined {
  return metaCache?.units.find((u) => u.key === key);
}

/**
 * Unit code at a grid cell, or 0 where no parameter stands out.
 *
 * Exported because the investigation model has to ask what a station is
 * standing on, and that has to come from the shipped raster rather than from a
 * second table that could drift away from it.
 */
export function geochemCodeAt(col: number, row: number): number {
  if (!codeGrid) return 0;
  const { codes, w, h } = codeGrid;
  if (col < 0 || row < 0 || col >= w || row >= h) return 0;
  return codes[row * w + col];
}

export function geochemLoaded(): boolean {
  return codeGrid !== null;
}

export const geochemAdapter: LayerAdapter = {
  id: 'geochem-units',
  name: 'Geochemical units',
  mission: 'Mars Reconnaissance Orbiter',
  instrument: 'CRISM MTRDR summary parameters',
  kind: 'spectral',
  group: 'Geology & Minerals',
  provenance: 'DERIVED',
  sourceNote:
    'Published CRISM summary parameters at 18 m/px (36 m/px where the full-resolution scene ' +
    'stops short), grouped into units where an index exceeds its own scene’s background by 4 ' +
    'robust standard deviations. Covers 2.3% of the AOI; the rest is dust-mantled and left ' +
    'unshaded. Not a mineral map: an index measures the shape of a spectrum, not how much of a ' +
    'mineral is present, and these units do not reproduce Mount Sharp’s published ' +
    'clay-below-sulfate ordering. Read a unit as ground worth walking to, not as an answer.',
  sourceUrl:
    'https://pds-geosciences.wustl.edu/missions/mro/crism.htm',
  credit: 'Derived by MARSWALK from NASA/JPL-Caltech/JHU-APL MRO CRISM data',
  // On by default, unlike the science regions: it paints only 2.3% of the map,
  // so it adds information without competing with the imagery underneath.
  defaultVisible: true,
  defaultOpacity: 0.85,
  mapRenderable: true,
  legend: { type: 'categorical', items: [] },
  async load(): Promise<LayerData> {
    const meta = await loadJson<GeochemUnitsMeta>('data/geochem/units.json');
    metaCache = meta;
    const px = await loadPixels('data/geochem/units.png');

    const codes = new Uint8Array(px.w * px.h);
    for (let i = 0; i < codes.length; i++) codes[i] = px.data[i * 4];
    codeGrid = { codes, w: px.w, h: px.h };

    const categories: CategoryDef[] = [
      ...meta.units.map((u) => ({
        code: u.code,
        label: u.label,
        color: u.color,
        note:
          `${u.bands.join(', ')} · ${u.area_km2} km² · ${u.percent_of_aoi}% of the AOI. ` +
          u.water_story,
      })),
      {
        code: meta.background.code,
        label: meta.background.label,
        color: meta.background.color,
        note: meta.background.detail,
        unpainted: true,
      },
    ];

    geochemAdapter.legend = {
      type: 'categorical',
      items: categories,
      note: meta.what_this_layer_is_good_for,
    };

    return {
      type: 'categorical-grid',
      width: px.w,
      height: px.h,
      codes,
      categories,
      bounds: { ...BOUNDS_M },
    };
  },
};
