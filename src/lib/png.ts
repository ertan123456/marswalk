/**
 * Decode a PNG into raw RGBA bytes via an offscreen canvas.
 *
 * Shared by every loader that ships pixel data (elevation, hazard classes,
 * science regions). Note the ImageBitmap dimensions are read before close():
 * closing one zeroes them.
 */

export interface Pixels {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

export async function loadPixels(path: string): Promise<Pixels> {
  const base = import.meta.env.BASE_URL || '/';
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);
  const w = bmp.width;
  const h = bmp.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  bmp.close();
  return { data: img.data, w, h };
}

export async function loadJson<T>(path: string): Promise<T> {
  const base = import.meta.env.BASE_URL || '/';
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}
