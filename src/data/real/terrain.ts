/**
 * The real terrain model, loaded from the pipeline's static assets.
 *
 * Everything downstream — the A* planner, the hazard layer, the 3D mesh, the
 * HUD — reads this one object, exactly as it previously read the synthetic
 * generator. The difference is that `elevation` now comes from a HiRISE stereo
 * DTM rather than from noise.
 *
 * PROVENANCE
 *   elevation, coverage   REAL     (MRO HiRISE stereo DTM, via scripts/fetch_dem.py)
 *   hazard classes        DERIVED  (scripts/derive_terrain.py)
 *   slope, aspect,
 *   hillshade, roughness  DERIVED  (computed here from the real elevation)
 */

import { AOI, CELL_X_M, CELL_Y_M, assertAoiMatches, gridToLocal } from '../../lib/geo';
import type { AoiBounds, LocalPoint } from '../../lib/geo';
import { loadJson, loadPixels } from '../../lib/png';

export interface DemMeta {
  provenance: string;
  product_name: string;
  title: string;
  mission: string;
  instrument: string;
  source_url: string;
  credit: string;
  native_map_scale_m_per_px: number;
  projection: string;
  elevation_datum: string;
  bounds: AoiBounds;
  size_m: { width: number; height: number };
  grid: { width: number; height: number };
  ground_resolution_m: { x: number; y: number };
  elevation_m: { min: number; max: number };
  encoding: string;
  stereo_coverage_percent: number;
  nodata_filled_cells: number;
  retrieved: string;
}

export interface HazardClassMeta {
  code: number;
  key: string;
  label: string;
  color: string;
  passable: boolean;
  cost_factor: number | null;
  detail: string;
}

export interface DerivedMeta {
  provenance: string;
  derived_from: { product_name: string; source_url: string; provenance: string };
  method: Record<string, string>;
  thresholds_deg: { caution: number; impassable: number };
  thresholds_roughness_m: { caution: number; impassable: number };
  classes: HazardClassMeta[];
  statistics: {
    slope_median_deg: number;
    slope_p95_deg: number;
    slope_max_deg: number;
    class_cell_counts: Record<string, number>;
  };
  credit: string;
}

export interface TerrainModel {
  width: number;
  height: number;
  cellX: number;
  cellY: number;
  /** metres relative to the Mars areoid, row 0 = north edge */
  elevation: Float32Array;
  minElev: number;
  maxElev: number;
  /** 1 where the stereo DTM has real data */
  coverage: Uint8Array;
  /** hazard class code per cell (see DerivedMeta.classes) */
  hazard: Uint8Array;
  slopeDeg: Float32Array;
  aspectDeg: Float32Array;
  hillshade: Float32Array;
  /** detrended local relief, metres */
  roughness: Float32Array;
  habitat: LocalPoint;
  habitatRationale: string;
  demMeta: DemMeta;
  derivedMeta: DerivedMeta;
}

/** Hazard class codes, as written by scripts/derive_terrain.py. */
export const HAZARD = {
  NOMINAL: 0,
  CAUTION: 1,
  SLOPE_IMPASSABLE: 2,
  ROUGH: 3,
  NO_DATA: 4,
} as const;

/** Slope and aspect by Horn's method, honouring non-square cells. */
function computeSlopeAspect(
  z: Float32Array,
  w: number,
  h: number,
  dx: number,
  dy: number,
): { slopeDeg: Float32Array; aspectDeg: Float32Array; hillshade: Float32Array } {
  const n = w * h;
  const slopeDeg = new Float32Array(n);
  const aspectDeg = new Float32Array(n);
  const hillshade = new Float32Array(n);

  const at = (c: number, r: number) =>
    z[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))];

  // Sun from the north-west at 38 degrees, the usual HiRISE presentation.
  const azRad = ((360 - 315 + 90) * Math.PI) / 180;
  const altRad = (38 * Math.PI) / 180;
  const sunZ = Math.sin(altRad);
  const sunXY = Math.cos(altRad);

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const z1 = at(c - 1, r - 1), z2 = at(c, r - 1), z3 = at(c + 1, r - 1);
      const z4 = at(c - 1, r), z6 = at(c + 1, r);
      const z7 = at(c - 1, r + 1), z8 = at(c, r + 1), z9 = at(c + 1, r + 1);

      const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * dx);
      const dzdy = (z1 + 2 * z2 + z3 - (z7 + 2 * z8 + z9)) / (8 * dy);
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      slopeDeg[i] = (slope * 180) / Math.PI;

      let aspect = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI;
      aspect = (90 - aspect + 360) % 360;
      aspectDeg[i] = aspect;

      const aspRad = (aspect * Math.PI) / 180;
      const hs = sunZ * Math.cos(slope) + sunXY * Math.sin(slope) * Math.cos(azRad - aspRad);
      hillshade[i] = hs < 0 ? 0 : hs > 1 ? 1 : hs;
    }
  }
  return { slopeDeg, aspectDeg, hillshade };
}

/** Detrended local relief — the same statistic the Python pipeline reports. */
function computeRoughness(z: Float32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const trend = new Float32Array(n);
  const at = (c: number, r: number) =>
    z[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))];

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let sum = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) sum += at(c + b, r + a);
      trend[r * w + c] = sum / 25;
    }
  }

  const resid = new Float32Array(n);
  for (let i = 0; i < n; i++) resid[i] = z[i] - trend[i];

  const out = new Float32Array(n);
  const ra = (c: number, r: number) =>
    resid[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let s = 0;
      let s2 = 0;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const v = ra(c + b, r + a);
          s += v;
          s2 += v * v;
        }
      }
      const mean = s / 9;
      out[r * w + c] = Math.sqrt(Math.max(0, s2 / 9 - mean * mean));
    }
  }
  return out;
}

/**
 * Pick the habitat pad from the data, as the brief asks: a flat, low-hazard
 * site at the edge of the AOI. We search the lower (northern) third, score
 * candidates on local slope and hazard, and take the best.
 */
function chooseHabitat(
  slopeDeg: Float32Array,
  hazard: Uint8Array,
  coverage: Uint8Array,
  w: number,
  h: number,
): { point: LocalPoint; rationale: string } {
  const R = 4; // ~57 m pad radius
  const searchRows = Math.floor(h * 0.3); // northern third
  let best = { score: Infinity, col: -1, row: -1, slope: 0 };

  for (let r = R; r < searchRows; r++) {
    for (let c = R; c < w - R; c++) {
      let slopeSum = 0;
      let worst = 0;
      let cells = 0;
      let covered = true;
      for (let a = -R; a <= R; a++) {
        for (let b = -R; b <= R; b++) {
          const i = (r + a) * w + (c + b);
          if (!coverage[i]) {
            covered = false;
            break;
          }
          slopeSum += slopeDeg[i];
          worst = Math.max(worst, hazard[i]);
          cells++;
        }
        if (!covered) break;
      }
      if (!covered || cells === 0 || worst > HAZARD.NOMINAL) continue;

      const meanSlope = slopeSum / cells;
      // prefer flat ground, near the north edge, not hard against a side wall
      const edgePull = (r / searchRows) * 1.6;
      const centrePull = Math.abs(c - w / 2) / (w / 2) * 1.2;
      const score = meanSlope + edgePull + centrePull;
      if (score < best.score) best = { score, col: c, row: r, slope: meanSlope };
    }
  }

  if (best.col < 0) {
    // Nothing fully nominal: fall back to the flattest covered cell anywhere.
    let fb = { slope: Infinity, col: Math.floor(w / 2), row: Math.floor(h * 0.1) };
    for (let r = R; r < h - R; r++) {
      for (let c = R; c < w - R; c++) {
        const i = r * w + c;
        if (!coverage[i]) continue;
        if (slopeDeg[i] < fb.slope) fb = { slope: slopeDeg[i], col: c, row: r };
      }
    }
    return {
      point: gridToLocal(fb.col, fb.row, w, h),
      rationale:
        `No fully hazard-free pad exists in this AOI; sited on the flattest cell with stereo ` +
        `coverage (${fb.slope.toFixed(1)}° local slope).`,
    };
  }

  return {
    point: gridToLocal(best.col, best.row, w, h),
    rationale:
      `Chosen by slope analysis of the real DTM: flattest hazard-free pad in the northern ` +
      `third of the AOI, ${best.slope.toFixed(1)}° mean slope over a ${Math.round(R * CELL_X_M)} m radius, ` +
      `clear of broken ground and fully inside the stereo swath.`,
  };
}

let cached: TerrainModel | null = null;
let loading: Promise<TerrainModel> | null = null;

export async function loadTerrain(onStage?: (s: string) => void): Promise<TerrainModel> {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    onStage?.('Loading HiRISE stereo DTM');
    const [demMeta, derivedMeta] = await Promise.all([
      loadJson<DemMeta>('data/dem/meta.json'),
      loadJson<DerivedMeta>('data/derived/meta.json'),
    ]);

    const mismatch = assertAoiMatches(demMeta);
    if (mismatch) throw new Error(mismatch);

    const [dem, haz] = await Promise.all([
      loadPixels('data/dem/heightmap.png'),
      loadPixels('data/derived/hazard.png'),
    ]);

    const w = dem.w;
    const h = dem.h;
    if (w !== AOI.gridW || h !== AOI.gridH) {
      throw new Error(`heightmap is ${w}x${h}, expected ${AOI.gridW}x${AOI.gridH}`);
    }

    onStage?.('Decoding elevation');
    const n = w * h;
    const elevation = new Float32Array(n);
    const coverage = new Uint8Array(n);
    const zmin = demMeta.elevation_m.min;
    const zmax = demMeta.elevation_m.max;
    const span = zmax - zmin;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const v16 = (dem.data[o] << 8) | dem.data[o + 1];
      elevation[i] = zmin + (v16 / 65535) * span;
      coverage[i] = dem.data[o + 2] > 127 ? 1 : 0;
    }

    const hazard = new Uint8Array(n);
    for (let i = 0; i < n; i++) hazard[i] = haz.data[i * 4];

    onStage?.('Computing slope and relief');
    const { slopeDeg, aspectDeg, hillshade } = computeSlopeAspect(
      elevation, w, h, CELL_X_M, CELL_Y_M,
    );
    const roughness = computeRoughness(elevation, w, h);

    onStage?.('Siting the habitat');
    const { point, rationale } = chooseHabitat(slopeDeg, hazard, coverage, w, h);

    cached = {
      width: w,
      height: h,
      cellX: CELL_X_M,
      cellY: CELL_Y_M,
      elevation,
      minElev: zmin,
      maxElev: zmax,
      coverage,
      hazard,
      slopeDeg,
      aspectDeg,
      hillshade,
      roughness,
      habitat: point,
      habitatRationale: rationale,
      demMeta,
      derivedMeta,
    };
    return cached;
  })();

  return loading;
}

/** Synchronous accessor — valid only after loadTerrain() has resolved. */
export function getTerrain(): TerrainModel {
  if (!cached) throw new Error('Terrain not loaded yet: await loadTerrain() during boot');
  return cached;
}

export function terrainReady(): boolean {
  return cached !== null;
}

/** Class metadata for a hazard code. */
export function hazardClass(code: number): HazardClassMeta | undefined {
  return cached?.derivedMeta.classes.find((c) => c.code === code);
}
