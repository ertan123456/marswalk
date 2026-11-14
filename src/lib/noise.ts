/** Deterministic value noise + fBm, used by every mock terrain generator. */

import { hashString } from './rng';

function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Value noise in [-1,1] over a continuous (x,y) plane. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smootherstep(x - xi);
  const yf = smootherstep(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * xf;
  const bot = c + (d - c) * xf;
  return (top + (bot - top) * yf) * 2 - 1;
}

export interface FbmOptions {
  octaves?: number;
  frequency?: number;
  lacunarity?: number;
  gain?: number;
}

/** Fractal Brownian motion, normalised to roughly [-1,1]. */
export function fbm2D(x: number, y: number, seed: number | string, opts: FbmOptions = {}): number {
  const s = typeof seed === 'string' ? hashString(seed) : seed;
  const { octaves = 5, frequency = 1, lacunarity = 2.03, gain = 0.5 } = opts;
  let amp = 1;
  let freq = frequency;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2D(x * freq, y * freq, (s + o * 7919) >>> 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal — sharp crests, used for boulder-field roughness. */
export function ridgedNoise2D(x: number, y: number, seed: number | string, opts: FbmOptions = {}): number {
  const s = typeof seed === 'string' ? hashString(seed) : seed;
  const { octaves = 4, frequency = 1, lacunarity = 2.07, gain = 0.5 } = opts;
  let amp = 1;
  let freq = frequency;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, y * freq, (s + o * 6151) >>> 0));
    sum += amp * (n * n);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Precomputed fBm field.
 *
 * Low-frequency noise (hundreds of metres) does not need to be evaluated at the
 * 7.8 m DEM posting. Build it on a coarse grid once and bilinearly sample it,
 * which is what cuts terrain synthesis from seconds to milliseconds.
 *
 * Row 0 is the north edge, matching every other grid in the app.
 */
export function fbmGrid(
  n: number,
  scaleM: number,
  seed: string,
  octaves: number,
  sizeM: number,
): Float32Array {
  const out = new Float32Array(n * n);
  const cell = sizeM / n;
  for (let r = 0; r < n; r++) {
    const py = sizeM - (r + 0.5) * cell;
    for (let c = 0; c < n; c++) {
      const px = (c + 0.5) * cell;
      out[r * n + c] = fbm2D(px / scaleM, py / scaleM, seed, { octaves });
    }
  }
  return out;
}

/** Bilinear read of a precomputed field at a point in AOI-local metres. */
export function sampleField(values: Float32Array, n: number, px: number, py: number, sizeM: number): number {
  const fx = (px / sizeM) * n - 0.5;
  const fy = ((sizeM - py) / sizeM) * n - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const cx = (v: number) => (v < 0 ? 0 : v > n - 1 ? n - 1 : v);
  const cy = cx;
  const a = values[cy(y0) * n + cx(x0)];
  const b = values[cy(y0) * n + cx(x0 + 1)];
  const c = values[cy(y0 + 1) * n + cx(x0)];
  const d = values[cy(y0 + 1) * n + cx(x0 + 1)];
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}
