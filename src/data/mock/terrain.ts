/**
 * MOCK terrain model for the Gale Crater / Mount Sharp boxwork AOI.
 *
 * Stands in for an MRO HiRISE DTM (DTEEC product, ~1 m/post, downsampled to the
 * 7.8 m grid used here). Everything else in the app - hillshade, thermal
 * inertia, mineral units, hazards, routing cost - is derived from this single
 * synthetic surface so the layers stay mutually consistent, exactly as real
 * co-registered products would be.
 *
 * Deterministic: one seed in -> identical 512x512 surface out.
 */

import { AOI, CELL_M } from '../../lib/geo';
import type { LocalPoint } from '../../lib/geo';
import { Rng } from '../../lib/rng';
import { clamp, fbm2D, fbmGrid, ridgedNoise2D, sampleField, smoothstep, lerp } from '../../lib/noise';
import { sampleGridBilinear } from '../../lib/raster';

export const TERRAIN_SEED = 'marswalk-gale-boxwork-2026';

/** MOLA-referenced elevations: the boxwork region sits ~4.4 km below the areoid. */
export const ELEV_FLOOR = -4500;
export const ELEV_CEIL = -4200;

export interface CircleFeature {
  x: number;
  y: number;
  r: number;
}

export interface CraterFeature extends CircleFeature {
  depth: number;
  name: string;
}

export interface TerrainModel {
  grid: number;
  cell: number;
  /** metres relative to the Mars areoid, row 0 = north edge */
  elevation: Float32Array;
  minElev: number;
  maxElev: number;
  /** degrees from horizontal */
  slopeDeg: Float32Array;
  /** degrees, 0 = downhill faces north, clockwise */
  aspectDeg: Float32Array;
  /** 0..1 relief shading, sun from the NW at 35 deg elevation */
  hillshade: Float32Array;
  /** 0..1 boxwork ridge-crest intensity */
  ridge: Float32Array;
  /** 0..1 loose aeolian sand fraction */
  sand: Float32Array;
  /** 0..1 blocky boulder-field cover */
  boulder: Float32Array;
  /** local RMS relief over a 3x3 window, metres */
  roughness: Float32Array;
  craters: CraterFeature[];
  boulderFields: CircleFeature[];
  sandPatches: CircleFeature[];
  /** flattened pad at the north edge of the AOI */
  habitat: LocalPoint;
}

interface VoronoiField {
  /** |d2 - d1| in metres: 0 exactly on a cell boundary */
  edgeDistance: Float32Array;
  /** per-cell height multiplier so not every ridge is the same size */
  edgeStrength: Float32Array;
}

/**
 * Boxwork formations are a polygonal network of resistant mineral veins left by
 * groundwater, standing proud of the eroded bedrock. A jittered Voronoi
 * diagram's cell boundaries reproduce that geometry closely.
 */
function buildBoxworkNetwork(grid: number, rng: Rng): VoronoiField {
  const spacing = 165; // metres between vein-cell centres
  const ng = Math.ceil(AOI.sizeM / spacing);
  const seeds: { x: number; y: number; s: number }[] = [];
  for (let gj = 0; gj < ng; gj++) {
    for (let gi = 0; gi < ng; gi++) {
      seeds.push({
        x: (gi + rng.range(0.18, 0.82)) * spacing,
        y: (gj + rng.range(0.18, 0.82)) * spacing,
        s: rng.range(0.45, 1.25),
      });
    }
  }
  const at = (gi: number, gj: number) => seeds[gj * ng + gi];

  const edgeDistance = new Float32Array(grid * grid);
  const edgeStrength = new Float32Array(grid * grid);
  const cell = AOI.sizeM / grid;

  for (let row = 0; row < grid; row++) {
    const py = AOI.sizeM - (row + 0.5) * cell;
    const gj0 = Math.floor(py / spacing);
    for (let col = 0; col < grid; col++) {
      const px = (col + 0.5) * cell;
      const gi0 = Math.floor(px / spacing);
      let d1 = Infinity;
      let d2 = Infinity;
      let s1 = 1;
      for (let dj = -2; dj <= 2; dj++) {
        const gj = gj0 + dj;
        if (gj < 0 || gj >= ng) continue;
        for (let di = -2; di <= 2; di++) {
          const gi = gi0 + di;
          if (gi < 0 || gi >= ng) continue;
          const s = at(gi, gj);
          const d = Math.hypot(s.x - px, s.y - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            s1 = s.s;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      const i = row * grid + col;
      edgeDistance[i] = d2 - d1;
      edgeStrength[i] = s1;
    }
  }
  return { edgeDistance, edgeStrength };
}

function buildTerrain(seed: string): TerrainModel {
  const grid = AOI.grid;
  const n = grid * grid;
  const cell = CELL_M;
  const rng = new Rng(seed);

  // --- discrete features, listed explicitly so positions never drift ---------
  const craters: CraterFeature[] = [
    { x: 1180, y: 1420, r: 148, depth: 22, name: 'Unnamed 148 m' },
    { x: 2880, y: 2510, r: 96, depth: 13, name: 'Unnamed 96 m' },
    { x: 760, y: 2620, r: 58, depth: 7.5, name: 'Unnamed 58 m' },
    { x: 3320, y: 980, r: 74, depth: 9.5, name: 'Unnamed 74 m' },
    { x: 2050, y: 3280, r: 41, depth: 4.5, name: 'Unnamed 41 m' },
  ];
  const boulderFields: CircleFeature[] = [
    { x: 1620, y: 2180, r: 265 },
    { x: 2950, y: 1420, r: 205 },
    { x: 1150, y: 3080, r: 175 },
  ];
  const sandPatches: CircleFeature[] = [
    { x: 2420, y: 1850, r: 190 },
    { x: 760, y: 1180, r: 155 },
    { x: 3380, y: 2820, r: 145 },
  ];
  const habitat: LocalPoint = { x: 620, y: 3620 };

  const box = buildBoxworkNetwork(grid, rng);

  // Low-frequency fields, built coarse and sampled bilinearly (see fbmGrid).
  const S = AOI.sizeM;
  const fSwell = fbmGrid(96, 1150, seed + ':swell', 4, S);
  const fErode = fbmGrid(224, 290, seed + ':erode', 5, S);
  const fBoxMask = fbmGrid(96, 760, seed + ':boxmask', 3, S);
  const fWidth = fbmGrid(128, 420, seed + ':width', 2, S);
  const fDrift = fbmGrid(160, 210, seed + ':drift', 3, S);

  // Reused by the surface-unit pass below, so each is evaluated exactly once.
  const boxMaskGrid = new Float32Array(n);
  const halfWidthGrid = new Float32Array(n);

  const elevation = new Float32Array(n);

  for (let row = 0; row < grid; row++) {
    const py = AOI.sizeM - (row + 0.5) * cell;
    for (let col = 0; col < grid; col++) {
      const px = (col + 0.5) * cell;
      const i = row * grid + col;

      // 1. Regional ramp: ground rises toward Mount Sharp to the south-south-east.
      const along = (AOI.sizeM - py) / AOI.sizeM; // 0 at north edge, 1 at south edge
      const across = px / AOI.sizeM;
      const rampT = clamp(along * 0.86 + across * 0.14, 0, 1);
      // slightly convex: the foothills steepen as the crew climbs
      let h = lerp(ELEV_FLOOR + 6, ELEV_CEIL - 4, Math.pow(rampT, 1.18));

      // 2. Broad bedrock undulation + medium-scale erosion texture.
      h += sampleField(fSwell, 96, px, py, S) * 17;
      h += sampleField(fErode, 224, px, py, S) * 4.4;
      h += fbm2D(px / 64, py / 64, seed + ':grain', { octaves: 2 }) * 0.85;

      // 3. Boxwork ridges - raised polygonal vein network. Masked so the network
      //    thins out on the lower northern plain where the habitat sits, which
      //    is why that end of the AOI is the safe approach corridor.
      const boxMask = clamp(
        smoothstep(0.1, 0.52, along) * (0.72 + 0.28 * sampleField(fBoxMask, 96, px, py, S)),
        0,
        1,
      );
      const halfWidth = lerp(9, 26, 0.5 + 0.5 * sampleField(fWidth, 128, px, py, S));
      boxMaskGrid[i] = boxMask;
      halfWidthGrid[i] = halfWidth;
      const crest = 1 - smoothstep(0, halfWidth, box.edgeDistance[i]);
      const ridgeAmp = 7.4 * box.edgeStrength[i] * boxMask;
      h += Math.pow(crest, 1.45) * ridgeAmp;

      // 4. Impact craters: parabolic bowl with a raised rim.
      for (const c of craters) {
        const d = Math.hypot(px - c.x, py - c.y);
        if (d > c.r * 1.9) continue;
        const u = d / c.r;
        if (u < 1) h -= c.depth * (1 - u * u) * 0.92;
        const rim = Math.exp(-Math.pow((u - 1.02) / 0.21, 2));
        h += rim * c.depth * 0.34;
      }

      // 5. Boulder fields: blocky, high-frequency ridged relief.
      for (const b of boulderFields) {
        const d = Math.hypot(px - b.x, py - b.y);
        const inside = 1 - smoothstep(b.r * 0.6, b.r, d);
        if (inside <= 0) continue;
        const lumps = ridgedNoise2D(px / 17, py / 17, seed + ':blocks', { octaves: 3 });
        h += inside * lumps * 2.6;
      }

      // 6. Aeolian sand: smooth, infilling, slightly lowered.
      let sandCover = 0;
      for (const s of sandPatches) {
        const d = Math.hypot(px - s.x, py - s.y);
        sandCover = Math.max(sandCover, 1 - smoothstep(s.r * 0.45, s.r, d));
      }
      if (sandCover > 0) {
        const ripples = fbm2D(px / 38, py / 95, seed + ':ripple', { octaves: 2 }) * 0.55;
        h = lerp(h, h - 1.4 + ripples, sandCover * 0.85);
      }

      elevation[i] = h;
    }
  }

  // 7. Habitat pad: engineered flat spot (graded landing + hab zone).
  {
    const padR = 96;
    const padCol = Math.floor((habitat.x / AOI.sizeM) * grid);
    const padRow = Math.floor(((AOI.sizeM - habitat.y) / AOI.sizeM) * grid);
    const padH = elevation[padRow * grid + padCol];
    for (let row = 0; row < grid; row++) {
      const py = AOI.sizeM - (row + 0.5) * cell;
      if (Math.abs(py - habitat.y) > padR * 1.6) continue;
      for (let col = 0; col < grid; col++) {
        const px = (col + 0.5) * cell;
        const d = Math.hypot(px - habitat.x, py - habitat.y);
        if (d > padR * 1.6) continue;
        const t = 1 - smoothstep(padR * 0.7, padR * 1.6, d);
        const i = row * grid + col;
        elevation[i] = lerp(elevation[i], padH, t);
      }
    }
  }

  // --- derived rasters -------------------------------------------------------
  const slopeDeg = new Float32Array(n);
  const aspectDeg = new Float32Array(n);
  const hillshade = new Float32Array(n);
  const roughness = new Float32Array(n);

  const idx = (c: number, r: number) =>
    Math.min(grid - 1, Math.max(0, r)) * grid + Math.min(grid - 1, Math.max(0, c));

  // Sun from the NW, 35 deg above the horizon (the standard HiRISE look).
  const azRad = ((360 - 315 + 90) * Math.PI) / 180;
  const altRad = (35 * Math.PI) / 180;
  const sunZ = Math.sin(altRad);
  const sunXY = Math.cos(altRad);

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const i = row * grid + col;
      const z1 = elevation[idx(col - 1, row - 1)];
      const z2 = elevation[idx(col, row - 1)];
      const z3 = elevation[idx(col + 1, row - 1)];
      const z4 = elevation[idx(col - 1, row)];
      const z5 = elevation[i];
      const z6 = elevation[idx(col + 1, row)];
      const z7 = elevation[idx(col - 1, row + 1)];
      const z8 = elevation[idx(col, row + 1)];
      const z9 = elevation[idx(col + 1, row + 1)];

      // Horn's method
      const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * cell);
      const dzdy = (z1 + 2 * z2 + z3 - (z7 + 2 * z8 + z9)) / (8 * cell);
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      slopeDeg[i] = (slope * 180) / Math.PI;
      let aspect = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI;
      aspect = (90 - aspect + 360) % 360;
      aspectDeg[i] = aspect;

      const aspRad = (aspect * Math.PI) / 180;
      const hs = sunZ * Math.cos(slope) + sunXY * Math.sin(slope) * Math.cos(azRad - aspRad);
      hillshade[i] = clamp(hs, 0, 1);

      const mean = (z1 + z2 + z3 + z4 + z5 + z6 + z7 + z8 + z9) / 9;
      const varSum =
        (z1 - mean) ** 2 +
        (z2 - mean) ** 2 +
        (z3 - mean) ** 2 +
        (z4 - mean) ** 2 +
        (z5 - mean) ** 2 +
        (z6 - mean) ** 2 +
        (z7 - mean) ** 2 +
        (z8 - mean) ** 2 +
        (z9 - mean) ** 2;
      roughness[i] = Math.sqrt(varSum / 9);
    }
  }

  // Surface-unit masks, recomputed on the final grid for layer consistency.
  const ridge = new Float32Array(n);
  const sand = new Float32Array(n);
  const boulder = new Float32Array(n);

  for (let row = 0; row < grid; row++) {
    const py = AOI.sizeM - (row + 0.5) * cell;
    for (let col = 0; col < grid; col++) {
      const px = (col + 0.5) * cell;
      const i = row * grid + col;

      ridge[i] = clamp(
        Math.pow(1 - smoothstep(0, halfWidthGrid[i], box.edgeDistance[i]), 1.2) * boxMaskGrid[i],
        0,
        1,
      );

      let s = 0;
      for (const sp of sandPatches) {
        s = Math.max(s, 1 - smoothstep(sp.r * 0.45, sp.r, Math.hypot(px - sp.x, py - sp.y)));
      }
      // thin drift sand collects in the hollows between veins
      const drift = clamp(
        0.42 * (1 - ridge[i]) * (0.4 + 0.6 * sampleField(fDrift, 160, px, py, S)),
        0,
        0.45,
      );
      sand[i] = clamp(Math.max(s, drift) * (1 - 0.6 * ridge[i]), 0, 1);

      let b = 0;
      for (const bf of boulderFields) {
        b = Math.max(b, 1 - smoothstep(bf.r * 0.6, bf.r, Math.hypot(px - bf.x, py - bf.y)));
      }
      boulder[i] = clamp(b, 0, 1);
    }
  }

  let minElev = Infinity;
  let maxElev = -Infinity;
  for (let i = 0; i < n; i++) {
    if (elevation[i] < minElev) minElev = elevation[i];
    if (elevation[i] > maxElev) maxElev = elevation[i];
  }

  return {
    grid,
    cell,
    elevation,
    minElev,
    maxElev,
    slopeDeg,
    aspectDeg,
    hillshade,
    ridge,
    sand,
    boulder,
    roughness,
    craters,
    boulderFields,
    sandPatches,
    habitat,
  };
}

let cached: TerrainModel | null = null;

/** Memoised - the DEM is built once per session. */
export function getTerrain(): TerrainModel {
  if (!cached) cached = buildTerrain(TERRAIN_SEED);
  return cached;
}

export function sampleElevation(p: LocalPoint): number {
  const t = getTerrain();
  return sampleGridBilinear(t.elevation, t.grid, t.grid, p);
}

export function sampleSlope(p: LocalPoint): number {
  const t = getTerrain();
  return sampleGridBilinear(t.slopeDeg, t.grid, t.grid, p);
}
