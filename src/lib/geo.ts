/**
 * Local planar coordinate frame for the area of interest.
 *
 * The AOI is the footprint of the HiRISE stereo DTM that covers Curiosity's
 * real traverse through lower Mount Sharp. It is NOT square: the stereo swath
 * is a tall, narrow strip, so the frame carries separate X and Y extents.
 *
 * x = metres east of the AOI's west edge
 * y = metres north of the AOI's south edge
 *
 * These constants mirror public/data/dem/meta.json, which the pipeline writes.
 * `assertAoiMatches()` checks them against the loaded metadata at boot, so if
 * the pipeline is re-run over a different footprint the mismatch is reported
 * instead of silently mis-registering every layer.
 */

export const MARS_RADIUS_M = 3_396_190;

/** Gale Crater, lower Mount Sharp — the HiRISE DTM footprint. */
export const AOI = {
  name: 'Gale Crater — Lower Mount Sharp',
  subtitle: "Curiosity's traverse, Glen Torridon to the boxwork region",

  /** areographic bounds, degrees */
  west: 137.35334875,
  south: -4.923,
  east: 137.468,
  north: -4.6764,

  /** ground extent, metres */
  sizeXM: 6772.0869,
  sizeYM: 14617.1404,

  /** working grid (matches the shipped rasters) */
  gridW: 474,
  gridH: 1024,
} as const;

export const CELL_X_M = AOI.sizeXM / AOI.gridW; // 14.287 m
export const CELL_Y_M = AOI.sizeYM / AOI.gridH; // 14.275 m

export const CENTER_LAT = (AOI.north + AOI.south) / 2;
export const CENTER_LON = (AOI.east + AOI.west) / 2;

export const METRES_PER_DEG_LAT = (Math.PI * MARS_RADIUS_M) / 180;
export const METRES_PER_DEG_LON =
  (Math.PI * MARS_RADIUS_M * Math.cos((CENTER_LAT * Math.PI) / 180)) / 180;

/** AOI bounds in local metres. */
export const BOUNDS_M = {
  west: 0,
  south: 0,
  east: AOI.sizeXM,
  north: AOI.sizeYM,
} as const;

export interface LocalPoint {
  /** metres east of the AOI west edge */
  x: number;
  /** metres north of the AOI south edge */
  y: number;
}

export interface GridIndex {
  col: number;
  row: number;
}

export interface AoiBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function localToLatLon(p: LocalPoint): { lat: number; lon: number } {
  return {
    lat: AOI.south + (p.y / AOI.sizeYM) * (AOI.north - AOI.south),
    lon: AOI.west + (p.x / AOI.sizeXM) * (AOI.east - AOI.west),
  };
}

export function latLonToLocal(lat: number, lon: number): LocalPoint {
  return {
    x: ((lon - AOI.west) / (AOI.east - AOI.west)) * AOI.sizeXM,
    y: ((lat - AOI.south) / (AOI.north - AOI.south)) * AOI.sizeYM,
  };
}

/** Local metres -> grid cell. Row 0 is the NORTH edge (raster convention). */
export function localToGrid(p: LocalPoint, w: number = AOI.gridW, h: number = AOI.gridH): GridIndex {
  const col = Math.min(w - 1, Math.max(0, Math.floor((p.x / AOI.sizeXM) * w)));
  const row = Math.min(h - 1, Math.max(0, Math.floor(((AOI.sizeYM - p.y) / AOI.sizeYM) * h)));
  return { col, row };
}

/** Centre of a grid cell, in local metres. */
export function gridToLocal(col: number, row: number, w: number = AOI.gridW, h: number = AOI.gridH): LocalPoint {
  return {
    x: ((col + 0.5) / w) * AOI.sizeXM,
    y: AOI.sizeYM - ((row + 0.5) / h) * AOI.sizeYM,
  };
}

export function distanceM(a: LocalPoint, b: LocalPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Bearing in degrees, 0 = north, clockwise. */
export function bearingDeg(from: LocalPoint, to: LocalPoint): number {
  const d = (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
  return (d + 360) % 360;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassLabel(bearing: number): string {
  return COMPASS[Math.round((bearing % 360) / 22.5) % 16];
}

/** Areographic degrees formatted the way PDS products label them. */
export function formatLatLon(p: LocalPoint): string {
  const { lat, lon } = localToLatLon(p);
  const latStr = `${Math.abs(lat).toFixed(5)}°${lat < 0 ? 'S' : 'N'}`;
  const lonStr = `${lon.toFixed(5)}°E`;
  return `${latStr} ${lonStr}`;
}

/**
 * Guard against the baked-in frame drifting from the shipped rasters.
 * Returns a human-readable complaint, or null when everything agrees.
 */
export function assertAoiMatches(meta: {
  bounds: AoiBounds;
  grid: { width: number; height: number };
}): string | null {
  const b = meta.bounds;
  const near = (a: number, c: number, tol: number) => Math.abs(a - c) <= tol;
  const problems: string[] = [];
  if (!near(b.west, AOI.west, 1e-6)) problems.push(`west ${b.west} vs ${AOI.west}`);
  if (!near(b.east, AOI.east, 1e-6)) problems.push(`east ${b.east} vs ${AOI.east}`);
  if (!near(b.south, AOI.south, 1e-6)) problems.push(`south ${b.south} vs ${AOI.south}`);
  if (!near(b.north, AOI.north, 1e-6)) problems.push(`north ${b.north} vs ${AOI.north}`);
  if (meta.grid.width !== AOI.gridW) problems.push(`grid width ${meta.grid.width} vs ${AOI.gridW}`);
  if (meta.grid.height !== AOI.gridH) problems.push(`grid height ${meta.grid.height} vs ${AOI.gridH}`);
  return problems.length
    ? `AOI in lib/geo.ts does not match public/data/dem/meta.json: ${problems.join(', ')}. ` +
        'Re-run scripts/fetch_dem.py or update the constants.'
    : null;
}
