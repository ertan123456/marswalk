/**
 * Turn any grid-shaped LayerData into an overlay image, using the adapter's own
 * legend as the single source of colour truth.
 *
 * Both the 2D map and the 3D drape call this, so a layer always looks the same
 * in both views, and adding a layer never means writing rendering code.
 */

import { parseHex, rampColor, renderGridToDataURL } from './raster';
import type { LayerData, LegendSpec } from '../data/types';

const cache = new Map<string, string>();

export function layerImageURL(layerId: string, data: LayerData, legend: LegendSpec): string | null {
  const hit = cache.get(layerId);
  if (hit) return hit;

  let url: string | null = null;

  if (data.type === 'raster-image') {
    url = data.url;
  } else if (data.type === 'raster-grid' && legend.type === 'continuous') {
    const { values, width, height } = data;
    const lo = legend.min;
    const hi = legend.max;
    url = renderGridToDataURL(width, height, (i, out, o) => {
      const v = values[i];
      const c = rampColor(legend.stops, Math.min(hi, Math.max(lo, v)));
      out[o] = c.r;
      out[o + 1] = c.g;
      out[o + 2] = c.b;
      out[o + 3] = 255;
    });
  } else if (data.type === 'categorical-grid') {
    const { codes, width, height, categories } = data;
    // An unpainted class is simply absent from the palette, which the writer
    // below already renders as fully transparent.
    const palette = new Map(
      categories.filter((c) => !c.unpainted).map((c) => [c.code, parseHex(c.color)]),
    );
    url = renderGridToDataURL(width, height, (i, out, o) => {
      const c = palette.get(codes[i]);
      out[o] = c ? c.r : 0;
      out[o + 1] = c ? c.g : 0;
      out[o + 2] = c ? c.b : 0;
      out[o + 3] = c ? 255 : 0;
    });
  }

  if (url) cache.set(layerId, url);
  return url;
}
