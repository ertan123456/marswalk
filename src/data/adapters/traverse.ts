/**
 * Curiosity's actual driven traverse.
 *
 * PROVENANCE: REAL. From NASA's MMGIS layers for MSL — the same positions
 * behind the public "Where is Curiosity?" map. Clipped to the AOI and
 * simplified by scripts/fetch_traverse.py.
 *
 * This is ground truth, not a plan. It is on the map so a proposed EVA route
 * can be compared against a path a real vehicle actually managed to drive.
 */

import { BOUNDS_M, latLonToLocal } from '../../lib/geo';
import type { LocalPoint } from '../../lib/geo';
import type { LayerAdapter, LayerData } from '../types';

const BASE = import.meta.env.BASE_URL || '/';

interface TraverseMeta {
  product_name: string;
  title: string;
  mission: string;
  source_urls: string[];
  credit: string;
  waypoints_in_aoi: number;
  sol_range: [number, number] | null;
  path_segments: number;
}

let metaCache: TraverseMeta | null = null;

export async function traverseMeta(): Promise<TraverseMeta> {
  if (!metaCache) {
    const r = await fetch(BASE + 'data/traverse/meta.json');
    metaCache = (await r.json()) as TraverseMeta;
  }
  return metaCache;
}

export const traverseAdapter: LayerAdapter = {
  id: 'curiosity-traverse',
  name: "Curiosity's driven path",
  mission: 'Mars Science Laboratory (Curiosity)',
  instrument: 'Rover localisation',
  kind: 'science',
  group: 'Terrain',
  provenance: 'REAL',
  sourceNote:
    'The path Curiosity has actually driven, from NASA MMGIS. 1,039 surveyed waypoints fall ' +
    'inside this AOI, spanning sols 1167 to 5073 — Glen Torridon through Gediz Vallis to the ' +
    '2025 boxwork campaign. Simplified to ~1 m tolerance for delivery.',
  sourceUrl: 'https://mars.nasa.gov/msl/mission/where-is-the-rover/',
  credit: 'NASA/JPL-Caltech',
  defaultVisible: true,
  defaultOpacity: 0.9,
  mapRenderable: true,
  legend: {
    type: 'points',
    note: 'Ground truth: a route a real vehicle drove. Compare the planned EVA against it.',
  },
  async load(): Promise<LayerData> {
    const [pathRes, wpRes, meta] = await Promise.all([
      fetch(BASE + 'data/traverse/path.geojson'),
      fetch(BASE + 'data/traverse/waypoints.geojson'),
      traverseMeta(),
    ]);
    const path = await pathRes.json();
    const wps = await wpRes.json();

    const segments: LocalPoint[][] = [];
    for (const f of path.features ?? []) {
      const g = f.geometry;
      if (!g) continue;
      const lines: number[][][] =
        g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
      for (const line of lines) {
        const pts = line.map(([lon, lat]) => latLonToLocal(lat, lon));
        if (pts.length > 1) segments.push(pts);
      }
    }

    const waypoints = (wps.features ?? [])
      .filter((f: { geometry?: { type?: string } }) => f.geometry?.type === 'Point')
      .map((f: { geometry: { coordinates: number[] }; properties: Record<string, unknown> }) => ({
        position: latLonToLocal(f.geometry.coordinates[1], f.geometry.coordinates[0]),
        sol: (f.properties?.sol as number) ?? null,
        elevation: (f.properties?.elev_m as number) ?? null,
      }));

    return {
      type: 'path',
      segments,
      bounds: { ...BOUNDS_M },
      solRange: meta.sol_range ?? undefined,
      waypoints,
    };
  },
};
