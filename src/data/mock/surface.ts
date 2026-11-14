/**
 * MOCK surface-property grids derived from the synthetic DEM.
 *
 *  - Thermal inertia stands in for a Mars Odyssey THEMIS-derived product.
 *  - Mineral units stand in for an MRO CRISM summary-parameter classification.
 *
 * Both are keyed off the same ridge / sand / boulder masks the DEM was built
 * from, so a boxwork vein that stands proud in topography is also the thing
 * that shows up as high thermal inertia and as a sulfate signature.
 */

import { AOI } from '../../lib/geo';
import { clamp, fbmGrid, sampleField, smoothstep } from '../../lib/noise';
import type { CategoryDef } from '../types';
import { getTerrain, TERRAIN_SEED } from './terrain';

/** J m^-2 K^-1 s^-1/2 - dust ~60, sand ~200, bedrock ~500, blocky ~1100. */
export interface ThermalModel {
  grid: number;
  values: Float32Array;
  min: number;
  max: number;
}

let thermalCache: ThermalModel | null = null;

export function getThermalInertia(): ThermalModel {
  if (thermalCache) return thermalCache;
  const t = getTerrain();
  const grid = t.grid;
  const values = new Float32Array(grid * grid);
  const cell = AOI.sizeM / grid;
  const S = AOI.sizeM;
  const fDust = fbmGrid(96, 540, TERRAIN_SEED + ':dust', 3, S);
  const fTiNoise = fbmGrid(256, 95, TERRAIN_SEED + ':ti-noise', 3, S);

  let min = Infinity;
  let max = -Infinity;
  for (let row = 0; row < grid; row++) {
    const py = AOI.sizeM - (row + 0.5) * cell;
    for (let col = 0; col < grid; col++) {
      const px = (col + 0.5) * cell;
      const i = row * grid + col;

      // Indurated bedrock substrate with a patchy dust mantle.
      const dust = clamp(0.5 + 0.5 * sampleField(fDust, 96, px, py, S), 0, 1);
      let ti = 300 - dust * 95;

      ti += t.ridge[i] * 430; // resistant vein crests
      ti += t.boulder[i] * 520; // metre-scale blocks
      ti -= t.sand[i] * 175; // loose, poorly conducting sand
      ti += clamp(t.roughness[i] * 26, 0, 110); // sub-pixel rock abundance
      ti += sampleField(fTiNoise, 256, px, py, S) * 22;

      const v = clamp(ti, 55, 1180);
      values[i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  thermalCache = { grid, values, min, max };
  return thermalCache;
}

export const MINERAL_CATEGORIES: CategoryDef[] = [
  {
    code: 0,
    label: 'Basaltic sand',
    color: '#4b5563',
    note: 'Olivine + pyroxene bearing aeolian fill. Low scientific priority, high mobility cost.',
  },
  {
    code: 1,
    label: 'Mg/Ca sulfate',
    color: '#f2d06b',
    note: 'Vein-filling sulfates along boxwork crests - the primary sampling target.',
  },
  {
    code: 2,
    label: 'Phyllosilicate (clay)',
    color: '#5fb8a3',
    note: 'Smectite-bearing lower unit, exposed on the northern plain. Records a wetter, habitable era.',
  },
  {
    code: 3,
    label: 'Hematite',
    color: '#c2552f',
    note: 'Grey crystalline hematite on crater ejecta and wind-scoured pavement.',
  },
];

export interface MineralModel {
  grid: number;
  codes: Uint8Array;
  categories: CategoryDef[];
}

let mineralCache: MineralModel | null = null;

export function getMineralUnits(): MineralModel {
  if (mineralCache) return mineralCache;
  const t = getTerrain();
  const grid = t.grid;
  const codes = new Uint8Array(grid * grid);
  const cell = AOI.sizeM / grid;
  const S = AOI.sizeM;
  const fSulf = fbmGrid(160, 320, TERRAIN_SEED + ':sulf', 3, S);
  const fClay = fbmGrid(128, 400, TERRAIN_SEED + ':clay', 3, S);
  const fHem = fbmGrid(256, 150, TERRAIN_SEED + ':hem', 4, S);

  for (let row = 0; row < grid; row++) {
    const py = AOI.sizeM - (row + 0.5) * cell;
    // Gale stratigraphy: clay-bearing unit low and north, sulfate-bearing unit
    // above it to the south as the ground climbs Mount Sharp.
    const climb = (AOI.sizeM - py) / AOI.sizeM;
    for (let col = 0; col < grid; col++) {
      const px = (col + 0.5) * cell;
      const i = row * grid + col;

      const sulfateAffinity =
        t.ridge[i] * 1.35 + smoothstep(0.25, 0.7, climb) * 0.45 +
        0.18 * sampleField(fSulf, 160, px, py, S);

      const clayAffinity =
        (1 - smoothstep(0.1, 0.55, climb)) * 0.95 +
        0.25 * sampleField(fClay, 128, px, py, S) -
        t.ridge[i] * 0.5;

      const hematiteAffinity =
        0.42 * (0.5 + 0.5 * sampleField(fHem, 256, px, py, S)) +
        t.boulder[i] * 0.35 -
        t.sand[i] * 0.4;

      const sandAffinity = t.sand[i] * 1.5;

      let best = 0;
      let bestV = sandAffinity;
      if (sulfateAffinity > bestV) {
        bestV = sulfateAffinity;
        best = 1;
      }
      if (clayAffinity > bestV) {
        bestV = clayAffinity;
        best = 2;
      }
      if (hematiteAffinity > bestV) {
        best = 3;
      }
      codes[i] = best;
    }
  }
  mineralCache = { grid, codes, categories: MINERAL_CATEGORIES };
  return mineralCache;
}
