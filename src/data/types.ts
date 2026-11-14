/** Shared contract between every data adapter and the UI. */

import type { LocalPoint } from '../lib/geo';

export type LayerKind =
  | 'optical'
  | 'topographic'
  | 'thermal'
  | 'spectral'
  | 'radiation'
  | 'atmospheric'
  | 'hazard'
  | 'science';

/** AOI-local bounds in metres (x east, y north from the AOI SW corner). */
export interface BoundsM {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** A continuous scalar field sampled on a regular grid. Row 0 = north edge. */
export interface RasterGridData {
  type: 'raster-grid';
  width: number;
  height: number;
  /** length = width * height, row-major from the north edge */
  values: Float32Array;
  bounds: BoundsM;
  min: number;
  max: number;
  unit: string;
}

/** A pre-rendered image (orbital imagery, hillshade, colourised raster). */
export interface RasterImageData {
  type: 'raster-image';
  /** object/data URL ready for <img> or Leaflet ImageOverlay */
  url: string;
  width: number;
  height: number;
  bounds: BoundsM;
}

export interface CategoryDef {
  code: number;
  label: string;
  color: string;
  note?: string;
  /**
   * Draw nothing for this class and leave the basemap showing through.
   *
   * For the ordinary, expected state. Shading "nothing is wrong here" paints
   * the majority of the map for no information gain and buries the ground the
   * imagery actually shows; only the exceptions need ink. The class is still
   * in the data and the planner still reads it, so the legend lists it as
   * unshaded rather than hiding it.
   */
  unpainted?: boolean;
}

/** A classified / categorical map (e.g. mineral units). */
export interface CategoricalGridData {
  type: 'categorical-grid';
  width: number;
  height: number;
  /** length = width * height, row-major from the north edge */
  codes: Uint8Array;
  categories: CategoryDef[];
  bounds: BoundsM;
}

export type HazardClass = 'boulder-field' | 'steep-slope' | 'sand-trap';

export interface VectorFeature {
  id: string;
  /** closed polygon ring in local metres */
  ring: LocalPoint[];
  hazardClass: HazardClass;
  label: string;
  /** multiplicative traverse cost; Infinity = impassable */
  costFactor: number;
  passable: boolean;
  detail: string;
}

export interface VectorData {
  type: 'vector';
  features: VectorFeature[];
  bounds: BoundsM;
}

export interface TimeSample {
  /** hours from EVA sol midnight (local mean solar time) */
  hour: number;
  [key: string]: number;
}

export interface SeriesDef {
  key: string;
  label: string;
  unit: string;
  color: string;
}

export interface TimeSeriesData {
  type: 'timeseries';
  samples: TimeSample[];
  series: SeriesDef[];
  /** optional flagged events (e.g. solar particle event window) */
  events: TimeEvent[];
}

export interface TimeEvent {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  severity: 'info' | 'caution' | 'danger';
  detail: string;
}

export interface SciencePoint {
  id: string;
  code: string;
  title: string;
  position: LocalPoint;
  targetMineral: string;
  whyItMatters: string;
  /** minutes of crew task time on station */
  taskMinutes: number;
  /** sol whose surveyed rover position anchors this station (REAL) */
  sol?: number;
  /** elevation from the rover waypoint record, metres (REAL) */
  surveyedElevM?: number;
  /** ground-level view: real rover frame once adapters are swapped */
  groundViewSlot: {
    caption: string;
    pending: string;
  };
}

export interface PointsData {
  type: 'points';
  points: SciencePoint[];
  bounds: BoundsM;
}

/** A polyline product, e.g. the rover's driven traverse. */
export interface PathData {
  type: 'path';
  segments: LocalPoint[][];
  bounds: BoundsM;
  /** sols spanned by the segments inside the AOI, if known */
  solRange?: [number, number];
  waypoints?: { position: LocalPoint; sol: number | null; elevation: number | null }[];
}

export type LayerData =
  | RasterGridData
  | RasterImageData
  | CategoricalGridData
  | VectorData
  | TimeSeriesData
  | PointsData
  | PathData;

export interface ColorStop {
  value: number;
  color: string;
}

export type LegendSpec =
  | { type: 'continuous'; unit: string; min: number; max: number; stops: ColorStop[]; note?: string }
  | { type: 'categorical'; items: CategoryDef[]; note?: string }
  | { type: 'vector'; items: { label: string; color: string; passable: boolean }[]; note?: string }
  | { type: 'chart'; unit: string; note?: string }
  | { type: 'points'; note?: string };

/**
 * How a layer's numbers came to exist. Shown on every layer card and on the
 * About page, because a reviewer has to be able to tell a measurement from a
 * computation from a model.
 *
 *   REAL     downloaded from a NASA/USGS product (cite product name + URL)
 *   DERIVED  computed by us from REAL data (slope from a DEM, hazard classes)
 *   MODELED  built from published measurements, not a raw dataset
 */
export type Provenance = 'REAL' | 'DERIVED' | 'MODELED';

/** Which group the layer sits in, in the layer panel. */
export type LayerGroup = 'Base' | 'Terrain' | 'Geology & Minerals' | 'Safety' | 'Environment';

/** One adapter per data product. The UI never knows where the bytes came from. */
export interface LayerAdapter {
  id: string;
  name: string;
  mission: string;
  instrument: string;
  kind: LayerKind;
  group: LayerGroup;
  load(): Promise<LayerData>;
  legend: LegendSpec;
  /** REAL / DERIVED / MODELED — drives the badge. */
  provenance: Provenance;
  /** Human note shown in the layer card: resolution, product id, caveats. */
  sourceNote: string;
  /** Canonical link for the info button. */
  sourceUrl?: string;
  /** Who to credit, e.g. "NASA/JPL-Caltech/University of Arizona". */
  credit: string;
  /** Default map visibility + opacity. */
  defaultVisible: boolean;
  defaultOpacity: number;
  /** Rendered as a map overlay (false for charts / tabular products). */
  mapRenderable: boolean;
}

/** What a click on the map reports, per layer. */
export interface ProbeReading {
  layerId: string;
  layerName: string;
  mission: string;
  instrument: string;
  value: string;
  tone?: 'nominal' | 'caution' | 'danger';
  provenance: Provenance;
}
