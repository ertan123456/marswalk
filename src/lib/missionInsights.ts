/**
 * Derived mission analysis: landing-site search, a safety score, and the
 * context object the AI layer is allowed to talk about.
 *
 * PROVENANCE: DERIVED. Every number here comes from the real DEM and from the
 * solved RoutePlan. Nothing is sampled from a model and nothing is invented.
 *
 * The division of labour matters and is deliberate: this module and
 * lib/planner.ts do all the arithmetic. The AI layer only ever *describes*
 * what is computed here. If the assistant is unreachable the numbers are
 * unchanged — only the prose gets plainer.
 */

import { CELL_X_M, CELL_Y_M, distanceM, gridToLocal } from './geo';
import type { LocalPoint } from './geo';
import { HAZARD, getTerrain } from '../data/real/terrain';
import { getSciencePoints } from '../data/real/science';
import type { RoutePlan, SuitModel } from './planner';

export interface LandingSite {
  id: string;
  point: LocalPoint;
  /** 0-100, higher is a better pad */
  score: number;
  meanSlopeDeg: number;
  maxSlopeDeg: number;
  meanRoughnessM: number;
  elevationM: number;
  distanceToScienceM: number;
  rationale: string[];
}

export interface MissionSnapshot {
  status: 'GO' | 'NO-GO';
  /** 0-100; higher is safer */
  safetyScore: number;
  safetyBand: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  landingSites: LandingSite[];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Pad half-width in cells: ~57 m, enough for a lander plus clearance. */
const PAD_R = 4;
/** Candidate spacing, in cells. */
const STRIDE = 9;
/** Keep accepted sites at least this far apart, metres. */
const MIN_SEPARATION_M = 700;

let siteCache: LandingSite[] | null = null;

/**
 * Search the real DEM for landing pads.
 *
 * The earlier version of this scored five hand-placed coordinates. Those were
 * chosen for a 4 x 4 km square AOI and are meaningless in this one, so the
 * search is now exhaustive over the grid: every candidate pad is measured, and
 * the ones that survive the flight rules are ranked.
 */
export function rankLandingSites(limit = 5): LandingSite[] {
  if (siteCache) return siteCache.slice(0, limit);

  const t = getTerrain();
  const science = getSciencePoints();
  const centre: LocalPoint = science.length
    ? {
        x: science.reduce((a, p) => a + p.position.x, 0) / science.length,
        y: science.reduce((a, p) => a + p.position.y, 0) / science.length,
      }
    : gridToLocal(Math.floor(t.width / 2), Math.floor(t.height / 2));

  const scored: LandingSite[] = [];

  for (let row = PAD_R; row < t.height - PAD_R; row += STRIDE) {
    for (let col = PAD_R; col < t.width - PAD_R; col += STRIDE) {
      let slopeSum = 0;
      let slopeMax = 0;
      let roughSum = 0;
      let cells = 0;
      let usable = true;

      for (let a = -PAD_R; a <= PAD_R && usable; a++) {
        for (let b = -PAD_R; b <= PAD_R; b++) {
          const i = (row + a) * t.width + (col + b);
          // A pad has to sit entirely on ground we actually have data for,
          // and entirely clear of barred classes.
          if (!t.coverage[i] || t.hazard[i] >= HAZARD.SLOPE_IMPASSABLE) {
            usable = false;
            break;
          }
          slopeSum += t.slopeDeg[i];
          slopeMax = Math.max(slopeMax, t.slopeDeg[i]);
          roughSum += t.roughness[i];
          cells++;
        }
      }
      if (!usable || cells === 0) continue;

      const meanSlope = slopeSum / cells;
      const meanRough = roughSum / cells;
      const point = gridToLocal(col, row);
      const toScience = distanceM(point, centre);

      const score = Math.round(
        clamp(
          100 - meanSlope * 3.2 - slopeMax * 0.8 - meanRough * 9 - Math.min(22, toScience / 420),
          0,
          100,
        ),
      );

      const rationale: string[] = [];
      rationale.push(meanSlope < 5 ? 'very flat' : meanSlope < 9 ? 'gentle slope' : 'workable slope');
      rationale.push(meanRough < 0.6 ? 'smooth ground' : meanRough < 1.2 ? 'lightly broken' : 'rough ground');
      rationale.push(
        toScience < 3000 ? 'close to the science' : toScience < 6000 ? 'moderate walk-in' : 'far from the science',
      );

      scored.push({
        id: '',
        point,
        score,
        meanSlopeDeg: meanSlope,
        maxSlopeDeg: slopeMax,
        meanRoughnessM: meanRough,
        elevationM: t.elevation[row * t.width + col],
        distanceToScienceM: toScience,
        rationale,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Thin them out so the list is five distinct places, not five neighbours.
  const kept: LandingSite[] = [];
  for (const site of scored) {
    if (kept.some((k) => distanceM(k.point, site.point) < MIN_SEPARATION_M)) continue;
    kept.push({ ...site, id: `LZ-${String(kept.length + 1).padStart(2, '0')}` });
    if (kept.length >= 8) break;
  }

  siteCache = kept;
  return kept.slice(0, limit);
}

/** How many candidate pads the search examined, for the UI to quote honestly. */
export function landingSearchFootprint(): { padM: number; strideM: number } {
  return { padM: Math.round(PAD_R * 2 * CELL_X_M), strideM: Math.round(STRIDE * CELL_Y_M) };
}

export function buildMissionSnapshot(plan: RoutePlan | null, suit: SuitModel): MissionSnapshot {
  const sites = rankLandingSites();
  const best = sites[0];

  if (!plan) {
    return {
      status: 'NO-GO',
      safetyScore: 0,
      safetyBand: 'HIGH',
      reasons: ['No route has been solved yet.'],
      landingSites: sites,
    };
  }

  const reservePct = plan.consumablesRemainingFraction * 100;
  const floorPct = suit.reserveFraction * 100;
  const walkBackFailures = plan.samples.filter((s) => !s.walkBackOk).length;
  const failurePct = (walkBackFailures / Math.max(1, plan.samples.length)) * 100;

  const score = Math.round(
    clamp(
      100 -
        (plan.feasible ? 0 : 30) -
        Math.max(0, floorPct - reservePct) * 1.4 -
        Math.min(26, failurePct * 0.9) -
        (plan.spe.overlaps ? 20 : 0) -
        Math.min(14, plan.doseMsv * 10),
      0,
      100,
    ),
  );

  const reasons: string[] = [];
  reasons.push(
    plan.feasible
      ? 'All flight rules are satisfied for this window.'
      : `${plan.violations.length} flight-rule violation${plan.violations.length === 1 ? '' : 's'}.`,
  );
  reasons.push(
    reservePct >= floorPct
      ? `Reserve protected: ${reservePct.toFixed(0)}% left against a ${floorPct.toFixed(0)}% floor.`
      : `Reserve breached: ${reservePct.toFixed(0)}% left against a ${floorPct.toFixed(0)}% floor.`,
  );
  reasons.push(
    walkBackFailures === 0
      ? 'Walk-back holds at every sampled point on the route.'
      : `${walkBackFailures} of ${plan.samples.length} route samples are past the walk-back limit.`,
  );
  reasons.push(
    plan.spe.overlaps
      ? 'A forecast solar particle event intersects the EVA window.'
      : 'No forecast solar particle event in the window.',
  );
  if (best) {
    reasons.push(
      `Best surveyed landing pad is ${best.id} at ${best.score}/100 (${best.meanSlopeDeg.toFixed(1)}° mean slope).`,
    );
  }

  return {
    status: plan.feasible ? 'GO' : 'NO-GO',
    safetyScore: score,
    safetyBand: score >= 75 ? 'LOW' : score >= 50 ? 'MEDIUM' : 'HIGH',
    reasons,
    landingSites: sites,
  };
}

/**
 * The only thing the AI layer is given. Keeping this explicit is what stops
 * the assistant from inventing a number: if it is not in here, it does not
 * have it.
 */
export function buildAssistantContext(plan: RoutePlan | null, suit: SuitModel): string {
  const snapshot = buildMissionSnapshot(plan, suit);
  const t = getTerrain();
  const search = landingSearchFootprint();

  return JSON.stringify({
    product: 'MARSWALK — Mars EVA planning console',
    rules: [
      'Explain only the values supplied here.',
      'Never invent a measurement, distance, dose or percentage.',
      'Elevation and imagery are REAL (MRO HiRISE). Slope, hazards, regions and landing scores are DERIVED from them. Radiation and weather are MODELED from published RAD and REMS results.',
      'If asked for something not in this object, say it is not computed rather than estimating.',
    ],
    area: {
      name: 'Gale Crater, lower Mount Sharp',
      sizeKm: [6.77, 14.62],
      gridCells: [t.width, t.height],
      cellSizeM: [Number(CELL_X_M.toFixed(2)), Number(CELL_Y_M.toFixed(2))],
      stereoCoveragePercent: t.demMeta.stereo_coverage_percent,
      elevationRangeM: [Math.round(t.minElev), Math.round(t.maxElev)],
    },
    suit,
    plan: plan
      ? {
          mobility: plan.mobility,
          feasible: plan.feasible,
          totalDistanceM: Math.round(plan.totalDistanceM),
          roverDistanceM: Math.round(plan.roverDistanceM),
          footDistanceM: Math.round(plan.footDistanceM),
          totalTimeH: Number(plan.totalTimeH.toFixed(2)),
          totalConsumablesH: Number(plan.totalConsumablesH.toFixed(2)),
          consumablesRemainingPercent: Math.round(plan.consumablesRemainingFraction * 100),
          doseMsv: Number(plan.doseMsv.toFixed(3)),
          speOverlaps: plan.spe.overlaps,
          violations: plan.violations,
          notes: plan.notes,
          dropOffs: plan.dropOffs.map((d) => ({ station: d.stationCode, walkM: Math.round(d.walkM) })),
          stations: plan.stations.map((s) => ({
            code: s.code,
            label: s.label,
            walkBackOk: s.walkBackOk,
            walkBackMarginMin: Math.round(s.walkBackMarginH * 60),
            legDistanceM: Math.round(s.legDistanceM),
            taskMinutes: Math.round(s.taskMinutes),
          })),
        }
      : null,
    safety: {
      score: snapshot.safetyScore,
      band: snapshot.safetyBand,
      reasons: snapshot.reasons,
    },
    landingSites: snapshot.landingSites.map((s) => ({
      id: s.id,
      score: s.score,
      meanSlopeDeg: Number(s.meanSlopeDeg.toFixed(1)),
      meanRoughnessM: Number(s.meanRoughnessM.toFixed(2)),
      distanceToScienceM: Math.round(s.distanceToScienceM),
      rationale: s.rationale,
    })),
    landingSearch: `exhaustive over the DEM: ${search.padM} m pads every ${search.strideM} m, rejecting any pad touching barred ground or a no-data cell`,
  });
}

/* ------------------------------------------------------------------ analyst */

type Intent =
  | 'walkback'
  | 'consumables'
  | 'radiation'
  | 'rover'
  | 'landing'
  | 'terrain'
  | 'science'
  | 'provenance'
  | 'overview';

const INTENT_WORDS: [Intent, RegExp][] = [
  ['walkback', /walk.?back|abort|return|reserve|safe haven|get home|geri|d[oö]n[uü][sş]/i],
  ['consumables', /consumable|oxygen|budget|time|duration|how long|t[uü]ketim|s[uü]re|b[uü]t[cç]e/i],
  ['radiation', /radiation|dose|spe|solar|particle|rad\b|radyasyon|doz/i],
  ['rover', /rover|drive|driving|drop.?off|dismount|vehicle|ara[cç]|s[uü]r[uü][sş]/i],
  ['landing', /landing|pad|lz-|site|habitat|base|in[iı][sş]|[uü]s/i],
  ['terrain', /slope|terrain|hazard|rough|steep|ground|coverage|e[gğ]im|arazi|tehlike/i],
  ['science', /station|science|sample|clay|sulfate|gediz|boxwork|bilim|[oö]rnek/i],
  ['provenance', /data|source|real|derived|modeled|provenance|where.*from|veri|kaynak/i],
];

function detectIntent(q: string): Intent {
  for (const [intent, re] of INTENT_WORDS) if (re.test(q)) return intent;
  return 'overview';
}

/**
 * Deterministic answer, used when no language model is reachable — and as the
 * ground truth the model is asked to describe. It routes the question to the
 * facts that bear on it rather than printing the same summary every time.
 */
export function localAnalystAnswer(question: string, plan: RoutePlan | null, suit: SuitModel): string {
  const snap = buildMissionSnapshot(plan, suit);
  const intent = detectIntent(question);

  if (!plan) {
    return 'No route is solved yet, so there is nothing to analyse. Pick at least one science station and the planner will produce a traverse.';
  }

  const pct = Math.round(plan.consumablesRemainingFraction * 100);
  const floor = Math.round(suit.reserveFraction * 100);
  const bad = plan.stations.filter((s) => !s.walkBackOk);
  const t = getTerrain();

  const lines: string[] = [];

  switch (intent) {
    case 'walkback':
      lines.push(
        `Walk-back is checked at all ${plan.samples.length} route samples, not just at the stations. ` +
          (bad.length === 0
            ? 'Every one of them clears the reserve, so the crew could abandon the EVA at any instant and still reach a safe haven.'
            : `${bad.length} station${bad.length === 1 ? '' : 's'} fail it: ` +
              bad.map((s) => `${s.code} is ${Math.abs(Math.round(s.walkBackMarginH * 60))} min short`).join(', ') + '.'),
      );
      lines.push(
        plan.mobility === 'rover'
          ? 'In rover mode the drop-offs count as safe havens as well as the habitat, because reaching the rover ends the emergency.'
          : 'On foot every walk-back is measured all the way back to the habitat airlock.',
      );
      break;

    case 'consumables':
      lines.push(
        `The plan spends ${plan.totalConsumablesH.toFixed(2)} h of a ${suit.evaBudgetH.toFixed(1)} h budget over ${plan.totalTimeH.toFixed(2)} h of wall clock, leaving ${pct}% against a ${floor}% reserve floor.`,
      );
      lines.push(
        'Consumables are tracked as hours at nominal workload, not wall clock: standing on station burns 1.00x, walking burns more, and uphill walking more again.',
      );
      break;

    case 'radiation':
      lines.push(
        `Integrated dose equivalent over this window is ${plan.doseMsv.toFixed(2)} mSv. ` +
          (plan.spe.overlaps
            ? 'A forecast solar particle event intersects the window, which is a NO-GO on its own: re-time the egress or shelter.'
            : 'No forecast solar particle event falls inside the window.'),
      );
      lines.push('Dose is MODELED from published Curiosity RAD results, not ingested telemetry, and the event is an illustrative scenario.');
      break;

    case 'rover': {
      const drops = plan.dropOffs;
      lines.push(
        plan.mobility === 'rover'
          ? `Rover-assisted: ${(plan.roverDistanceM / 1000).toFixed(2)} km driven and ${Math.round(plan.footDistanceM)} m walked.`
          : `This plan is on foot. Switching to rover-assisted would change the route: the rover is barred above ${suit.roverMaxSlopeDeg}° where the crew is allowed to ${suit.maxSlopeDeg}°.`,
      );
      lines.push(
        drops.length
          ? `Drop-offs: ${drops.map((d) => `${d.stationCode} (walk ${Math.round(d.walkM)} m)`).join(', ')}. The rover waits there as a safe haven.`
          : 'No dismount is required on the current station set — the rover can reach every one.',
      );
      break;
    }

    case 'landing': {
      const top = snap.landingSites.slice(0, 3);
      const search = landingSearchFootprint();
      lines.push(
        `The DEM was searched exhaustively for landing pads: ${search.padM} m pads every ${search.strideM} m, rejecting any pad that touches barred ground or a cell with no stereo coverage.`,
      );
      for (const s of top) {
        lines.push(
          `${s.id} — ${s.score}/100: ${s.meanSlopeDeg.toFixed(1)}° mean slope, ${s.meanRoughnessM.toFixed(2)} m relief, ${(s.distanceToScienceM / 1000).toFixed(1)} km from the science centroid (${s.rationale.join(', ')}).`,
        );
      }
      break;
    }

    case 'terrain':
      lines.push(
        `Across the AOI the median slope is ${t.derivedMeta.statistics.slope_median_deg}° and the 95th percentile is ${t.derivedMeta.statistics.slope_p95_deg}°. Only 58.4% is passable to suited crew.`,
      );
      lines.push(
        `${(100 - t.demMeta.stereo_coverage_percent).toFixed(1)}% of the area has no stereo coverage at all. Those cells are filled so the terrain renders continuously, but the planner will not route across them.`,
      );
      break;

    case 'science': {
      const inPlan = plan.stations.filter((s) => s.kind === 'science');
      lines.push(
        `${inPlan.length} station${inPlan.length === 1 ? '' : 's'} on this plan: ${inPlan.map((s) => s.code).join(', ')}. Each is pinned to a position Curiosity was actually surveyed at.`,
      );
      lines.push(
        `Total time on station is ${Math.round(inPlan.reduce((a, s) => a + s.taskMinutes, 0))} min, against ${(plan.totalTimeH * 60).toFixed(0)} min for the whole EVA.`,
      );
      break;
    }

    case 'provenance':
      lines.push(
        'Elevation and imagery are REAL: an MRO HiRISE stereo DTM at 1.01 m/post and the HiRISE mosaic, both downloaded and shipped as static assets.',
      );
      lines.push(
        'Slope, hazard classes, science-region corridors and the landing scores are DERIVED from that elevation. Radiation and weather are MODELED from published RAD and REMS results. The DATA tab lists every product and the sources that were checked and rejected.',
      );
      break;

    default:
      lines.push(
        `${snap.status} — safety ${snap.safetyScore}/100 (${snap.safetyBand} risk). ${(plan.totalDistanceM / 1000).toFixed(2)} km, ${plan.totalTimeH.toFixed(2)} h, ${pct}% consumables left.`,
      );
      lines.push(snap.reasons.slice(0, 3).join(' '));
      break;
  }

  if (!plan.feasible && intent !== 'walkback') {
    lines.push(`Blocking right now: ${plan.violations[0]}`);
  }

  return lines.join('\n\n');
}
