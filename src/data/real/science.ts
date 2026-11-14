/**
 * The science target package, pinned to real ground.
 *
 * PROVENANCE: REAL (positions) + narrative text written by us.
 *
 * Every station sits at a position Curiosity was actually surveyed at, taken
 * from the MMGIS waypoint record for the sol given. That means the coordinates
 * and the quoted elevations are measured, not placed by eye — and each station
 * is somewhere a real vehicle has already reached.
 *
 * ORDERING: the stations are ordered by sol, which is also ascending
 * elevation. That differs from the order in the original brief, which put the
 * sulfate-bearing unit after the Gediz Vallis features; on the real traverse
 * Curiosity entered the sulfate unit first, around sol 3500, and only then
 * reached the ridge and the channel. Walking order follows the ground.
 *
 * The unit boundaries themselves are not yet digitized — that is the next data
 * task. Until then each station is labelled with the sol it is pinned to.
 */

import { latLonToLocal } from '../../lib/geo';
import type { LocalPoint } from '../../lib/geo';
import type { SciencePoint } from '../types';
import { getTerrain } from './terrain';

interface StationSeed {
  id: string;
  code: string;
  title: string;
  /** sol whose surveyed rover position anchors this station */
  sol: number;
  lon: number;
  lat: number;
  /** elevation reported in the waypoint record, metres */
  surveyedElevM: number;
  targetMineral: string;
  whyItMatters: string;
  taskMinutes: number;
  camera: string;
}

const SEEDS: StationSeed[] = [
  {
    id: 'wp-01',
    code: 'GT-01',
    title: 'Glen Torridon — clay-bearing unit',
    sol: 2300,
    lon: 137.37957,
    lat: -4.72927,
    surveyedElevM: -4140.06,
    targetMineral: 'Smectite clay (phyllosilicate)',
    whyItMatters:
      'Clay minerals only form in water that sat around long enough to alter rock. This unit is the ' +
      'strongest evidence in the whole AOI that lower Mount Sharp was once habitable, and it is the ' +
      'base of the section everything above is measured against.',
    taskMinutes: 35,
    camera: 'Mastcam mosaic, 34 mm, documenting the clay-bearing bedrock fabric',
  },
  {
    id: 'wp-02',
    code: 'GP-02',
    title: 'Greenheugh Pediment',
    sol: 2700,
    lon: 137.38084,
    lat: -4.73705,
    surveyedElevM: -4088.78,
    targetMineral: 'Sandstone caprock over the clay unit',
    whyItMatters:
      'An erosional surface that cuts across older layers and is then capped by younger sandstone. ' +
      'It dates a pause in deposition: the mound was being worn down here before it was buried again. ' +
      'Sampling the contact brackets how long that pause lasted.',
    taskMinutes: 30,
    camera: 'Navcam stereo pair documenting the pediment contact',
  },
  {
    id: 'wp-03',
    code: 'SU-03',
    title: 'Sulfate-bearing unit',
    sol: 3504,
    lon: 137.3965,
    lat: -4.75549,
    surveyedElevM: -3912.77,
    targetMineral: 'Mg/Ca sulfate',
    whyItMatters:
      'Sulfates precipitate as water dries up. Crossing from clay below into sulfate here records the ' +
      'single biggest climate change in Gale’s history: the transition from standing water to a ' +
      'desert. This is the drill target that dates it.',
    taskMinutes: 45,
    camera: 'Mastcam 100 mm, sulfate-bearing layers with scale bar',
  },
  {
    id: 'wp-04',
    code: 'GV-04',
    title: 'Gediz Vallis Ridge',
    sol: 3899,
    lon: 137.39911,
    lat: -4.77037,
    surveyedElevM: -3798.41,
    targetMineral: 'Transported boulders, mixed provenance',
    whyItMatters:
      'A ridge of debris carried down from high on Mount Sharp. The blocks in it come from units the ' +
      'rover can never drive to, so this is the only place to sample the upper mound at ground level — ' +
      'and the deposit itself argues for violent, water-driven flows long after the lake dried.',
    taskMinutes: 40,
    camera: 'Mastcam mosaic of the ridge crest, clast survey',
  },
  {
    id: 'wp-05',
    code: 'GV-05',
    title: 'Gediz Vallis Channel',
    sol: 4301,
    lon: 137.40842,
    lat: -4.78756,
    surveyedElevM: -3679.04,
    targetMineral: 'Channel fill, possible sulfur-bearing stones',
    whyItMatters:
      'The channel the ridge debris came down. Whether it was cut by water or by dry landslides is still ' +
      'open, and the answer changes how late Mars stayed wet. The fill at the channel floor is where that ' +
      'question gets settled.',
    taskMinutes: 40,
    camera: 'Navcam panorama from the channel floor, plus close-up imaging',
  },
  {
    id: 'wp-06',
    code: 'BX-06',
    title: 'Boxwork region',
    sol: 4893,
    lon: 137.38158,
    lat: -4.8144,
    surveyedElevM: -3569.59,
    targetMineral: 'Vein-filling sulfate in a polygonal network',
    whyItMatters:
      'Polygonal ridges of mineral veins left by groundwater moving through fractures, the terrain ' +
      'Curiosity has been working through in 2025. The network records water circulating underground ' +
      'well after the surface had dried — the last chapter of habitability here.',
    taskMinutes: 45,
    camera: 'Mastcam mosaic across a boxwork junction',
  },
];

function position(seed: StationSeed): LocalPoint {
  return latLonToLocal(seed.lat, seed.lon);
}

let cache: SciencePoint[] | null = null;

export function getSciencePoints(): SciencePoint[] {
  if (cache) return cache;
  cache = SEEDS.map((s) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    position: position(s),
    targetMineral: s.targetMineral,
    whyItMatters: s.whyItMatters,
    taskMinutes: s.taskMinutes,
    sol: s.sol,
    surveyedElevM: s.surveyedElevM,
    groundViewSlot: {
      caption: s.camera,
      pending: `Awaiting Curiosity raw frame near sol ${s.sol}`,
    },
  }));
  return cache;
}

/** Back-compat name used across the UI. */
export const SCIENCE_POINTS_SEEDS = SEEDS;

export function getHabitat(): LocalPoint {
  return getTerrain().habitat;
}

export function getHabitatRationale(): string {
  return getTerrain().habitatRationale;
}

export const MISSION = {
  designator: 'EVA-214',
  campaign: 'Lower Mount Sharp Traverse Campaign, Surface Phase C',
  objective:
    'Walk the stratigraphic section Curiosity drove: sample the clay-bearing unit at the base, the ' +
    'sulfate unit that records the drying of Gale, and the Gediz Vallis deposits that argue for water ' +
    'returning long afterwards. Six stations, ordered up-slope.',
  crew: [
    {
      callsign: 'EV1',
      role: 'Field geologist / lead',
      suit: 'xEMU-M s/n 0007',
      notes: 'Carries the drill and the sample caddy. Sets the pace.',
    },
    {
      callsign: 'EV2',
      role: 'Suit systems / documentation',
      suit: 'xEMU-M s/n 0011',
      notes: 'Runs consumables bookkeeping, stereo imaging and the comms relay check.',
    },
  ],
  roverSupport: {
    name: 'LTV-2 "Tharsis"',
    kind: 'Unpressurised rover',
    detail:
      'Shadows the traverse on the lower bench and stages forward at the sulfate unit. Counts as a ' +
      'safe haven for walk-back purposes when rover support is committed.',
  },
  habitatName: 'Hab Module 1 "Gale Base"',
} as const;
