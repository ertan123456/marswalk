/**
 * Thermal inertia adapter — Mars Odyssey THEMIS.
 *
 * TO GO LIVE: pull the THEMIS-derived thermal inertia raster for the AOI
 * (global products are ~100 m/px, so it will be upsampled onto this grid) and
 * return it as a raster-grid in SI thermal inertia units.
 */

import { BOUNDS_M } from '../../lib/geo';
import { getThermalInertia } from '../mock/surface';
import { USE_REAL_DATA } from '../sources';
import type { LayerAdapter, LayerData } from '../types';

export const thermalAdapter: LayerAdapter = {
  id: 'themis-thermal-inertia',
  name: 'Thermal inertia',
  mission: 'Mars Odyssey',
  instrument: 'THEMIS (derived)',
  kind: 'thermal',
  isMock: !USE_REAL_DATA.thermal,
  provenance:
    'Thermal inertia in J m⁻² K⁻¹ s⁻½, from night-time IR brightness temperature inverted against a surface energy-balance model. Native THEMIS resolution is ~100 m/px; upsampled here.',
  defaultVisible: false,
  defaultOpacity: 0.65,
  mapRenderable: true,
  legend: {
    type: 'continuous',
    unit: 'J m⁻² K⁻¹ s⁻½',
    min: 60,
    max: 1100,
    stops: [
      { value: 60, color: '#241a3d' },
      { value: 180, color: '#4b3b82' },
      { value: 320, color: '#3f7fa6' },
      { value: 500, color: '#4fae8b' },
      { value: 720, color: '#e0c25a' },
      { value: 1100, color: '#fff3d6' },
    ],
    note: 'Low = dust and loose sand (poor footing). High = exposed bedrock, vein crests and blocky fields. This is the single best proxy for what the ground feels like underfoot.',
  },
  async load(): Promise<LayerData> {
    const ti = getThermalInertia();
    return {
      type: 'raster-grid',
      width: ti.grid,
      height: ti.grid,
      values: ti.values,
      bounds: { ...BOUNDS_M },
      min: ti.min,
      max: ti.max,
      unit: 'J m⁻² K⁻¹ s⁻½',
    };
  },
};
