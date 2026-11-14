/**
 * Mobility hazard adapter — derived flight-rules product.
 *
 * TO GO LIVE: swap in the reviewed hazard GeoJSON for the AOI (or re-trace it
 * from the real DTM slope raster plus a HiRISE rock-abundance product). Keep
 * `costFactor` / `passable`: the A* planner reads them directly.
 */

import { BOUNDS_M } from '../../lib/geo';
import { getHazards, HAZARD_STYLE } from '../mock/hazards';
import { USE_REAL_DATA } from '../sources';
import type { LayerAdapter, LayerData } from '../types';

export const hazardAdapter: LayerAdapter = {
  id: 'mobility-hazards',
  name: 'Mobility hazards',
  mission: 'Derived product',
  instrument: 'HiRISE DTM + rock abundance',
  kind: 'hazard',
  isMock: !USE_REAL_DATA.hazards,
  provenance:
    'Traced from the DTM slope raster and surface-unit masks, then classified against EVA mobility flight rules. Boundaries follow DEM cell edges, as an un-smoothed GIS hazard polygon does.',
  defaultVisible: true,
  defaultOpacity: 0.8,
  mapRenderable: true,
  legend: {
    type: 'vector',
    items: [
      { label: HAZARD_STYLE['boulder-field'].label + ' — barred', color: HAZARD_STYLE['boulder-field'].color, passable: false },
      { label: HAZARD_STYLE['steep-slope'].label + ' — 2.6× cost', color: HAZARD_STYLE['steep-slope'].color, passable: true },
      { label: HAZARD_STYLE['sand-trap'].label + ' — 4.2× cost', color: HAZARD_STYLE['sand-trap'].color, passable: true },
    ],
    note: 'The planner routes around barred polygons outright and pays the cost multiplier to cross the others.',
  },
  async load(): Promise<LayerData> {
    return { type: 'vector', features: getHazards(), bounds: { ...BOUNDS_M } };
  },
};
