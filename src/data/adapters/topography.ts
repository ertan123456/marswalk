/**
 * Topography — elevation (REAL) and slope (DERIVED).
 *
 * Elevation is the HiRISE stereo DTM itself, decoded from the packed heightmap
 * the pipeline ships. Slope is recomputed in the browser from that same grid by
 * Horn's method, so it can never disagree with the terrain the planner routes
 * across.
 */

import { BOUNDS_M } from '../../lib/geo';
import { getTerrain } from '../real/terrain';
import type { LayerAdapter, LayerData } from '../types';

export const demAdapter: LayerAdapter = {
  id: 'dem-elevation',
  name: 'Elevation (DTM)',
  mission: 'Mars Reconnaissance Orbiter',
  instrument: 'HiRISE stereo DTM',
  kind: 'topographic',
  group: 'Terrain',
  provenance: 'REAL',
  sourceNote:
    'PDS product DTEEC_009149_1750_009294_1750_U01, 32-bit float at 1.01 m/post, ' +
    'resampled to this 474 x 1024 grid (~14.3 m/px). Heights are relative to the Mars areoid. ' +
    'Read by HTTP range from the PDS archive rather than downloading the full 390 MB file.',
  sourceUrl: 'https://www.uahirise.org/dtm/',
  credit: 'NASA/JPL-Caltech/University of Arizona',
  defaultVisible: true,
  defaultOpacity: 0.38,
  mapRenderable: true,
  legend: {
    type: 'continuous',
    unit: 'm (areoid)',
    min: -4406,
    max: -2271,
    stops: [
      { value: -4406, color: '#17213f' },
      { value: -4050, color: '#2f5d7c' },
      { value: -3700, color: '#4f9a86' },
      { value: -3350, color: '#c9b464' },
      { value: -3000, color: '#d9793c' },
      { value: -2650, color: '#b23a2a' },
      { value: -2271, color: '#f2e4d8' },
    ],
    note: 'The ground climbs 2.13 km from the crater floor in the north onto Mount Sharp in the south.',
  },
  async load(): Promise<LayerData> {
    const t = getTerrain();
    return {
      type: 'raster-grid',
      width: t.width,
      height: t.height,
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
  mission: 'Derived product',
  instrument: 'HiRISE DTM (Horn 3x3)',
  kind: 'topographic',
  group: 'Terrain',
  provenance: 'DERIVED',
  sourceNote:
    "Computed from the real DTM with Horn's 3x3 method at its true 14.29 x 14.27 m baseline. " +
    'Flight rules: flagged at 15 degrees, barred to suited crew at 25. ' +
    'Median across the AOI is 10.4 degrees, 95th percentile 33.6.',
  credit: 'Derived by MARSWALK from NASA/JPL-Caltech/University of Arizona HiRISE data',
  defaultVisible: false,
  defaultOpacity: 0.6,
  mapRenderable: true,
  legend: {
    type: 'continuous',
    unit: '°',
    min: 0,
    max: 45,
    stops: [
      { value: 0, color: '#0d2a24' },
      { value: 8, color: '#1d6b4f' },
      { value: 15, color: '#8dbf4a' },
      { value: 22, color: '#f2b53a' },
      { value: 30, color: '#ef4444' },
      { value: 45, color: '#7f1d1d' },
    ],
    note: 'Amber from 15° (flagged), red from 25° (barred). Slope is zeroed where there is no stereo coverage.',
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
      width: t.width,
      height: t.height,
      values: t.slopeDeg,
      bounds: { ...BOUNDS_M },
      min,
      max,
      unit: '°',
    };
  },
};
