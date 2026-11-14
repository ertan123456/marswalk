/**
 * Spectral mineralogy adapter — MRO CRISM.
 *
 * TO GO LIVE: load CRISM summary-parameter browse products (e.g. MIN2295_2165
 * for Mg-carbonate/sulfate, D2300 for phyllosilicates, BD530 for ferric
 * oxides), threshold them into units, and return a categorical-grid. The UI
 * only needs `codes` + `categories`.
 */

import { BOUNDS_M } from '../../lib/geo';
import { getMineralUnits, MINERAL_CATEGORIES } from '../mock/surface';
import { USE_REAL_DATA } from '../sources';
import type { LayerAdapter, LayerData } from '../types';

export const spectralAdapter: LayerAdapter = {
  id: 'crism-mineralogy',
  name: 'Mineral units',
  mission: 'Mars Reconnaissance Orbiter',
  instrument: 'CRISM (summary parameters)',
  kind: 'spectral',
  isMock: !USE_REAL_DATA.spectral,
  provenance:
    'Classified from visible/near-IR summary parameters at ~18 m/px native CRISM targeted resolution. Unit boundaries are interpretive, not measured contacts.',
  defaultVisible: false,
  defaultOpacity: 0.55,
  mapRenderable: true,
  legend: {
    type: 'categorical',
    items: MINERAL_CATEGORIES,
    note: 'Sulfate tracks the boxwork crests; the clay unit underlies the northern bench. The crew is sampling across that contact.',
  },
  async load(): Promise<LayerData> {
    const m = getMineralUnits();
    return {
      type: 'categorical-grid',
      width: m.grid,
      height: m.grid,
      codes: m.codes,
      categories: m.categories,
      bounds: { ...BOUNDS_M },
    };
  },
};
