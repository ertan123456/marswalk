/**
 * Science regions along Curiosity's traverse.
 *
 * PROVENANCE: DERIVED, from the REAL rover traverse. Each region is the ground
 * the rover covered while working that unit - every DEM cell within 220 m of a
 * surveyed waypoint inside that unit's sol window.
 *
 * This is deliberately NOT a geological map. Real unit contacts run far beyond
 * any rover track, and the "Proposed Path up Mount Sharp" figure that names
 * these units publishes no georeferencing control points, so tracing it would
 * have produced boundaries we could not defend. The layer card and the legend
 * both say so.
 */

import { BOUNDS_M } from '../../lib/geo';
import { loadJson, loadPixels } from '../../lib/png';
import type { CategoryDef, LayerAdapter, LayerData } from '../types';

export interface RegionDef {
  code: number;
  key: string;
  label: string;
  color: string;
  sols: [number, number];
  note: string;
  waypoints: number;
  cells: number;
  area_km2: number;
}

export interface RegionsMeta {
  provenance: string;
  derived_from: { product_name: string; source_url: string; provenance: string };
  informed_by: string;
  method: string;
  caveat: string;
  corridor_m: number;
  grid: { width: number; height: number };
  coverage_percent: number;
  regions: RegionDef[];
  credit: string;
}

let metaCache: RegionsMeta | null = null;

export function regionsMeta(): RegionsMeta | null {
  return metaCache;
}

/** Region definition for a class code, or undefined outside every corridor. */
export function regionFor(code: number): RegionDef | undefined {
  return metaCache?.regions.find((r) => r.code === code);
}

export const regionsAdapter: LayerAdapter = {
  id: 'science-regions',
  name: 'Science regions',
  mission: 'Derived product',
  instrument: 'MSL traverse + mission sol windows',
  kind: 'science',
  group: 'Geology & Minerals',
  provenance: 'DERIVED',
  sourceNote:
    'The ground Curiosity covered while working each unit: DEM cells within 220 m of a surveyed ' +
    'waypoint inside that unit’s sol window. Not a geological contact — real unit boundaries ' +
    'extend well beyond any rover track, and these corridors cover only 3.3% of the AOI. Sol windows ' +
    'are approximate, from the mission record, and are listed in the shipped metadata.',
  sourceUrl: 'https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/',
  credit: 'Derived by MARSWALK from NASA/JPL-Caltech rover localisation data',
  // Off by default: large translucent polygons over a hazard field is three
  // colour systems at once. Turned on when planning the science, not to look at.
  defaultVisible: false,
  defaultOpacity: 0.7,
  mapRenderable: true,
  legend: {
    type: 'categorical',
    items: [],
    note: 'Where the rover actually worked each unit, not where the unit ends.',
  },
  async load(): Promise<LayerData> {
    const meta = await loadJson<RegionsMeta>('data/regions/meta.json');
    metaCache = meta;
    const px = await loadPixels('data/regions/regions.png');

    const codes = new Uint8Array(px.w * px.h);
    for (let i = 0; i < codes.length; i++) codes[i] = px.data[i * 4];

    const categories: CategoryDef[] = meta.regions.map((r) => ({
      code: r.code,
      label: r.label,
      color: r.color,
      note: `Sols ${r.sols[0]}–${r.sols[1]} · ${r.waypoints} surveyed waypoints · ${r.area_km2} km². ${r.note}`,
    }));

    regionsAdapter.legend = {
      type: 'categorical',
      items: categories,
      note: meta.caveat,
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
