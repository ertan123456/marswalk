/**
 * THE one place that lists every data layer in the app.
 *
 * Add a layer: write an adapter in ./adapters, import it, push it into
 * LAYER_REGISTRY. Nothing in the UI is hard-coded to a specific layer id except
 * where a feature genuinely needs one (the planner needs the DEM; the HUD needs
 * the dose model), and those are named below so they are easy to find.
 *
 * Every adapter declares REAL / DERIVED / MODELED. The UI shows that badge on
 * the layer card and on the About page, and nothing is allowed to ship without
 * one.
 */

import { opticalAdapter } from './adapters/optical';
import { demAdapter, slopeAdapter } from './adapters/topography';
import { hazardAdapter } from './adapters/hazards';
import { traverseAdapter } from './adapters/traverse';
import { regionsAdapter } from './adapters/regions';
import { geochemAdapter } from './adapters/geochem';
import { radiationAdapter } from './adapters/radiation';
import { atmosphericAdapter } from './adapters/atmospheric';
import { scienceAdapter } from './adapters/science';
import type { LayerAdapter, LayerData, LayerGroup, Provenance } from './types';

/** Draw order: first entry is the bottom of the stack. */
export const LAYER_REGISTRY: LayerAdapter[] = [
  opticalAdapter,
  demAdapter,
  slopeAdapter,
  hazardAdapter,
  geochemAdapter,
  regionsAdapter,
  traverseAdapter,
  scienceAdapter,
  radiationAdapter,
  atmosphericAdapter,
];

/** Layer ids features depend on by name. */
export const LAYER_IDS = {
  optical: opticalAdapter.id,
  dem: demAdapter.id,
  slope: slopeAdapter.id,
  hazards: hazardAdapter.id,
  geochem: geochemAdapter.id,
  regions: regionsAdapter.id,
  traverse: traverseAdapter.id,
  science: scienceAdapter.id,
  radiation: radiationAdapter.id,
  weather: atmosphericAdapter.id,
} as const;

export const LAYER_GROUP_ORDER: LayerGroup[] = [
  'Base',
  'Terrain',
  'Geology & Minerals',
  'Safety',
  'Environment',
];

export function getAdapter(id: string): LayerAdapter | undefined {
  return LAYER_REGISTRY.find((a) => a.id === id);
}

/** Layers that draw on the 2D map, bottom-up. */
export function mapLayers(): LayerAdapter[] {
  return LAYER_REGISTRY.filter((a) => a.mapRenderable);
}

/** Layers grouped for the layer panel, in display order. */
export function groupedLayers(): { group: LayerGroup; layers: LayerAdapter[] }[] {
  return LAYER_GROUP_ORDER.map((group) => ({
    group,
    layers: LAYER_REGISTRY.filter((a) => a.group === group),
  })).filter((g) => g.layers.length > 0);
}

/** Count of layers per provenance tag, for the About page and the top bar. */
export function provenanceCounts(): Record<Provenance, number> {
  const out: Record<Provenance, number> = { REAL: 0, DERIVED: 0, MODELED: 0 };
  for (const a of LAYER_REGISTRY) out[a.provenance]++;
  return out;
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
  hazardAdapter.id,
  geochemAdapter.id,
  regionsAdapter.id,
];
