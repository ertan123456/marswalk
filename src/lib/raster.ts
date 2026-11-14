/** Grid sampling, colour ramps, and grid -> PNG rendering. */

import { AOI } from './geo';
import type { LocalPoint } from './geo';
import type { ColorStop } from '../data/types';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** Sample a sorted colour ramp. */
export function rampColor(stops: ColorStop[], value: number): Rgb {
  if (stops.length === 0) return { r: 0, g: 0, b: 0 };
  if (value <= stops[0].value) return parseHex(stops[0].color);
  const last = stops[stops.length - 1];
  if (value >= last.value) return parseHex(last.color);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (value >= a.value && value <= b.value) {
      const t = b.value === a.value ? 0 : (value - a.value) / (b.value - a.value);
      return mixRgb(parseHex(a.color), parseHex(b.color), t);
    }
  }
  return parseHex(last.color);
}

export function rampCssGradient(stops: ColorStop[]): string {
  if (stops.length < 2) return stops[0]?.color ?? 'transparent';
  const lo = stops[0].value;
  const hi = stops[stops.length - 1].value;
  const span = hi - lo || 1;
  const parts = stops.map((s) => `${s.color} ${(((s.value - lo) / span) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** Bilinear sample of a grid at a local-metre point. */
export function sampleGridBilinear(
  values: ArrayLike<number>,
  width: number,
  height: number,
  p: LocalPoint,
  sizeM = AOI.sizeM,
): number {
  const fx = (p.x / sizeM) * width - 0.5;
  const fy = ((sizeM - p.y) / sizeM) * height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const cx = (v: number) => Math.min(width - 1, Math.max(0, v));
  const cy = (v: number) => Math.min(height - 1, Math.max(0, v));
  const a = values[cy(y0) * width + cx(x0)];
  const b = values[cy(y0) * width + cx(x0 + 1)];
  const c = values[cy(y0 + 1) * width + cx(x0)];
  const d = values[cy(y0 + 1) * width + cx(x0 + 1)];
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

/** Nearest sample of a grid at a local-metre point (categorical data). */
export function sampleGridNearest(
  values: ArrayLike<number>,
  width: number,
  height: number,
  p: LocalPoint,
  sizeM = AOI.sizeM,
): number {
  const col = Math.min(width - 1, Math.max(0, Math.floor((p.x / sizeM) * width)));
  const row = Math.min(height - 1, Math.max(0, Math.floor(((sizeM - p.y) / sizeM) * height)));
  return values[row * width + col];
}

/**
 * Render a grid to a PNG data URL. `paint` writes RGBA for pixel index i.
 * Mock adapters use this so the UI only ever deals with image overlays.
 */
export function renderGridToDataURL(
  width: number,
  height: number,
  paint: (i: number, out: Uint8ClampedArray, o: number) => void,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(width, height);
  const d = img.data;
  for (let i = 0; i < width * height; i++) paint(i, d, i * 4);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
