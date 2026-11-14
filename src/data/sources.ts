/**
 * The mock -> real switch, and every external endpoint in one place.
 *
 * This file is deliberately import-free: the adapters read it, and config.ts
 * re-exports it, so there is no circular import between the registry and the
 * adapters it registers. Treat config.ts as the public entry point.
 *
 * NOTHING here is a guessed URL. Every endpoint is null until someone pastes in
 * a product link they have actually opened, and every adapter falls back to its
 * mock generator while its flag is false. See DATA_TODO.md for the shopping
 * list and where each product comes from.
 */

/** Flip a flag to true only once the matching endpoint below is filled in. */
export const USE_REAL_DATA = {
  optical: false,
  topography: false,
  thermal: false,
  spectral: false,
  radiation: false,
  atmospheric: false,
  hazards: false,
  science: false,
} as const;

/**
 * External data endpoints. All null by default.
 *
 * `hirise` / `ctx` expect an already map-projected image covering the AOI
 * footprint, or a WMTS/XYZ tile template if you switch the basemap layer from
 * an ImageOverlay to a TileLayer.
 */
export const ENDPOINTS: Record<string, string | null> = {
  /** HiRISE RED orthoimage or Mars Trek tile template for the AOI */
  hirise: null,
  /** CTX mosaic fallback basemap */
  ctx: null,
  /** HiRISE stereo DTM (DTEEC) covering the AOI */
  hiriseDtm: null,
  /** THEMIS-derived thermal inertia raster */
  themisThermalInertia: null,
  /** CRISM summary-parameter browse product(s) */
  crismSummary: null,
  /** Curiosity RAD dose-rate table (PDS PPI node) */
  radDoseRate: null,
  /** Curiosity REMS ENVRDR hourly table */
  remsEnvironmental: null,
  /** Curiosity raw-image query endpoint for ground-level waypoint views */
  mslRawImages: null,
  /** Reviewed mobility-hazard GeoJSON */
  hazardGeoJson: null,
};

/** True while any layer is still synthetic — drives the global MOCK banner. */
export function anyMock(): boolean {
  return Object.values(USE_REAL_DATA).some((v) => v === false);
}
