/**
 * EVA mobility hazards.
 *
 * PROVENANCE: DERIVED. Classified by scripts/derive_terrain.py from the real
 * DTM: slope by Horn's method, plus detrended local relief as a ruggedness
 * index. Shipped as a class raster so the map, the 3D view and the A* planner
 * all read exactly the same cells.
 *
 * The "no stereo coverage" class is a first-class hazard, not a gap: the crew
 * is not routed across ground the DTM does not cover.
 */

import { BOUNDS_M } from '../../lib/geo';
import { getTerrain } from '../real/terrain';
import type { CategoryDef, LayerAdapter, LayerData } from '../types';

export function hazardCategories(): CategoryDef[] {
  const t = getTerrain();
  return t.derivedMeta.classes.map((c) => ({
    code: c.code,
    label: c.label,
    color: c.color,
    note: c.detail,
  }));
}

export const hazardAdapter: LayerAdapter = {
  id: 'mobility-hazards',
  name: 'Mobility hazards',
  mission: 'Derived product',
  instrument: 'HiRISE DTM (slope + ruggedness)',
  kind: 'hazard',
  group: 'Safety',
  provenance: 'DERIVED',
  sourceNote:
    'Slope and detrended local relief from the real DTM, thresholded against EVA mobility ' +
    'flight rules: caution at 15° or 1.0 m relief, barred at 25° or 2.2 m. ' +
    'At ~14 m/px the DEM cannot resolve individual boulders, so the relief term is a ' +
    'ruggedness index, not a rock count. 58.4% of the AOI is passable to suited crew.',
  credit: 'Derived by MARSWALK from NASA/JPL-Caltech/University of Arizona HiRISE data',
  defaultVisible: true,
  defaultOpacity: 0.3,
  mapRenderable: true,
  legend: {
    type: 'categorical',
    items: [],
    note: 'The planner routes around the barred classes and pays a cost penalty to cross caution ground.',
  },
  async load(): Promise<LayerData> {
    const t = getTerrain();
    const categories = hazardCategories();
    // The class list lives in the shipped metadata, so fill the legend in once
    // the terrain is available rather than duplicating it here.
    hazardAdapter.legend = {
      type: 'categorical',
      items: categories,
      note: 'The planner routes around the barred classes and pays a cost penalty to cross caution ground.',
    };
    return {
      type: 'categorical-grid',
      width: t.width,
      height: t.height,
      codes: t.hazard,
      categories,
      bounds: { ...BOUNDS_M },
    };
  },
};
