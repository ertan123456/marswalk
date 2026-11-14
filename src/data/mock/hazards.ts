/**
 * MOCK mobility-hazard vector layer, derived from the synthetic DEM.
 *
 * Stands in for a flight-rules hazard product: in a real mission this is an
 * analyst-reviewed GeoJSON built from a HiRISE DTM slope map plus rock-abundance
 * and thermal-inertia rasters. Here the same three classes are traced straight
 * off the DEM-derived masks so the planner and the map agree exactly.
 */

import { maskToRings, ringCentroid } from '../../lib/contour';
import type { HazardClass, VectorFeature } from '../types';
import { getTerrain } from './terrain';

/** Flight rule: slopes at or above this are flagged; 20 deg and above are barred. */
export const HAZARD_SLOPE_DEG = 15;

export const HAZARD_STYLE: Record<HazardClass, { color: string; label: string }> = {
  'boulder-field': { color: '#ef4444', label: 'Boulder field' },
  'steep-slope': { color: '#f2b53a', label: 'Slope > 15°' },
  'sand-trap': { color: '#a855f7', label: 'Loose sand trap' },
};

let cache: VectorFeature[] | null = null;

export function getHazards(): VectorFeature[] {
  if (cache) return cache;
  const t = getTerrain();
  const n = t.grid * t.grid;

  const steepMask = new Uint8Array(n);
  const boulderMask = new Uint8Array(n);
  const sandMask = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    if (t.slopeDeg[i] >= HAZARD_SLOPE_DEG) steepMask[i] = 1;
    if (t.boulder[i] >= 0.5) boulderMask[i] = 1;
    if (t.sand[i] >= 0.62) sandMask[i] = 1;
  }

  const features: VectorFeature[] = [];

  const add = (
    rings: ReturnType<typeof maskToRings>,
    hazardClass: HazardClass,
    costFactor: number,
    passable: boolean,
    detail: (areaHa: number) => string,
  ) => {
    rings.forEach((ring, i) => {
      const c = ringCentroid(ring);
      const areaHa =
        Math.abs(
          ring.reduce((acc, p, k) => {
            const q = ring[(k + 1) % ring.length];
            return acc + (p.x * q.y - q.x * p.y);
          }, 0) / 2,
        ) / 10000;
      features.push({
        id: hazardClass + '-' + (i + 1),
        ring,
        hazardClass,
        label: HAZARD_STYLE[hazardClass].label + ' ' + String(i + 1).padStart(2, '0'),
        costFactor,
        passable,
        detail:
          detail(areaHa) + ' Centroid ' + Math.round(c.x) + ' E / ' + Math.round(c.y) + ' N (AOI local).',
      });
    });
  };

  add(
    maskToRings(boulderMask, t.grid, t.grid, { minAreaM2: 3500 }),
    'boulder-field',
    Infinity,
    false,
    (ha) =>
      'Metre-scale blocks at > 25% areal cover over ' +
      ha.toFixed(1) +
      ' ha. Barred to suited crew: ankle-roll and suit-abrasion risk.',
  );

  add(
    maskToRings(steepMask, t.grid, t.grid, { minAreaM2: 2500 }),
    'steep-slope',
    2.6,
    true,
    (ha) =>
      'DEM slope exceeds the ' +
      HAZARD_SLOPE_DEG +
      '° flight rule over ' +
      ha.toFixed(1) +
      ' ha. Traversable at a 2.6x cost penalty; cells above 20° are barred outright by the planner.',
  );

  add(
    maskToRings(sandMask, t.grid, t.grid, { minAreaM2: 4000 }),
    'sand-trap',
    4.2,
    true,
    (ha) =>
      'Low thermal inertia, unconsolidated fines over ' +
      ha.toFixed(1) +
      ' ha. Sinkage to mid-boot; 4.2x cost penalty and no rover recovery access.',
  );

  cache = features;
  return cache;
}

/** Hazard summary for a single point, used by the map probe and the HUD. */
export function hazardAt(col: number, row: number): { label: string; tone: 'nominal' | 'caution' | 'danger' } {
  const t = getTerrain();
  const i = row * t.grid + col;
  if (t.boulder[i] >= 0.5) return { label: 'BOULDER FIELD — impassable', tone: 'danger' };
  if (t.slopeDeg[i] >= 20) return { label: 'SLOPE > 20° — impassable', tone: 'danger' };
  if (t.sand[i] >= 0.62) return { label: 'SAND TRAP — high cost', tone: 'caution' };
  if (t.slopeDeg[i] >= HAZARD_SLOPE_DEG) return { label: 'SLOPE > 15° — caution', tone: 'caution' };
  return { label: 'Nominal traverse', tone: 'nominal' };
}
