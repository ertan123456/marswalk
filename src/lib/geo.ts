/**
 * Local planar coordinate frame for the area of interest.
 *
 * The map works in LOCAL METRES (x = east, y = north, origin = SW corner of the
 * AOI) because Mars raster products at this scale are delivered in a local
 * equirectangular / polar-stereographic projection, and Leaflet's CRS.Simple
 * maps metres to screen pixels without any Earth-datum assumptions.
 *
 * Areographic lat/lon is derived only for display + for matching real PDS
 * products once the mock adapters are swapped out.
 */

export const MARS_RADIUS_M = 3_396_190;

/** Gale Crater, Mount Sharp foothills — boxwork formations region. */
export const AOI = {
  name: 'Gale Crater — Mount Sharp Boxwork Region',
  /** AOI centre, areographic (planetocentric) degrees. */
  centerLat: -4.72,
  centerLon: 137.403,
  /** Square AOI edge length, metres. */
  sizeM: 4000,
  /** DEM grid resolution. */
  grid: 512,
} as const;

/** Metres per DEM cell. */
export const CELL_M = AOI.sizeM / AOI.grid; // 7.8125 m

export const METRES_PER_DEG_LAT = (Math.PI * MARS_RADIUS_M) / 180;
export const METRES_PER_DEG_LON =
  (Math.PI * MARS_RADIUS_M * Math.cos((AOI.centerLat * Math.PI) / 180)) / 180;

/** AOI bounds in local metres. */
export const BOUNDS_M = {
  west: 0,
  south: 0,
  east: AOI.sizeM,
  north: AOI.sizeM,
} as const;

export interface LocalPoint {
  /** metres east of AOI south-west corner */
  x: number;
  /** metres north of AOI south-west corner */
  y: number;
}

export interface GridIndex {
  col: number;
  row: number;
}

export function localToLatLon(p: LocalPoint): { lat: number; lon: number } {
  const dx = p.x - AOI.sizeM / 2;
  const dy = p.y - AOI.sizeM / 2;
  return {
    lat: AOI.centerLat + dy / METRES_PER_DEG_LAT,
    lon: AOI.centerLon + dx / METRES_PER_DEG_LON,
  };
}

/** Local metres -> DEM cell. Row 0 is the NORTH edge (raster convention). */
export function localToGrid(p: LocalPoint, grid = AOI.grid): GridIndex {
  const col = Math.min(grid - 1, Math.max(0, Math.floor((p.x / AOI.sizeM) * grid)));
  const row = Math.min(grid - 1, Math.max(0, Math.floor(((AOI.sizeM - p.y) / AOI.sizeM) * grid)));
  return { col, row };
}

/** Centre of a DEM cell, in local metres. */
export function gridToLocal(col: number, row: number, grid = AOI.grid): LocalPoint {
  const cell = AOI.sizeM / grid;
  return { x: (col + 0.5) * cell, y: AOI.sizeM - (row + 0.5) * cell };
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
  return COMPASS[Math.round(((bearing % 360) / 22.5)) % 16];
}

/** Areographic degrees formatted the way PDS products label them. */
export function formatLatLon(p: LocalPoint): string {
  const { lat, lon } = localToLatLon(p);
  const latStr = `${Math.abs(lat).toFixed(5)}${lat < 0 ? 'S' : 'N'}`;
  const lonStr = `${lon.toFixed(5)}E`;
  return `${latStr} ${lonStr}`;
}
