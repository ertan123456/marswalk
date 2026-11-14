/**
 * Turn a boolean raster mask into closed polygon rings in local metres.
 *
 * Used to publish raster-derived hazards (slope > threshold, boulder cover,
 * sand cover) as a vector layer the map, the planner and the 3D view can all
 * consume. Boundaries follow cell edges, which is what a real GIS hazard
 * polygon derived from a DEM looks like before smoothing.
 */

import { AOI } from './geo';
import type { LocalPoint } from './geo';

type Key = string;

function key(x: number, y: number): Key {
  return x.toFixed(2) + ',' + y.toFixed(2);
}

export interface RingOptions {
  /** drop rings smaller than this many square metres */
  minAreaM2?: number;
  /** collapse near-collinear vertices */
  simplify?: boolean;
}

export function ringArea(ring: LocalPoint[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function ringCentroid(ring: LocalPoint[]): LocalPoint {
  const a = ringArea(ring);
  if (Math.abs(a) < 1e-6) return ring[0] ?? { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function dropCollinear(ring: LocalPoint[]): LocalPoint[] {
  if (ring.length < 4) return ring;
  const out: LocalPoint[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  return out.length >= 3 ? out : ring;
}

/**
 * Extract boundary rings of the `true` region of a mask. Rings are
 * counter-clockwise with the interior on the left.
 */
export function maskToRings(
  mask: Uint8Array,
  width: number,
  height: number,
  opts: RingOptions = {},
): LocalPoint[][] {
  const { minAreaM2 = 0, simplify = true } = opts;
  const cellX = AOI.sizeXM / width;
  const cellY = AOI.sizeYM / height;
  const inside = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < width && r < height && mask[r * width + c] === 1;

  // Directed boundary segments, interior on the left.
  const starts = new Map<Key, { from: LocalPoint; to: LocalPoint }[]>();
  const push = (from: LocalPoint, to: LocalPoint) => {
    const k = key(from.x, from.y);
    const arr = starts.get(k);
    if (arr) arr.push({ from, to });
    else starts.set(k, [{ from, to }]);
  };

  for (let r = 0; r < height; r++) {
    const yTop = AOI.sizeYM - r * cellY;
    const yBot = yTop - cellY;
    for (let c = 0; c < width; c++) {
      if (!inside(c, r)) continue;
      const x0 = c * cellX;
      const x1 = x0 + cellX;
      if (!inside(c, r - 1)) push({ x: x1, y: yTop }, { x: x0, y: yTop });
      if (!inside(c, r + 1)) push({ x: x0, y: yBot }, { x: x1, y: yBot });
      if (!inside(c - 1, r)) push({ x: x0, y: yTop }, { x: x0, y: yBot });
      if (!inside(c + 1, r)) push({ x: x1, y: yBot }, { x: x1, y: yTop });
    }
  }

  const rings: LocalPoint[][] = [];
  let guard = 0;
  const maxSteps = width * height * 8;

  for (const [, segs] of starts) {
    while (segs.length > 0) {
      const first = segs.pop();
      if (!first) break;
      const ring: LocalPoint[] = [first.from];
      let cur = first.to;
      const startKey = key(first.from.x, first.from.y);

      while (key(cur.x, cur.y) !== startKey && guard++ < maxSteps) {
        ring.push(cur);
        const arr = starts.get(key(cur.x, cur.y));
        const next = arr && arr.length > 0 ? arr.pop() : undefined;
        if (!next) break;
        cur = next.to;
      }
      if (ring.length >= 4) {
        const finished = simplify ? dropCollinear(ring) : ring;
        if (Math.abs(ringArea(finished)) >= minAreaM2) rings.push(finished);
      }
    }
  }

  return rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
}

export function pointInRing(p: LocalPoint, ring: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
