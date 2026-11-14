/**
 * Orbital basemap — MRO HiRISE, Curiosity Roving Site Mosaic.
 *
 * PROVENANCE: REAL. Tiles come from the `curiosity_hirise_mosaic` WMTS layer on
 * NASA Mars Trek, stitched and cropped to the AOI offline by
 * scripts/fetch_ortho.py. Served as a static WebP so the app makes no network
 * call to NASA at demo time.
 */

import { BOUNDS_M, AOI } from '../../lib/geo';
import type { LayerAdapter, LayerData } from '../types';

interface OrthoMeta {
  product_name: string;
  title: string;
  mission: string;
  instrument: string;
  source_url: string;
  credit: string;
  native_m_per_px: number;
  size_px: { width: number; height: number };
  coverage_percent: number;
  zoom: number;
}

let meta: OrthoMeta | null = null;

export async function orthoMeta(): Promise<OrthoMeta> {
  if (!meta) {
    const r = await fetch((import.meta.env.BASE_URL || '/') + 'data/ortho/meta.json');
    meta = (await r.json()) as OrthoMeta;
  }
  return meta;
}

export const opticalAdapter: LayerAdapter = {
  id: 'optical-base',
  name: 'Orbital basemap',
  mission: 'Mars Reconnaissance Orbiter',
  instrument: 'HiRISE RED',
  kind: 'optical',
  group: 'Base',
  provenance: 'REAL',
  sourceNote:
    'MRO HiRISE "Curiosity Roving Site Mosaic" from NASA Mars Trek, zoom 13 (~5.1 m/px), ' +
    'stitched from 78 WMTS tiles, cropped to the AOI and contrast-stretched 1-99 percentile.',
  sourceUrl: 'https://trek.nasa.gov/mars/',
  credit: 'NASA/JPL-Caltech/University of Arizona',
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
    note: 'Single-band HiRISE RED radiance, contrast-stretched. This is the ground the crew will actually see.',
  },
  async load(): Promise<LayerData> {
    const m = await orthoMeta();
    return {
      type: 'raster-image',
      url: (import.meta.env.BASE_URL || '/') + 'data/ortho/basemap.webp',
      width: m.size_px.width,
      height: m.size_px.height,
      bounds: { ...BOUNDS_M },
    };
  },
};

export const AOI_NAME = AOI.name;
