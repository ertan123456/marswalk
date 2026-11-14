/**
 * THE one place that lists every data layer in the app.
 *
 * Add a layer: write an adapter in ./adapters, import it, push it into
 * LAYER_REGISTRY. Nothing in the UI is hard-coded to a specific layer id except
 * where a feature genuinely needs one (the planner needs the DEM; the HUD needs
 * the RAD series), and those are named below so they are easy to find.
 *
 * The mock -> real switch and all external endpoints live in ./sources and are
 * re-exported here, so the UI has a single import site. They are kept in a
 * separate file only to avoid a circular import with the adapters.
 */

import { opticalAdapter } from './adapters/optical';
import { demAdapter, slopeAdapter } from './adapters/topography';
import { thermalAdapter } from './adapters/thermal';
import { spectralAdapter } from './adapters/spectral';
import { radiationAdapter } from './adapters/radiation';
import { atmosphericAdapter } from './adapters/atmospheric';
import { hazardAdapter } from './adapters/hazards';
import { scienceAdapter } from './adapters/science';
import type { LayerAdapter, LayerData } from './types';

export { USE_REAL_DATA, ENDPOINTS, anyMock } from './sources';

/** Draw order: first entry is the bottom of the stack. */
export const LAYER_REGISTRY: LayerAdapter[] = [
  opticalAdapter,
  demAdapter,
  slopeAdapter,
  thermalAdapter,
  spectralAdapter,
  hazardAdapter,
  scienceAdapter,
  radiationAdapter,
  atmosphericAdapter,
];

/** Layer ids features depend on by name. */
export const LAYER_IDS = {
  optical: opticalAdapter.id,
  dem: demAdapter.id,
  slope: slopeAdapter.id,
  thermal: thermalAdapter.id,
  mineral: spectralAdapter.id,
  hazards: hazardAdapter.id,
  science: scienceAdapter.id,
  radiation: radiationAdapter.id,
  weather: atmosphericAdapter.id,
} as const;

export function getAdapter(id: string): LayerAdapter | undefined {
  return LAYER_REGISTRY.find((a) => a.id === id);
}

/** Layers that draw on the 2D map, bottom-up. */
export function mapLayers(): LayerAdapter[] {
  return LAYER_REGISTRY.filter((a) => a.mapRenderable);
}

const loadCache = new Map<string, Promise<LayerData>>();

/** Load a layer once per session and memoise the promise. */
export function loadLayer(id: string): Promise<LayerData> {
  const existing = loadCache.get(id);
  if (existing) return existing;
  const adapter = getAdapter(id);
  if (!adapter) return Promise.reject(new Error('Unknown layer: ' + id));
  const p = adapter.load();
  loadCache.set(id, p);
  return p;
}

/** Which layers can be draped as a texture over the 3D terrain. */
export const DRAPEABLE_LAYER_IDS: string[] = [
  opticalAdapter.id,
  demAdapter.id,
  slopeAdapter.id,
  thermalAdapter.id,
  spectralAdapter.id,
];
