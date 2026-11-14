/**
 * MOCK orbital basemap.
 *
 * Stands in for an MRO HiRISE RED-band orthoimage (25 cm/px, map-projected and
 * contrast-stretched) mosaicked onto an MRO CTX frame (~5 m/px) outside the
 * HiRISE footprint. Built from the synthetic DEM's hillshade plus albedo
 * contributions from the same surface units the other layers use, so what looks
 * bright here reads as sulfate on the spectral layer and as high thermal
 * inertia on the THEMIS layer.
 */

import { AOI } from '../../lib/geo';
import { clamp, fbm2D, fbmGrid, sampleField } from '../../lib/noise';
import { renderGridToDataURL } from '../../lib/raster';
import { getTerrain, TERRAIN_SEED } from './terrain';

let cache: string | null = null;

export function getOpticalBasemapURL(): string {
  if (cache) return cache;
  const t = getTerrain();
  const grid = t.grid;
  const cell = AOI.sizeM / grid;
  const S = AOI.sizeM;
  const fAlbedo = fbmGrid(128, 420, TERRAIN_SEED + ':albedo', 4, S);
  const fFine = fbmGrid(512, 26, TERRAIN_SEED + ':fine', 2, S);

  // Albedo, then a warm HiRISE-stretch tint. Mars orbital imagery at this
  // stretch is near-grey with a faint ochre cast.
  cache = renderGridToDataURL(grid, grid, (i, out, o) => {
    const row = (i / grid) | 0;
    const col = i % grid;
    const px = (col + 0.5) * cell;
    const py = AOI.sizeM - (row + 0.5) * cell;

    let albedo = 0.46;
    albedo += t.ridge[i] * 0.2; // bright sulfate vein crests
    albedo -= t.sand[i] * 0.17; // dark basaltic sand
    albedo += t.boulder[i] * 0.04; // blocks scatter light
    albedo += sampleField(fAlbedo, 128, px, py, S) * 0.055;
    albedo += sampleField(fFine, 512, px, py, S) * 0.028;
    // sensor-level speckle so it reads as an image product, not a render
    albedo += fbm2D(col * 1.7, row * 1.7, TERRAIN_SEED + ':speckle', { octaves: 1 }) * 0.016;

    const shade = 0.3 + 0.78 * t.hillshade[i];
    const lum = clamp(albedo * shade * 1.72, 0, 1);

    // gentle S-curve stretch
    const s = clamp(lum * lum * (3 - 2 * lum) * 0.92 + lum * 0.08, 0, 1);
    const v = 16 + s * 228;

    out[o] = clamp(v * 1.035, 0, 255);
    out[o + 1] = clamp(v * 0.985, 0, 255);
    out[o + 2] = clamp(v * 0.93, 0, 255);
    out[o + 3] = 255;
  });
  return cache;
}
