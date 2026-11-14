/**
 * Topographic adapters — elevation and slope, both from the HiRISE DTM.
 *
 * TO GO LIVE: load the DTEEC .IMG/GeoTIFF for the AOI, resample to the working
 * grid, and return it as a raster-grid. Slope is then recomputed with Horn's
 * method from the real DEM — no other change needed, because the planner, the
 * hazard tracer and the 3D mesh all read the same grid.
 */

import { AOI, BOUNDS_M } from '../../lib/geo';
import { ELEV_CEIL, ELEV_FLOOR, getTerrain } from '../mock/terrain';
import { USE_REAL_DATA } from '../sources';
import type { LayerAdapter, LayerData } from '../types';

export const demAdapter: LayerAdapter = {
  id: 'dem-elevation',
  name: 'Elevation (DTM)',
  mission: 'Mars Reconnaissance Orbiter',
  instrument: 'HiRISE stereo DTM (DTEEC)',
  kind: 'topographic',
  isMock: !USE_REAL_DATA.topography,
  provenance:
    'Digital terrain model, 1 m posting, resampled to a ' +
    AOI.grid +
    '×' +
    AOI.grid +
    ' grid at ' +
    (AOI.sizeM / AOI.grid).toFixed(2) +
    ' m/post. Heights are relative to the Mars areoid (MOLA datum).',
  defaultVisible: true,
  defaultOpacity: 0.34,
  mapRenderable: true,
  legend: {
    type: 'continuous',
    unit: 'm (areoid)',
    min: ELEV_FLOOR,
    max: ELEV_CEIL,
    stops: [
      { value: -4500, color: '#1b2a4a' },
      { value: -4440, color: '#2f5d7c' },
      { value: -4380, color: '#4f9a86' },
      { value: -4330, color: '#c9b464' },
      { value: -4280, color: '#d9793c' },
      { value: -4240, color: '#b23a2a' },
      { value: -4200, color: '#f2e4d8' },
    ],
    note: 'Ground climbs ~290 m south-south-east toward Mount Sharp. The habitat pad sits on the low northern bench.',
  },
  async load(): Promise<LayerData> {
    const t = getTerrain();
    return {
      type: 'raster-grid',
      width: t.grid,
      height: t.grid,
      values: t.elevation,
      bounds: { ...BOUNDS_M },
      min: t.minElev,
      max: t.maxElev,
      unit: 'm',
    };
  },
};

export const slopeAdapter: LayerAdapter = {
  id: 'dem-slope',
  name: 'Slope',
  mission: 'Mars Reconnaissance Orbiter',
  instrument: 'HiRISE DTM (derived)',
  kind: 'topographic',
  isMock: !USE_REAL_DATA.topography,
  provenance:
    "Slope magnitude computed from the DTM with Horn's 3×3 method at " +
    (AOI.sizeM / AOI.grid).toFixed(2) +
    ' m baseline. Flight rule: flag at 15°, bar suited crew at 20°.',
  defaultVisible: false,
  defaultOpacity: 0.6,
  mapRenderable: true,
  legend: {
    type: 'continuous',
    unit: '°',
    min: 0,
    max: 30,
    stops: [
      { value: 0, color: '#0d2a24' },
      { value: 5, color: '#1d6b4f' },
      { value: 10, color: '#8dbf4a' },
      { value: 15, color: '#f2b53a' },
      { value: 20, color: '#ef4444' },
      { value: 30, color: '#7f1d1d' },
    ],
    note: 'Amber from 15° (flagged), red from 20° (impassable to suited crew in the planner).',
  },
  async load(): Promise<LayerData> {
    const t = getTerrain();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < t.slopeDeg.length; i++) {
      if (t.slopeDeg[i] < min) min = t.slopeDeg[i];
      if (t.slopeDeg[i] > max) max = t.slopeDeg[i];
    }
    return {
      type: 'raster-grid',
      width: t.grid,
      height: t.grid,
      values: t.slopeDeg,
      bounds: { ...BOUNDS_M },
      min,
      max,
      unit: '°',
    };
  },
};
