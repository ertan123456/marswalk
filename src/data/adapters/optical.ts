/**
 * Optical basemap adapter — MRO HiRISE / CTX orthoimage.
 *
 * TO GO LIVE: replace load() with a fetch of the map-projected GeoTIFF / PNG
 * for the AOI footprint (or point `ENDPOINTS.hirise` at a Mars Trek WMTS tile
 * template and swap the ImageOverlay for a TileLayer). Then set isMock = false.
 */

import { BOUNDS_M, AOI } from '../../lib/geo';
import { getOpticalBasemapURL } from '../mock/imagery';
import { ENDPOINTS, USE_REAL_DATA } from '../sources';
import type { LayerAdapter, LayerData } from '../types';

export const opticalAdapter: LayerAdapter = {
  id: 'optical-base',
  name: 'Orbital basemap',
  mission: 'Mars Reconnaissance Orbiter',
  instrument: 'HiRISE RED / CTX mosaic',
  kind: 'optical',
  isMock: !USE_REAL_DATA.optical,
  provenance:
    'Map-projected orthoimage, 25 cm/px HiRISE over a ~5 m/px CTX base. Rendered here at ' +
    (AOI.sizeM / AOI.grid).toFixed(1) +
    ' m/px to match the DTM grid.',
  defaultVisible: true,
  defaultOpacity: 1,
  mapRenderable: true,
  legend: {
    type: 'continuous',
    unit: 'relative I/F',
    min: 0,
    max: 1,
    stops: [
      { value: 0, color: '#101014' },
      { value: 0.5, color: '#8a8378' },
      { value: 1, color: '#f4efe6' },
    ],
    note: 'Single-band radiance, contrast-stretched. Bright crests are sulfate vein fill; dark patches are basaltic sand.',
  },
  async load(): Promise<LayerData> {
    if (USE_REAL_DATA.optical && ENDPOINTS.hirise) {
      // Real product: an already map-projected image covering the AOI footprint.
      return {
        type: 'raster-image',
        url: ENDPOINTS.hirise,
        width: AOI.grid,
        height: AOI.grid,
        bounds: { ...BOUNDS_M },
      };
    }
    return {
      type: 'raster-image',
      url: getOpticalBasemapURL(),
      width: AOI.grid,
      height: AOI.grid,
      bounds: { ...BOUNDS_M },
    };
  },
};
