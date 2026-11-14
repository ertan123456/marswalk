/**
 * EVA route planner.
 *
 *  1. A* over the DEM grid with a slope- and hazard-weighted cost.
 *  2. A suit-mobility model (speed vs slope, consumables burn vs workload).
 *  3. A multi-source Dijkstra "return field" from every safe haven, which is
 *     what makes the walk-back check exact rather than a straight-line guess.
 *
 * All of it is pure: grids in, plan out. Nothing here touches React or the DOM.
 */

import { CELL_X_M, CELL_Y_M, bearingDeg, distanceM, gridToLocal, localToGrid } from './geo';
import type { LocalPoint } from './geo';
import { getTerrain, HAZARD } from '../data/real/terrain';
import { doseOverWindow, speOverlap, SPE_EVENT } from '../data/models/environment';

/* ------------------------------------------------------------- suit model */

export interface SuitModel {
  /** total consumables, expressed as hours at nominal workload */
  evaBudgetH: number;
  /** fraction of the budget that must still be unspent on return */
  reserveFraction: number;
  /** level-ground walking speed, m/s */
  flatSpeedMs: number;
  /** slopes at or above this are barred to suited crew */
  maxSlopeDeg: number;
  /** consumables multiplier while walking on the level */
  walkBurnBase: number;
  /** extra consumables multiplier per unit of uphill grade (rise/run) */
  walkBurnPerGrade: number;
  /** multiplier on every station task time */
  taskTimeScale: number;
  /** A* cost: extra cost fraction per degree of local slope */
  slopePenaltyPerDeg: number;
  /** A* cost multiplier for crossing flagged steep ground */
  steepCostFactor: number;
  /** A* cost multiplier for crossing rugged / broken ground */
  roughCostFactor: number;
  /** how the crew covers ground between stations */
  mobility: 'foot' | 'rover';
  /** rover driving speed on level ground, m/s */
  roverSpeedMs: number;
  /** the rover is barred from slopes at or above this - stricter than the crew */
  roverMaxSlopeDeg: number;
  /** consumables multiplier while riding: the rover carries the tools */
  roverBurnFactor: number;
  /** local hour the crew steps outside */
  evaStartHour: number;
}

export const DEFAULT_SUIT: SuitModel = {
  evaBudgetH: 8,
  reserveFraction: 0.2,
  flatSpeedMs: 1.25,
  maxSlopeDeg: 25,
  walkBurnBase: 1.15,
  walkBurnPerGrade: 1.1,
  taskTimeScale: 1,
  slopePenaltyPerDeg: 0.08,
  steepCostFactor: 2.6,
  roughCostFactor: 3.4,
  mobility: 'foot',
  roverSpeedMs: 2.2,
  roverMaxSlopeDeg: 15,
  roverBurnFactor: 0.55,
  evaStartHour: 7.25,
};

/**
 * Walking speed against signed grade (rise/run; positive = uphill).
 * Tobler's hiking function, re-scaled so level ground equals flatSpeedMs.
 * Peak speed sits at a slight downhill, which is what suited field crews report.
 */
export function walkSpeedMs(suit: SuitModel, grade: number): number {
  const norm = Math.exp(-3.5 * 0.05);
  const v = (suit.flatSpeedMs * Math.exp(-3.5 * Math.abs(grade + 0.05))) / norm;
  return Math.max(0.12, v);
}

/**
 * Rover driving speed against grade. A wheeled vehicle loses speed on a slope
 * much faster than a walker does, and it is barred outright above its slope
 * limit, so this only has to be sane inside that band.
 */
export function roverSpeedMs(suit: SuitModel, grade: number): number {
  return Math.max(0.4, suit.roverSpeedMs * (1 - Math.min(0.75, Math.abs(grade) * 2.2)));
}

/** Consumables burn rate, as a multiple of the nominal on-station rate. */
export function walkBurnRate(suit: SuitModel, grade: number): number {
  return suit.walkBurnBase + suit.walkBurnPerGrade * Math.max(0, grade);
}

/* ------------------------------------------------------------- cost field */

export interface CostField {
  width: number;
  height: number;
  /** per-cell multiplier; Infinity = barred */
  factor: Float32Array;
  passable: Uint8Array;
}

const costCache = new Map<string, CostField>();

function costKey(suit: SuitModel, mode: 'foot' | 'rover'): string {
  return [mode, suit.maxSlopeDeg, suit.roverMaxSlopeDeg, suit.slopePenaltyPerDeg,
          suit.steepCostFactor, suit.roughCostFactor].join('|');
}

/**
 * Traversability for one mobility mode.
 *
 * The rover is NOT simply a faster crew member: it is barred from steeper
 * ground than the crew is (15 degrees against 25) and from broken ground that
 * a walker can pick through. That asymmetry is the whole point of the mode -
 * it is what creates drop-off points.
 */
export function buildCostField(suit: SuitModel, mode: 'foot' | 'rover' = 'foot'): CostField {
  const key = costKey(suit, mode);
  const hit = costCache.get(key);
  if (hit) return hit;

  const t = getTerrain();
  const n = t.width * t.height;
  const factor = new Float32Array(n);
  const passable = new Uint8Array(n);

  const cautionDeg = t.derivedMeta.thresholds_deg.caution;
  const roughCaution = t.derivedMeta.thresholds_roughness_m.caution;
  const slopeLimit = mode === 'rover' ? suit.roverMaxSlopeDeg : suit.maxSlopeDeg;

  for (let i = 0; i < n; i++) {
    const cls = t.hazard[i];
    // No stereo coverage is a hard bar: we will not route a crew across ground
    // the DTM does not actually cover.
    let barred =
      cls === HAZARD.NO_DATA ||
      cls === HAZARD.ROUGH ||
      cls === HAZARD.SLOPE_IMPASSABLE ||
      t.slopeDeg[i] >= slopeLimit;
    // A walker can pick a line through ground a wheeled vehicle cannot.
    if (mode === 'rover' && t.roughness[i] >= roughCaution) barred = true;
    if (barred) {
      factor[i] = Infinity;
      passable[i] = 0;
      continue;
    }
    // cost = distance x (1 + slopePenalty) + hazardPenalty
    let f = 1 + suit.slopePenaltyPerDeg * t.slopeDeg[i];
    if (t.slopeDeg[i] >= cautionDeg) f += suit.steepCostFactor - 1;
    if (cls === HAZARD.CAUTION) f += (suit.roughCostFactor - 1) * 0.6;
    if (t.roughness[i] >= t.derivedMeta.thresholds_roughness_m.caution) {
      f += (suit.roughCostFactor - 1) * 0.4;
    }
    factor[i] = f;
    passable[i] = 1;
  }

  const field: CostField = { width: t.width, height: t.height, factor, passable };
  costCache.set(key, field);
  return field;
}

/* ------------------------------------------------------------- binary heap */

class MinHeap {
  private ids: Int32Array;
  private keys: Float64Array;
  private size = 0;
  constructor(capacity: number) {
    this.ids = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }
  get length(): number {
    return this.size;
  }
  push(id: number, key: number): void {
    if (this.size >= this.ids.length) this.grow();
    let i = this.size++;
    this.ids[i] = id;
    this.keys[i] = key;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(p, i);
      i = p;
    }
  }
  pop(): number {
    const top = this.ids[0];
    this.size--;
    if (this.size > 0) {
      this.ids[0] = this.ids[this.size];
      this.keys[0] = this.keys[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && this.keys[l] < this.keys[m]) m = l;
        if (r < this.size && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    const ti = this.ids[a];
    const tk = this.keys[a];
    this.ids[a] = this.ids[b];
    this.keys[a] = this.keys[b];
    this.ids[b] = ti;
    this.keys[b] = tk;
  }
  private grow(): void {
    const ids = new Int32Array(this.ids.length * 2);
    const keys = new Float64Array(this.keys.length * 2);
    ids.set(this.ids);
    keys.set(this.keys);
    this.ids = ids;
    this.keys = keys;
  }
}

/* ------------------------------------------------------------------- A* */

const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Ground distance for one grid step. The DEM cells are 14.29 m across and
 * 14.27 m down, so a diagonal is not simply sqrt(2) times a side.
 */
export function stepLength(dx: number, dy: number): number {
  if (dx === 0) return Math.abs(dy) * CELL_Y_M;
  if (dy === 0) return Math.abs(dx) * CELL_X_M;
  return Math.hypot(dx * CELL_X_M, dy * CELL_Y_M);
}

/** Nearest passable cell to a requested one, so a target in a hazard still plans. */
export function nearestPassable(col: number, row: number, field: CostField): { col: number; row: number } {
  const g = field.width;
  const gh = field.height;
  if (field.passable[row * g + col]) return { col, row };
  for (let r = 1; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const c = col + dx;
        const w = row + dy;
        if (c < 0 || w < 0 || c >= g || w >= gh) continue;
        if (field.passable[w * g + c]) return { col: c, row: w };
      }
    }
  }
  return { col, row };
}

/** Everything the rover can reach from a starting cell, over its own field. */
export function reachableFrom(startIdx: number, field: CostField): Uint8Array {
  const g = field.width;
  const gh = field.height;
  const seen = new Uint8Array(g * gh);
  if (!field.passable[startIdx]) return seen;
  const stack = [startIdx];
  seen[startIdx] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const c = i % g;
    const r = (i / g) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nc = c + dx;
      const nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= g || nr >= gh) continue;
      const j = nr * g + nc;
      if (seen[j] || !field.passable[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/**
 * The cell nearest `target` that the rover can actually get to - the drop-off.
 * Searched over the FOOT field, so the walk from it is one the crew can make.
 */
export function nearestReachable(
  targetIdx: number,
  reachable: Uint8Array,
  footField: CostField,
): number | null {
  if (reachable[targetIdx]) return targetIdx;
  const g = footField.width;
  const gh = footField.height;
  const seen = new Uint8Array(g * gh);
  let frontier = [targetIdx];
  seen[targetIdx] = 1;
  for (let depth = 0; depth < 400 && frontier.length; depth++) {
    const next: number[] = [];
    for (const i of frontier) {
      const c = i % g;
      const r = (i / g) | 0;
      for (const [dx, dy] of NEIGHBOURS) {
        const nc = c + dx;
        const nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= g || nr >= gh) continue;
        const j = nr * g + nc;
        if (seen[j] || !footField.passable[j]) continue;
        seen[j] = 1;
        if (reachable[j]) return j;
        next.push(j);
      }
    }
    frontier = next;
  }
  return null;
}

/** A* between two grid cells. Returns cell indices, start to goal. */
export function astar(startIdx: number, goalIdx: number, field: CostField): number[] | null {
  const g = field.width;
  const gh = field.height;
  const n = g * gh;
  const gScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new MinHeap(1 << 14);

  const gc = goalIdx % g;
  const gr = (goalIdx / g) | 0;
  const h = (i: number) => {
    const c = i % g;
    const r = (i / g) | 0;
    return Math.hypot((c - gc) * CELL_X_M, (r - gr) * CELL_Y_M);
  };

  gScore[startIdx] = 0;
  open.push(startIdx, h(startIdx));

  while (open.length > 0) {
    const cur = open.pop();
    if (cur === goalIdx) break;
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cc = cur % g;
    const cr = (cur / g) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nc = cc + dx;
      const nr = cr + dy;
      if (nc < 0 || nr < 0 || nc >= g || nr >= gh) continue;
      const ni = nr * g + nc;
      if (!field.passable[ni] || closed[ni]) continue;
      const step = stepLength(dx, dy);
      // average the two cells' cost factors so a step across a boundary is fair
      const cost = step * 0.5 * (field.factor[cur] + field.factor[ni]);
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        cameFrom[ni] = cur;
        open.push(ni, tentative + h(ni));
      }
    }
  }

  if (gScore[goalIdx] === Infinity) return null;
  const path: number[] = [];
  let p = goalIdx;
  while (p !== -1) {
    path.push(p);
    if (p === startIdx) break;
    p = cameFrom[p];
  }
  return path.reverse();
}

/* ------------------------------------------------- return (walk-back) field */

export interface ReturnField {
  grid: number;
  /** consumable-hours to reach the nearest safe haven from this cell */
  consumablesH: Float32Array;
  /** wall-clock hours for that same path */
  timeH: Float32Array;
  havens: { label: string; point: LocalPoint }[];
}

let returnCache: { key: string; field: ReturnField } | null = null;

/**
 * Multi-source Dijkstra from every safe haven, minimising consumable-hours.
 * Edge costs are evaluated in the direction of travel TOWARD the haven, so the
 * asymmetry between climbing out and walking back down is preserved.
 */
export function buildReturnField(suit: SuitModel, havens: { label: string; point: LocalPoint }[]): ReturnField {
  const key = [
    costKey(suit, 'foot'),
    suit.flatSpeedMs,
    suit.walkBurnBase,
    suit.walkBurnPerGrade,
    havens.map((h) => h.label + Math.round(h.point.x) + ':' + Math.round(h.point.y)).join(','),
  ].join('|');
  if (returnCache && returnCache.key === key) return returnCache.field;

  const t = getTerrain();
  const field = buildCostField(suit);
  const g = t.width;
  const gh = t.height;
  const n = g * gh;

  const consumablesH = new Float32Array(n).fill(Infinity);
  const timeH = new Float32Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const heap = new MinHeap(1 << 15);

  for (const hv of havens) {
    const gi = localToGrid(hv.point);
    const snapped = nearestPassable(gi.col, gi.row, field);
    const i = snapped.row * g + snapped.col;
    consumablesH[i] = 0;
    timeH[i] = 0;
    heap.push(i, 0);
  }

  while (heap.length > 0) {
    const cur = heap.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    const cc = cur % g;
    const cr = (cur / g) | 0;

    for (const [dx, dy] of NEIGHBOURS) {
      const nc = cc + dx;
      const nr = cr + dy;
      if (nc < 0 || nr < 0 || nc >= g || nr >= gh) continue;
      const ni = nr * g + nc;
      if (!field.passable[ni] || done[ni]) continue;

      // travelling FROM ni TO cur (toward the haven)
      const step = stepLength(dx, dy);
      const rise = t.elevation[cur] - t.elevation[ni];
      const grade = rise / step;
      const speed = walkSpeedMs(suit, grade);
      // the hazard/slope cost factor also slows the crew down, not just the planner
      const penalty = 0.5 * (field.factor[cur] + field.factor[ni]);
      const dt = step / speed / 3600;
      const effectiveDt = dt * Math.min(3, 0.6 + 0.4 * penalty);
      const dc = effectiveDt * walkBurnRate(suit, grade);

      const cand = consumablesH[cur] + dc;
      if (cand < consumablesH[ni]) {
        consumablesH[ni] = cand;
        timeH[ni] = timeH[cur] + effectiveDt;
        heap.push(ni, cand);
      }
    }
  }

  const out: ReturnField = { grid: g, consumablesH, timeH, havens };
  returnCache = { key, field: out };
  return out;
}

/* ------------------------------------------------------------- route plan */

export interface RouteSample {
  /** how this step was covered */
  mode: 'foot' | 'rover';
  point: LocalPoint;
  elevation: number;
  slopeDeg: number;
  cumDistM: number;
  /** wall-clock hours since EVA start */
  timeH: number;
  /** consumable-hours spent since EVA start */
  consumablesH: number;
  returnConsumablesH: number;
  returnTimeH: number;
  walkBackOk: boolean;
  /** headroom in consumable-hours at this point; negative = past the limit */
  walkBackMarginH: number;
}

export interface Station {
  id: string;
  label: string;
  code: string;
  point: LocalPoint;
  kind: 'habitat' | 'science';
  /** index into RoutePlan.samples where the crew arrives */
  sampleIndex: number;
  arrivalTimeH: number;
  departTimeH: number;
  arrivalConsumablesH: number;
  departConsumablesH: number;
  taskMinutes: number;
  legDistanceM: number;
  walkBackOk: boolean;
  walkBackMarginH: number;
  returnTimeH: number;
  bearingFromPrev: number;
  /** rover mode: where the crew dismounted, and how far they then walked */
  dropOff?: LocalPoint;
  walkFromDropOffM?: number;
}

export interface RoutePlan {
  samples: RouteSample[];
  stations: Station[];
  totalDistanceM: number;
  totalTimeH: number;
  totalConsumablesH: number;
  /** fraction of the budget left when the crew is back inside */
  consumablesRemainingFraction: number;
  reserveH: number;
  doseMgy: number;
  spe: { overlaps: boolean; hoursUntil: number };
  /** latest EVA start hour that clears the SPE window */
  suggestedShelterHour: number;
  mobility: 'foot' | 'rover';
  /** rover mode: points where the rover could go no further */
  dropOffs: { point: LocalPoint; stationCode: string; walkM: number }[];
  roverDistanceM: number;
  footDistanceM: number;
  feasible: boolean;
  violations: string[];
  notes: string[];
  unreachable: string[];
}

export interface PlanRequest {
  start: LocalPoint;
  waypoints: { id: string; code: string; title: string; point: LocalPoint; taskMinutes: number }[];
  /** return to start at the end */
  closeLoop: boolean;
  suit: SuitModel;
}

export function planRoute(req: PlanRequest): RoutePlan {
  const t = getTerrain();
  const g = t.width;
  const isRover = req.suit.mobility === 'rover';
  const footField = buildCostField(req.suit, 'foot');
  const roverField = isRover ? buildCostField(req.suit, 'rover') : footField;
  const field = footField;

  // Where can the rover actually get to from the habitat?
  const habGrid = localToGrid(req.start);
  const habSnapRover = nearestPassable(habGrid.col, habGrid.row, roverField);
  const roverReach = isRover
    ? reachableFrom(habSnapRover.row * g + habSnapRover.col, roverField)
    : null;

  // Work out the drop-off for each station before routing, so the walk-back
  // field can treat every drop-off as a safe haven: reaching the rover ends
  // the emergency, because the rover drives you home.
  const dropOffs: { point: LocalPoint; stationCode: string; walkM: number }[] = [];
  const dropOffFor = new Map<string, LocalPoint>();
  if (isRover && roverReach) {
    for (const w of req.waypoints) {
      const wi = localToGrid(w.point);
      const wSnap = nearestPassable(wi.col, wi.row, footField);
      const idx = wSnap.row * g + wSnap.col;
      const d = nearestReachable(idx, roverReach, footField);
      if (d === null) continue;
      const dp = gridToLocal(d % g, (d / g) | 0);
      dropOffFor.set(w.id, dp);
      if (d !== idx) {
        dropOffs.push({ point: dp, stationCode: w.code, walkM: distanceM(dp, w.point) });
      }
    }
  }

  const havens: { label: string; point: LocalPoint }[] = [{ label: 'Habitat', point: req.start }];
  for (const d of dropOffs) {
    havens.push({ label: 'Rover at ' + d.stationCode, point: d.point });
  }
  const ret = buildReturnField(req.suit, havens);

  interface LegTarget {
    id: string;
    code: string;
    label: string;
    point: LocalPoint;
    kind: 'habitat' | 'science';
    taskMinutes: number;
  }

  const legTargets: LegTarget[] = req.waypoints.map((w) => ({
    id: w.id,
    code: w.code,
    label: w.title,
    point: w.point,
    kind: 'science',
    taskMinutes: w.taskMinutes * req.suit.taskTimeScale,
  }));
  if (req.closeLoop) {
    legTargets.push({
      id: 'habitat-return',
      code: 'HAB',
      label: 'Habitat (ingress)',
      point: req.start,
      kind: 'habitat',
      taskMinutes: 0,
    });
  }

  const samples: RouteSample[] = [];
  const stations: Station[] = [];
  const unreachable: string[] = [];
  const budget = req.suit.evaBudgetH;
  const reserveH = budget * req.suit.reserveFraction;

  let timeH = 0;
  let consumablesH = 0;
  let cumDist = 0;
  let roverDistanceM = 0;
  let footDistanceM = 0;

  const pushSample = (p: LocalPoint, idx: number, mode: 'foot' | 'rover' = 'foot') => {
    const sample: RouteSample = {
      mode,
      point: p,
      elevation: t.elevation[idx],
      slopeDeg: t.slopeDeg[idx],
      cumDistM: cumDist,
      timeH,
      consumablesH,
      returnConsumablesH: ret.consumablesH[idx],
      returnTimeH: ret.timeH[idx],
      walkBackOk: true,
      walkBackMarginH: 0,
    };
    const margin = budget - consumablesH - ret.consumablesH[idx] - reserveH;
    sample.walkBackMarginH = margin;
    sample.walkBackOk = margin >= 0;
    samples.push(sample);
  };

  // EVA starts at the habitat airlock.
  {
    const gi = localToGrid(req.start);
    const snapped = nearestPassable(gi.col, gi.row, field);
    const idx = snapped.row * g + snapped.col;
    pushSample(gridToLocal(snapped.col, snapped.row), idx);
    stations.push({
      id: 'habitat',
      label: 'Habitat (egress)',
      code: 'HAB',
      point: req.start,
      kind: 'habitat',
      sampleIndex: 0,
      arrivalTimeH: 0,
      departTimeH: 0,
      arrivalConsumablesH: 0,
      departConsumablesH: 0,
      taskMinutes: 0,
      legDistanceM: 0,
      walkBackOk: true,
      walkBackMarginH: budget - reserveH,
      returnTimeH: 0,
      bearingFromPrev: 0,
    });
  }

  let prevPoint = req.start;

  /**
   * Walk or drive from one point to another, appending samples. Returns false
   * when no admissible corridor exists for that mode.
   */
  const travel = (fromP: LocalPoint, toP: LocalPoint, mode: 'foot' | 'rover'): boolean => {
    const f = mode === 'rover' ? roverField : footField;
    const a0 = localToGrid(fromP);
    const b0 = localToGrid(toP);
    const aS = nearestPassable(a0.col, a0.row, f);
    const bS = nearestPassable(b0.col, b0.row, f);
    const aIdx = aS.row * g + aS.col;
    const bIdx = bS.row * g + bS.col;
    // Already there: a degenerate hop is a success with nothing to travel, not
    // a routing failure. (Getting this wrong made every station whose drop-off
    // fell in its own cell report "no admissible route".)
    if (aIdx === bIdx) return true;
    const path = astar(aIdx, bIdx, f);
    if (!path || path.length < 2) return false;

    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1];
      const b = path[k];
      const ac = a % g;
      const ar = (a / g) | 0;
      const bc = b % g;
      const br = (b / g) | 0;
      const step = stepLength(bc - ac, br - ar);
      const rise = t.elevation[b] - t.elevation[a];
      const grade = rise / step;
      const penalty = 0.5 * (f.factor[a] + f.factor[b]);

      let dt: number;
      let burn: number;
      if (mode === 'rover') {
        dt = step / roverSpeedMs(req.suit, grade) / 3600;
        dt *= Math.min(2.2, 0.7 + 0.3 * penalty);
        burn = req.suit.roverBurnFactor;
        roverDistanceM += step;
      } else {
        dt = step / walkSpeedMs(req.suit, grade) / 3600;
        dt *= Math.min(3, 0.6 + 0.4 * penalty);
        burn = walkBurnRate(req.suit, grade);
        footDistanceM += step;
      }

      cumDist += step;
      timeH += dt;
      consumablesH += dt * burn;
      pushSample(gridToLocal(bc, br), b, mode);
    }
    return true;
  };

  for (const target of legTargets) {
    const legStartDist = cumDist;
    const drop = isRover ? dropOffFor.get(target.id) : undefined;
    // On the closing leg the rover simply drives the crew home.
    const driveTo = isRover ? (drop ?? target.point) : null;

    let ok = true;
    let walkFromDrop = 0;

    if (isRover && driveTo) {
      ok = travel(prevPoint, driveTo, 'rover');
      const dropCell = drop ? localToGrid(drop) : null;
      const targetCell = localToGrid(target.point);
      const dismount =
        !!dropCell && (dropCell.col !== targetCell.col || dropCell.row !== targetCell.row);
      if (ok && drop && dismount) {
        // The rover can get no closer; the crew dismounts and walks in.
        const before = cumDist;
        ok = travel(drop, target.point, 'foot');
        walkFromDrop = cumDist - before;
      }
    } else {
      ok = travel(prevPoint, target.point, 'foot');
    }

    if (!ok || samples.length < 2) {
      unreachable.push(target.code + ' ' + target.label);
      continue;
    }

    const arrivalIdx = samples.length - 1;
    const arrivalTimeH = timeH;
    const arrivalConsumablesH = consumablesH;
    const taskH = target.taskMinutes / 60;
    timeH += taskH;
    consumablesH += taskH; // on-station workload is the nominal 1.0x rate

    const last = samples[arrivalIdx];
    const marginAtStation = budget - consumablesH - last.returnConsumablesH - reserveH;

    stations.push({
      id: target.id,
      label: target.label,
      code: target.code,
      point: last.point,
      kind: target.kind,
      sampleIndex: arrivalIdx,
      arrivalTimeH,
      departTimeH: timeH,
      arrivalConsumablesH,
      departConsumablesH: consumablesH,
      taskMinutes: target.taskMinutes,
      legDistanceM: cumDist - legStartDist,
      walkBackOk: marginAtStation >= 0,
      walkBackMarginH: marginAtStation,
      returnTimeH: last.returnTimeH,
      bearingFromPrev: bearingDeg(prevPoint, last.point),
      dropOff: walkFromDrop > 0 ? drop : undefined,
      walkFromDropOffM: walkFromDrop > 0 ? walkFromDrop : undefined,
    });

    // Walk back out to the rover before the next drive.
    if (isRover && drop && walkFromDrop > 0) {
      travel(target.point, drop, 'foot');
      prevPoint = drop;
    } else {
      prevPoint = last.point;
    }
  }

  const violations: string[] = [];
  const notes: string[] = [];

  const badStations = stations.filter((s) => !s.walkBackOk && s.kind === 'science');
  for (const s of badStations) {
    violations.push(
      s.code +
        ' ' +
        s.label +
        ' is past the walk-back limit: ' +
        Math.abs(s.walkBackMarginH * 60).toFixed(0) +
        ' min short of the reserve on an abort from there.',
    );
  }

  if (consumablesH > budget) {
    violations.push(
      'Consumables exhausted: the plan needs ' +
        consumablesH.toFixed(2) +
        ' h against a ' +
        budget.toFixed(1) +
        ' h budget.',
    );
  } else if (consumablesH > budget - reserveH) {
    violations.push(
      'Reserve broken: the plan ends with ' +
        ((budget - consumablesH) * 60).toFixed(0) +
        ' min of consumables against a ' +
        (reserveH * 60).toFixed(0) +
        ' min reserve requirement.',
    );
  }

  for (const u of unreachable) {
    violations.push('No admissible route to ' + u + ' — every corridor is barred at the current slope limit.');
  }

  const doseMgy = doseOverWindow(req.suit.evaStartHour, Math.max(0.01, timeH));
  const spe = speOverlap(req.suit.evaStartHour, Math.max(0.01, timeH));
  if (spe.overlaps) {
    violations.push(
      'Forecast solar particle event intersects the EVA window at T+' +
        Math.max(0, spe.hoursUntil).toFixed(1) +
        ' h. Shelter or re-time.',
    );
  }

  if (isRover) {
    notes.push(
      'Rover-assisted: the crew rides between stations and dismounts where the rover cannot ' +
        'continue. Walk-back is measured to the nearest drop-off, because reaching the rover ends ' +
        'the emergency — it drives them home.',
    );
    notes.push(
      'The rover is barred above ' + req.suit.roverMaxSlopeDeg + '° and from any broken ground, ' +
        'against ' + req.suit.maxSlopeDeg + '° for the crew on foot. That gap is what creates the drop-offs.',
    );
    if (dropOffs.length === 0) {
      notes.push('Every station is rover-accessible on this plan: no dismount required.');
    }
  } else {
    notes.push('On foot: every walk-back is measured all the way to the habitat airlock.');
  }
  notes.push(
    'Routing bars slopes at or above ' +
      req.suit.maxSlopeDeg +
      '°, broken ground and anything with no stereo coverage; caution ground is crossed at ' +
      req.suit.roughCostFactor.toFixed(1) +
      '× cost.',
  );

  const suggestedShelterHour = Math.max(0, SPE_EVENT.startHour - Math.max(0.01, timeH) - 0.5);

  return {
    samples,
    stations,
    totalDistanceM: cumDist,
    totalTimeH: timeH,
    totalConsumablesH: consumablesH,
    consumablesRemainingFraction: Math.max(0, (budget - consumablesH) / budget),
    reserveH,
    doseMgy,
    spe,
    suggestedShelterHour,
    mobility: req.suit.mobility,
    dropOffs,
    roverDistanceM,
    footDistanceM,
    feasible: violations.length === 0,
    violations,
    notes,
    unreachable,
  };
}

/* --------------------------------------------------------- measure helpers */

export interface ProfilePoint {
  distM: number;
  elevation: number;
  slopeDeg: number;
  point: LocalPoint;
}

/** Straight-line elevation profile between two points, for the measure tool. */
export function straightProfile(a: LocalPoint, b: LocalPoint, steps = 160): ProfilePoint[] {
  const t = getTerrain();
  const g = t.width;
  const total = distanceM(a, b);
  const out: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const gi = localToGrid(p);
    const idx = gi.row * g + gi.col;
    out.push({ distM: total * f, elevation: t.elevation[idx], slopeDeg: t.slopeDeg[idx], point: p });
  }
  return out;
}

export function profileStats(profile: ProfilePoint[]): {
  gain: number;
  loss: number;
  maxSlope: number;
  netRise: number;
} {
  let gain = 0;
  let loss = 0;
  let maxSlope = 0;
  for (let i = 1; i < profile.length; i++) {
    const d = profile[i].elevation - profile[i - 1].elevation;
    if (d > 0) gain += d;
    else loss -= d;
    if (profile[i].slopeDeg > maxSlope) maxSlope = profile[i].slopeDeg;
  }
  return {
    gain,
    loss,
    maxSlope,
    netRise: profile.length ? profile[profile.length - 1].elevation - profile[0].elevation : 0,
  };
}
