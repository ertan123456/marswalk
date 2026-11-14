/**
 * Which scientific investigation needs which ground, and how long it takes.
 *
 * PROVENANCE: MODELED. The link from a geochemical unit to an investigation is
 * ours, and so is every task duration. They are mission-design numbers, not
 * measurements, and they are listed here in one table so a reviewer can argue
 * with them instead of hunting for them.
 *
 * What makes this more than a lookup table is that the ground comes from the
 * real CRISM raster. An investigation names the units that can answer it; the
 * code then asks the shipped unit map where the nearest qualifying cell to each
 * station actually is. So choosing "tuff alteration" does not merely relabel
 * the plan — it changes which stations have anything to work on, how long the
 * crew stands at each one, and therefore the EVA duration, the consumables and
 * the GO/NO-GO call.
 *
 * An honest wrinkle, visible in the output rather than papered over: no science
 * station sits directly on a mapped unit. The stations are where Curiosity was
 * surveyed; the units are where CRISM shows a spectral outlier, and only 2.3%
 * of the AOI qualifies. Five of the six stations have a unit within 150 m, so
 * the model reports the nearest qualifying ground and its distance instead of
 * pretending the station is standing on it. That distance is useful in its own
 * right: it is how far off-station the crew has to walk to do the work.
 */

import { CELL_X_M, CELL_Y_M, localToGrid, AOI } from '../../lib/geo';
import type { LocalPoint } from '../../lib/geo';
import {
  geochemCodeAt,
  geochemLoaded,
  geochemUnitByKey,
  geochemUnitFor,
} from '../adapters/geochem';
import type { SciencePoint } from '../types';

/** How the crew works a target, and what that costs in crew time. */
export type Method = 'imaging' | 'contact' | 'drill';

export interface InvestigationDef {
  id: string;
  /** i18n key for the display name */
  labelKey: string;
  /** i18n key for the question this investigation answers */
  questionKey: string;
  /** geochemical unit keys that can answer it, best first */
  units: string[];
  method: Method;
  /** crew minutes on station, before the suit's taskTimeScale */
  taskMinutes: number;
  /** why this long — shown in the UI so the number is arguable */
  rationaleKey: string;
}

/**
 * Task durations by method, for reference while reading the table below:
 *   imaging  ~25 min  stand off, mosaic, move on
 *   contact  ~55 min  brush, close imaging, point spectrometer
 *   drill    ~95 min  everything above, plus drill, sample handling, analysis
 * The per-investigation numbers vary around those because some targets need
 * more than one station-scale observation.
 */
export const INVESTIGATIONS: InvestigationDef[] = [
  {
    id: 'clay-mineralogy',
    labelKey: 'inv.clay.label',
    questionKey: 'inv.clay.question',
    units: ['femgclay'],
    method: 'drill',
    taskMinutes: 95,
    rationaleKey: 'inv.clay.rationale',
  },
  {
    id: 'tuff-alteration',
    labelKey: 'inv.tuff.label',
    questionKey: 'inv.tuff.question',
    units: ['silica-aloh'],
    method: 'drill',
    taskMinutes: 80,
    rationaleKey: 'inv.tuff.rationale',
  },
  {
    id: 'riverbed-sedimentology',
    labelKey: 'inv.riverbed.label',
    questionKey: 'inv.riverbed.question',
    units: ['femgclay', 'hydrated'],
    method: 'contact',
    taskMinutes: 60,
    rationaleKey: 'inv.riverbed.rationale',
  },
  {
    id: 'sulfate-stratigraphy',
    labelKey: 'inv.sulfate.label',
    questionKey: 'inv.sulfate.question',
    units: ['sulfate'],
    method: 'contact',
    taskMinutes: 55,
    rationaleKey: 'inv.sulfate.rationale',
  },
  {
    id: 'hydration-survey',
    labelKey: 'inv.hydration.label',
    questionKey: 'inv.hydration.question',
    units: ['hydrated', 'sulfate', 'femgclay', 'silica-aloh'],
    method: 'contact',
    taskMinutes: 40,
    rationaleKey: 'inv.hydration.rationale',
  },
  {
    id: 'mafic-provenance',
    labelKey: 'inv.mafic.label',
    questionKey: 'inv.mafic.question',
    units: ['mafic'],
    method: 'imaging',
    taskMinutes: 45,
    rationaleKey: 'inv.mafic.rationale',
  },
];

export function investigationById(id: string | null): InvestigationDef | undefined {
  return id ? INVESTIGATIONS.find((i) => i.id === id) : undefined;
}

/**
 * How far off-station the crew will walk to reach qualifying ground before the
 * target counts as unsupported. 150 m is about two minutes' walk on the level
 * and roughly the distance a suited crew would accept without re-planning the
 * route; it is also the resolution at which the 18 m/px unit map can place a
 * boundary with any confidence (about eight cells).
 */
export const SUPPORT_RADIUS_M = 150;

export interface StationAssessment {
  stationId: string;
  /** unit key of the nearest qualifying cell, or null if none within range */
  unitKey: string | null;
  unitLabel: string | null;
  unitColor: string | null;
  /** metres from the station to that cell; null when nothing qualifies */
  distanceM: number | null;
  /** true when qualifying ground lies within SUPPORT_RADIUS_M */
  supported: boolean;
  /** crew minutes this station should take under the chosen investigation */
  taskMinutes: number;
  /** true when taskMinutes came from the investigation rather than the station */
  taskMinutesFromInvestigation: boolean;
}

/**
 * Nearest cell carrying one of `wantCodes`, searched outwards in square rings.
 *
 * Square rings rather than a true radial sweep: the grid cells are 14.29 x
 * 14.27 m, near enough to square that the error is under a tenth of a cell,
 * and the real distance is measured properly once a candidate is found.
 */
function nearestUnitCell(
  point: LocalPoint,
  wantCodes: Set<number>,
  maxRadiusCells: number,
): { code: number; distanceM: number } | null {
  const { col, row } = localToGrid(point);
  let best: { code: number; distanceM: number } | null = null;

  for (let r = 0; r <= maxRadiusCells; r++) {
    // Once something is found, the next ring cannot beat it by more than one
    // cell, so one further ring is enough to settle the true nearest.
    if (best && r > Math.ceil(best.distanceM / Math.min(CELL_X_M, CELL_Y_M)) + 1) break;

    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        // only the ring, not the filled square
        if (r > 0 && Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
        const c = col + dc;
        const rr = row + dr;
        if (c < 0 || rr < 0 || c >= AOI.gridW || rr >= AOI.gridH) continue;
        const code = geochemCodeAt(c, rr);
        if (!wantCodes.has(code)) continue;
        const dx = dc * CELL_X_M;
        const dy = dr * CELL_Y_M;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.distanceM) best = { code, distanceM: d };
      }
    }
  }
  return best;
}

/**
 * Assess every station against an investigation.
 *
 * With no investigation chosen, each station keeps its own task time and the
 * geochemistry is reported for information only — which is still worth seeing,
 * because it says what orbit thinks is near each target.
 */
export function assessStations(
  points: SciencePoint[],
  investigationId: string | null,
): StationAssessment[] {
  const inv = investigationById(investigationId);
  const maxRadiusCells = Math.ceil(SUPPORT_RADIUS_M / Math.min(CELL_X_M, CELL_Y_M));

  // Which unit codes count. With no investigation, any unit is of interest.
  const wanted = new Set<number>();
  if (geochemLoaded()) {
    for (let code = 1; code <= 32; code++) {
      const u = geochemUnitFor(code);
      if (!u) continue;
      if (!inv || inv.units.includes(u.key)) wanted.add(code);
    }
  }

  return points.map((p) => {
    const hit = wanted.size ? nearestUnitCell(p.position, wanted, maxRadiusCells) : null;
    const unit = hit ? geochemUnitFor(hit.code) : undefined;
    const supported = !!hit && hit.distanceM <= SUPPORT_RADIUS_M;
    const useInv = !!inv && supported;
    return {
      stationId: p.id,
      unitKey: unit?.key ?? null,
      unitLabel: unit?.label ?? null,
      unitColor: unit?.color ?? null,
      distanceM: hit ? hit.distanceM : null,
      supported,
      taskMinutes: useInv ? inv.taskMinutes : p.taskMinutes,
      taskMinutesFromInvestigation: useInv,
    };
  });
}

/**
 * Where each investigation can actually be done: the stations that have
 * qualifying ground within reach, nearest first.
 *
 * This is the "which investigation, and where do you go for it" table, built
 * from the real raster rather than written by hand. An investigation with no
 * reachable station is reported as such rather than omitted — that too is an
 * answer, and it is the honest one for ground orbit cannot support.
 */
export interface InvestigationCoverage {
  investigation: InvestigationDef;
  /** total AOI area carrying any qualifying unit, km² */
  areaKm2: number;
  stations: {
    stationId: string;
    code: string;
    title: string;
    distanceM: number;
    unitLabel: string;
    unitColor: string;
  }[];
}

export function investigationCoverage(points: SciencePoint[]): InvestigationCoverage[] {
  return INVESTIGATIONS.map((inv) => {
    const areaKm2 = inv.units.reduce(
      (sum, key) => sum + (geochemUnitByKey(key)?.area_km2 ?? 0),
      0,
    );

    const assessments = assessStations(points, inv.id);
    const stations = assessments
      .map((a, i) => ({ a, p: points[i] }))
      .filter(({ a }) => a.supported && a.distanceM !== null)
      .map(({ a, p }) => ({
        stationId: p.id,
        code: p.code,
        title: p.title,
        distanceM: a.distanceM as number,
        unitLabel: a.unitLabel ?? '',
        unitColor: a.unitColor ?? '#8a837b',
      }))
      .sort((x, y) => x.distanceM - y.distanceM);

    return { investigation: inv, areaKm2: Number(areaKm2.toFixed(3)), stations };
  });
}
